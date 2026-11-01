import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { copyToPublicBucket } from "@/lib/storage";
import { getWhatsAppEnv } from "../env";
import { mimeFromStorageKey } from "../media";
import {
  ACTIVE_INTAKE_STATUSES,
  IntakeError,
  confirmBrief,
  transitionIntake,
  updateBriefDraft,
} from "../intake";
import { getBriefConfig, imageTargetFields, type BriefDraft, type BriefKey } from "./brief-schema";

// Tools AI untuk intake (docs/WHATSAPP_AI_CHATBOT.md §10.5). Model hanya menulis
// ke draft intake milik percakapan ini; konteks (conversationId) datang dari server,
// bukan dari input model.

export type ToolContext = {
  conversationId: string;
};

export type ToolOutcome = { content: string; isError: boolean };

const ok = (data: unknown): ToolOutcome => ({ content: JSON.stringify(data), isError: false });
const fail = (message: string, details?: unknown): ToolOutcome => ({
  content: JSON.stringify(details ? { error: message, ...(details as object) } : { error: message }),
  isError: true,
});

export const INTAKE_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_services",
    description: "Daftar layanan desain yang aktif (kode, nama, deskripsi, format output). Tidak berisi harga.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "start_intake",
    description:
      "Mulai order baru dengan layanan tertentu, atau ganti layanan order yang masih dalam tahap pengumpulan brief. Jika mengganti layanan dan brief sudah terisi, brief dikosongkan: tanyakan klien dulu, lalu panggil lagi dengan confirm_reset=true.",
    input_schema: {
      type: "object",
      properties: {
        service_code: { type: "string", description: "Kode layanan dari list_services, mis. SVC-01" },
        confirm_reset: { type: "boolean", description: "true jika klien sudah setuju brief lama dikosongkan" },
      },
      required: ["service_code"],
      additionalProperties: false,
    },
  },
  {
    name: "update_brief_draft",
    description:
      "Simpan jawaban brief klien. Kunci field harus salah satu yang tercantum di STATE. Nilai null menghapus field. Mengembalikan field wajib yang masih kosong.",
    input_schema: {
      type: "object",
      properties: {
        fields: { type: "object", description: "Objek {kunci_field: nilai}" },
      },
      required: ["fields"],
      additionalProperties: false,
    },
  },
  {
    name: "attach_image_to_brief",
    description:
      "Masukkan gambar dari klien ke brief (referensi/logo). message_id harus dari STATE, target harus salah satu target gambar di STATE.",
    input_schema: {
      type: "object",
      properties: {
        message_id: { type: "string" },
        target: { type: "string" },
        caption: { type: "string", description: "Deskripsi singkat isi gambar, atau keterangan dari klien" },
      },
      required: ["message_id", "target", "caption"],
      additionalProperties: false,
    },
  },
  {
    name: "set_client_profile",
    description: "Simpan nama klien (wajib) dan email (opsional) untuk order ini.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" }, email: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "confirm_brief",
    description:
      "Tandai brief sudah dikonfirmasi klien. Panggil HANYA setelah kamu mengirim ringkasan dan klien menjawab setuju secara eksplisit.",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string", description: "Ringkasan brief yang disetujui klien" } },
      required: ["summary"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_intake",
    description: "Batalkan order aktif atas permintaan klien (hanya sebelum bukti transfer dikirim).",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "request_human_handoff",
    description:
      "Alihkan percakapan ke admin manusia: klien minta admin, menawar/keberatan harga, atau kamu tidak bisa membantu. Setelah ini bot berhenti membalas.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

const inputs = {
  list_services: z.object({}),
  start_intake: z.object({ service_code: z.string().trim().min(1), confirm_reset: z.boolean().optional() }),
  update_brief_draft: z.object({ fields: z.record(z.string(), z.unknown()) }),
  attach_image_to_brief: z.object({
    message_id: z.string().min(1),
    target: z.string().min(1),
    caption: z.string().trim().max(500),
  }),
  set_client_profile: z.object({
    name: z.string().trim().min(1).max(100),
    email: z.email().max(200).optional().or(z.literal("").transform(() => undefined)),
  }),
  confirm_brief: z.object({ summary: z.string().trim().min(1).max(3000) }),
  cancel_intake: z.object({ reason: z.string().trim().min(1).max(500) }),
  request_human_handoff: z.object({ reason: z.string().trim().min(1).max(500) }),
} satisfies Record<string, z.ZodType>;

type ToolName = keyof typeof inputs;

export function findActiveIntake(conversationId: string, db: Prisma.TransactionClient = prisma) {
  return db.waIntake.findFirst({
    where: { conversationId, status: { in: ACTIVE_INTAKE_STATUSES } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      briefDraft: true,
      service: { select: { id: true, code: true } },
    },
  });
}

async function requireActiveIntake(ctx: ToolContext) {
  const intake = await findActiveIntake(ctx.conversationId);
  if (!intake) throw new IntakeError("NOT_FOUND", "Belum ada order aktif. Gunakan start_intake dulu.");
  return intake;
}

const handlers: { [K in ToolName]: (ctx: ToolContext, input: z.infer<(typeof inputs)[K]>) => Promise<ToolOutcome> } = {
  async list_services() {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      select: { code: true, name: true, description: true, outputFormat: true },
      orderBy: { code: "asc" },
    });
    // Hanya layanan yang punya konfigurasi brief yang bisa dipesan lewat WA.
    return ok({ services: services.filter((s) => getBriefConfig(s.code)) });
  },

  async start_intake(ctx, input) {
    const service = await prisma.service.findFirst({
      where: { code: input.service_code, isActive: true },
      select: { id: true, code: true, name: true },
    });
    if (!service || !getBriefConfig(service.code)) return fail("Kode layanan tidak dikenal");

    // Kunci baris percakapan: dua pesan bersamaan tidak boleh membuat dua intake aktif.
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM wa_conversations WHERE id = ${ctx.conversationId} FOR UPDATE`;
      const active = await findActiveIntake(ctx.conversationId, tx);

      if (!active) {
        const created = await tx.waIntake.create({
          data: { conversationId: ctx.conversationId, serviceId: service.id },
          select: { id: true },
        });
        return ok({ started: true, intakeId: created.id, service: service.name });
      }

      if (active.status !== "COLLECTING") {
        return fail("Sudah ada order aktif yang tidak bisa diganti layanannya", { status: active.status });
      }
      if (active.service?.id === service.id) return ok({ started: false, unchanged: true, service: service.name });

      const hasDraft = Object.keys((active.briefDraft as BriefDraft) ?? {}).length > 0;
      if (hasDraft && !input.confirm_reset) {
        return ok({
          needsConfirmation: true,
          message: "Brief yang sudah terisi akan dikosongkan. Tanyakan klien, lalu panggil lagi dengan confirm_reset=true.",
        });
      }
      const { count } = await tx.waIntake.updateMany({
        where: { id: active.id, status: "COLLECTING" },
        data: { serviceId: service.id, briefDraft: {} },
      });
      if (count === 0) return fail("Status order sudah berubah");
      return ok({ started: false, serviceChanged: true, service: service.name });
    });
  },

  async update_brief_draft(ctx, input) {
    const intake = await requireActiveIntake(ctx);
    const result = await updateBriefDraft(prisma, { intakeId: intake.id, fields: input.fields, source: "AI" });
    return ok(result);
  },

  async attach_image_to_brief(ctx, input) {
    const intake = await requireActiveIntake(ctx);
    const serviceCode = intake.service?.code;
    if (!serviceCode) return fail("Layanan belum dipilih");

    const target = input.target as BriefKey;
    if (!imageTargetFields(serviceCode).includes(target)) {
      return fail("Target gambar tidak berlaku untuk layanan ini", { validTargets: imageTargetFields(serviceCode) });
    }

    // messageId harus gambar milik percakapan ini yang sudah tersimpan di storage privat.
    const message = await prisma.waMessage.findFirst({
      where: { id: input.message_id, conversationId: ctx.conversationId, direction: "INBOUND", type: "image" },
      select: { id: true, mediaStorageKey: true },
    });
    if (!message?.mediaStorageKey) return fail("Gambar tidak ditemukan di percakapan ini");

    const itemId = `wa-${message.id}`;
    const draft = (intake.briefDraft as BriefDraft) ?? {};
    const existing = draft[target];
    if (Array.isArray(existing) && existing.some((i) => (i as { id?: string }).id === itemId)) {
      return ok({ attached: true, alreadyAttached: true });
    }

    const ext = message.mediaStorageKey.split(".").pop() ?? "jpg";
    const contentType = mimeFromStorageKey(message.mediaStorageKey);
    const url = await copyToPublicBucket(
      getWhatsAppEnv().STORAGE_PRIVATE_BUCKET,
      message.mediaStorageKey,
      `wa-intake/${intake.id}/${message.id}.${ext}`,
      contentType,
    );
    if (!url) return fail("Storage publik belum dikonfigurasi");

    // Bentuk item sama dengan yang ditulis ServiceBriefForm.
    const caption = input.caption;
    const list = Array.isArray(existing) ? existing : [];
    const value: Record<string, unknown> = {
      reference_items_json: [...list, { id: itemId, type: "image", url, caption }],
      logos_json: [...list, { url, caption }],
      box_references_json: [...list, { id: itemId, description: caption, imageUrl: url }],
      cart_references_json: [...list, { id: itemId, imageUrl: url, description: caption }],
      vendor_logo_url: url,
      brand_logo_url: url,
    };

    const result = await updateBriefDraft(prisma, {
      intakeId: intake.id,
      fields: { [target]: value[target] },
      source: "AI_ATTACHMENT",
    });
    return ok({ attached: true, target, ...result });
  },

  async set_client_profile(ctx, input) {
    const intake = await requireActiveIntake(ctx);
    await prisma.waIntake.update({
      where: { id: intake.id },
      data: { clientName: input.name, clientEmail: input.email ?? null },
    });
    return ok({ saved: true });
  },

  async confirm_brief(ctx, input) {
    const intake = await requireActiveIntake(ctx);
    const status = await confirmBrief(prisma, { intakeId: intake.id, summary: input.summary });
    return ok({ status, message: "Brief tersimpan. Beri tahu klien bahwa tim akan mengirim harga dan estimasi." });
  },

  async cancel_intake(ctx, input) {
    const intake = await requireActiveIntake(ctx);
    const status = await transitionIntake(prisma, {
      intakeId: intake.id,
      from: intake.status,
      action: "cancel",
      actor: "AI",
      data: { cancelReason: input.reason },
    });
    return ok({ status });
  },

  async request_human_handoff(ctx) {
    await prisma.waConversation.update({ where: { id: ctx.conversationId }, data: { mode: "HUMAN" } });
    return ok({
      handedOff: true,
      message: "Percakapan dialihkan ke admin. Beri tahu klien bahwa admin akan membalas secepatnya.",
    });
  },
};

/** Jalankan satu tool call dari model. Error validasi/aturan dikembalikan ke model, bukan dilempar. */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  if (!(name in inputs)) return fail(`Tool ${name} tidak tersedia`);
  const toolName = name as ToolName;
  const parsed = inputs[toolName].safeParse(rawInput);
  if (!parsed.success) {
    return fail("Input tool tidak valid", { issues: parsed.error.issues.map((i) => i.path.join(".") || i.message) });
  }
  try {
    const handler = handlers[toolName] as (c: ToolContext, i: unknown) => Promise<ToolOutcome>;
    return await handler(ctx, parsed.data);
  } catch (error) {
    if (error instanceof IntakeError) return fail(error.message, error.details);
    throw error;
  }
}
