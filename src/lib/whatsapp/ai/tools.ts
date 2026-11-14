import { callAdmin } from "../handoff";
import { notifyDpProof, notifyNeedsQuote } from "@/lib/notifications/owner-events";
import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { copyToPublicBucket } from "@/lib/storage";
import { getPrivateBucket } from "../env";
import { mimeFromStorageKey, movePrivateMedia, readPrivateMedia } from "../media";
import { WA_MAX_FAILED_LOOKUPS_PER_HOUR, WA_MAX_PAYMENT_PROOFS_PER_INTAKE } from "@/lib/constants";
import { getAiTargets } from "./ai-config";
import { getClientProjectSummaries, getProjectDetailByCode } from "./client-safe-dto";
import { findClientsByPhone } from "@/lib/clients/find-by-phone";
import { getStudioSettings } from "@/lib/studio";
import { computeProofFlags, extractPaymentProof, type PaymentExtraction } from "./extract-payment-proof";
import {
  ACTIVE_INTAKE_STATUSES,
  IntakeError,
  confirmBrief,
  transitionIntake,
  updateBriefDraft,
} from "../intake";
import { calculatePrice } from "@/lib/services/price-calculator";
import { BOT_SERVICE_SELECT, toBotService } from "./service-catalog";
import { getBriefConfig, imageTargetFields, type BriefDraft, type BriefKey } from "./brief-schema";
import { WA_OWNER } from "@/lib/constants";
import { getDraftGuide, getPublishedGuide } from "./bot-guide";
import { listOwnerNumbers } from "../owner/identity";
import { createOwnerQuery, findPendingQuery, notifyOwners } from "../owner/query-store";
import { addClientBriefNote, attachImageToProjectBrief } from "../brief-notes";

// Tools AI untuk intake (docs/WHATSAPP_AI_CHATBOT.md §10.5). Model hanya menulis
// ke draft intake milik percakapan ini; konteks (conversationId) datang dari server,
// bukan dari input model.

export type ToolContext = {
  conversationId: string;
  // Uji bot: panduan draft, pertanyaan ke owner tidak dikirim ke WhatsApp
  isSandbox?: boolean;
  // Total hasil calculate_price pada giliran ini: penjaga harga meloloskan angka ini (spec §4.3).
  calculatedTotals?: number[];
  calculatedBreakdowns?: string[];
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
    description:
      "Daftar layanan desain yang aktif: kode, nama, deskripsi, format output, harga mulai, catatan harga, cocok untuk. Harga mulai bukan harga final.",
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
    name: "add_brief_note",
    description:
      "Catat permintaan klien sebagai Catatan Tambahan Klien di brief: (1) permintaan yang tidak punya field brief (mis. kenaikan harga menu, bentuk cup, catatan tampilan), kapan saja selama order aktif; (2) tambahan setelah brief dikunci (invoice dikirim, bukti DP dicek, atau order dikerjakan dan hasil akhir belum dikirim). Untuk field yang ada di brief, pakai update_brief_draft. Tulis dengan kata-kata klien.",
    input_schema: {
      type: "object",
      properties: { note: { type: "string", description: "Tambahan dari klien, mis. tulis 12k di sebelah tiap rasa" } },
      required: ["note"],
      additionalProperties: false,
    },
  },
  {
    name: "attach_image_to_brief",
    description:
      "Masukkan gambar dari klien ke brief (referensi/logo). message_id harus dari STATE, target harus salah satu target gambar di STATE. Tanpa order aktif, gambar masuk referensi brief project yang sedang dikerjakan (target reference_items_json).",
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
    name: "submit_payment_proof",
    description:
      "Kirim gambar bukti transfer DP dari klien untuk dicek tim. Hanya saat status QUOTED dan gambar terlihat seperti bukti transfer. message_id dari STATE.",
    input_schema: {
      type: "object",
      properties: { message_id: { type: "string" } },
      required: ["message_id"],
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
    name: "get_my_projects",
    description:
      "Daftar project milik klien yang nomornya terdaftar (maks. 5 terbaru): kode, layanan, status, deadline. Untuk pertanyaan status project.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_project_by_code",
    description:
      "Status detail satu project berdasarkan kode project yang disebut klien (mis. PRJ-20261101-ABC123). Kode salah dibatasi beberapa kali per jam.",
    input_schema: {
      type: "object",
      properties: { project_code: { type: "string" } },
      required: ["project_code"],
      additionalProperties: false,
    },
  },
  {
    name: "get_studio_info",
    description: "Nama, email, telepon, dan alamat studio.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "calculate_price",
    description:
      "Hitung harga SATU layanan dari katalog (server): paket yang dipilih dan/atau jumlah item, halaman, varian, atau pose. Satu-satunya sumber angka total untuk klien. Tidak untuk menjumlahkan beberapa layanan, diskon, atau express: itu lewat ask_owner/admin.",
    input_schema: {
      type: "object",
      properties: {
        service_code: { type: "string", description: "Kode layanan dari list_services, mis. SVC-08" },
        package: { type: "string", description: "Nama paket persis dari list_services, bila layanan punya paket" },
        units: { type: "integer", description: "Jumlah satuan (item/halaman/varian/pose) bila layanan dihitung per satuan" },
      },
      required: ["service_code"],
      additionalProperties: false,
    },
  },
  {
    name: "ask_owner",
    description:
      "Tanyakan ke owner studio: permintaan klien yang TIDAK ada di list_services, harga/fasilitas yang belum tercantum, permintaan rekomendasi konsep, atau status order lama yang tidak ada di sistem. Jawaban owner datang belakangan lewat STATE.",
    input_schema: {
      type: "object",
      properties: {
        request: {
          type: "string",
          description: "Ringkasan permintaan klien untuk owner: jenis desain, jumlah, kebutuhan khusus. Tanpa data pribadi selain nama.",
        },
      },
      required: ["request"],
      additionalProperties: false,
    },
  },
  {
    name: "apply_pricing_rule",
    description:
      "Catat aturan harga owner (id dari bagian Aturan harga di panduan) untuk order ini, supaya tim menerapkannya di penawaran. remove=true untuk membatalkan.",
    input_schema: {
      type: "object",
      properties: {
        rule_id: { type: "string" },
        remove: { type: "boolean" },
        note: { type: "string", description: "Alasan syarat terpenuhi, mis. klien pesan 8 desain" },
      },
      required: ["rule_id"],
      additionalProperties: false,
    },
  },
  {
    name: "request_human_handoff",
    description:
      "Panggil admin manusia: klien minta admin, menawar/keberatan harga, atau kamu tidak bisa membantu. Admin dikabari lewat notifikasi; chat tetap kamu layani sampai admin membalas sendiri.",
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
  add_brief_note: z.object({ note: z.string().trim().min(1).max(1000) }),
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
  submit_payment_proof: z.object({ message_id: z.string().min(1) }),
  cancel_intake: z.object({ reason: z.string().trim().min(1).max(500) }),
  request_human_handoff: z.object({ reason: z.string().trim().min(1).max(500) }),
  get_my_projects: z.object({}),
  get_project_by_code: z.object({ project_code: z.string().trim().min(1).max(40) }),
  get_studio_info: z.object({}),
  calculate_price: z.object({
    service_code: z.string().trim().min(1),
    package: z.string().trim().max(60).optional(),
    units: z.number().optional(),
  }),
  ask_owner: z.object({ request: z.string().trim().min(1).max(800) }),
  apply_pricing_rule: z.object({
    rule_id: z.string().trim().min(1).max(40),
    remove: z.boolean().optional(),
    note: z.string().trim().max(300).optional(),
  }),
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
      pricingRulesApplied: true,
      createdAt: true,
      quotedAt: true,
      agreedPrice: true,
      dpAmount: true,
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
      // Tanpa botNotes: catatan internal hanya masuk STATE dengan label "jangan dikutip".
      select: {
        code: true,
        name: true,
        description: true,
        outputFormat: true,
        startingPrice: true,
        priceNote: true,
        suitableFor: true,
        priceMode: true,
        packages: true,
        unitPricing: true,
        estimate: true,
      },
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
    // STATE giliran ini dibuat sebelum order ada: beri tahu target gambar supaya gambar klien yang sudah terkirim
    // bisa langsung dimasukkan ke brief.
    const imageTargets = imageTargetFields(service.code);
    const images = imageTargets.length
      ? { imageTargets, imageNote: "Gambar klien yang sudah dikirim di chat ini: masukkan dengan attach_image_to_brief (messageId dari riwayat)." }
      : {};

    // Kunci baris percakapan: dua pesan bersamaan tidak boleh membuat dua intake aktif.
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM wa_conversations WHERE id = ${ctx.conversationId} FOR UPDATE`;
      const active = await findActiveIntake(ctx.conversationId, tx);

      if (!active) {
        const created = await tx.waIntake.create({
          data: { conversationId: ctx.conversationId, serviceId: service.id },
          select: { id: true },
        });
        return ok({ started: true, intakeId: created.id, service: service.name, ...images });
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
      return ok({ started: false, serviceChanged: true, service: service.name, ...images });
    });
  },

  async update_brief_draft(ctx, input) {
    const intake = await requireActiveIntake(ctx);
    const result = await updateBriefDraft(prisma, { intakeId: intake.id, fields: input.fields, source: "AI" });
    return ok(result);
  },

  async add_brief_note(ctx, input) {
    const result = await addClientBriefNote(ctx.conversationId, input.note);
    return result.ok ? ok({ ...result, message: "Tambahan sudah masuk brief; konfirmasi singkat ke klien (mis. \"Siap kak, sudah saya catat ya\") tanpa mengulang isinya." }) : fail(result.error);
  },

  async attach_image_to_brief(ctx, input) {
    const intake = await findActiveIntake(ctx.conversationId);
    // Tanpa order aktif: gambar referensi untuk project yang sedang dikerjakan (Yeni 13 Nov), target selalu referensi.
    if (!intake) {
      const result = await attachImageToProjectBrief(ctx.conversationId, input.message_id, input.caption);
      return result.ok
        ? ok({ ...result, attached: true, message: "Gambar masuk referensi brief project dan terlihat oleh desainer; konfirmasi singkat ke klien tanpa mengulang isinya." })
        : fail(result.error);
    }
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
      getPrivateBucket(),
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
    if (status === "AWAITING_QUOTE") void notifyNeedsQuote(ctx.conversationId);
    return ok({ status, message: "Brief tersimpan. Beri tahu klien bahwa tim akan mengirim harga dan estimasi." });
  },

  async submit_payment_proof(ctx, input) {
    const intake = await requireActiveIntake(ctx);
    if (intake.status !== "QUOTED") {
      return fail("Bukti transfer hanya bisa dikirim setelah tim memberi harga dan sebelum dicek", {
        status: intake.status,
      });
    }

    const message = await prisma.waMessage.findFirst({
      where: { id: input.message_id, conversationId: ctx.conversationId, direction: "INBOUND", type: "image" },
      select: { id: true, mediaStorageKey: true },
    });
    if (!message?.mediaStorageKey) return fail("Gambar tidak ditemukan di percakapan ini");

    const quote = await prisma.waIntake.findUniqueOrThrow({
      where: { id: intake.id },
      select: { agreedPrice: true, dpAmount: true, quotedAt: true, _count: { select: { paymentProofs: true } } },
    });
    if (quote.agreedPrice === null || quote.dpAmount === null) return fail("Harga order belum lengkap");

    if (quote._count.paymentProofs >= WA_MAX_PAYMENT_PROOFS_PER_INTAKE) {
      callAdmin(ctx.conversationId, "proof_limit");
      return ok({
        adminCalled: true,
        message: "Batas pengiriman bukti tercapai. Admin sudah dikabari; beri tahu klien bahwa admin akan membantu langsung.",
      });
    }

    const data = await readPrivateMedia(message.mediaStorageKey);
    const mimeType = mimeFromStorageKey(message.mediaStorageKey);
    const imageSha256 = createHash("sha256").update(data).digest("hex");

    const resent = await prisma.paymentProof.findFirst({
      where: { intakeId: intake.id, imageSha256 },
      select: { id: true },
    });
    if (resent) return fail("Gambar ini sudah pernah dikirim untuk order ini. Minta klien mengirim bukti transfer yang baru.");

    // Bukti transfer tetap di bucket privat, dipindah ke prefix khusus (§16).
    const ext = message.mediaStorageKey.split(".").pop() ?? "jpg";
    const storageKey = `payment-proofs/${intake.id}/${randomBytes(16).toString("hex")}.${ext}`;
    await movePrivateMedia(message.mediaStorageKey, storageKey);
    await prisma.waMessage.update({ where: { id: message.id }, data: { mediaStorageKey: storageKey } });

    // Gagal membaca bukan alasan menolak bukti: admin tetap bisa mengecek manual.
    let extraction: PaymentExtraction | null = null;
    try {
      extraction = await extractPaymentProof({ data, mimeType }, (await getAiTargets()).proof);
    } catch (error) {
      const status = (error as { status?: number }).status;
      console.error(`[whatsapp] ekstraksi bukti transfer gagal: ${status ? `api_${status}` : (error as Error).name}`);
    }

    const [duplicateImage, duplicateReference, paymentAccounts] = await Promise.all([
      prisma.paymentProof.count({ where: { imageSha256 } }).then((n) => n > 0),
      extraction?.referenceNo
        ? prisma.paymentProof
            .count({ where: { aiExtraction: { path: ["referenceNo"], equals: extraction.referenceNo } } })
            .then((n) => n > 0)
        : Promise.resolve(false),
      prisma.paymentAccount.findMany({
        where: { isActive: true },
        select: { accountNumber: true, accountHolder: true },
      }),
    ]);

    const aiFlags = computeProofFlags(extraction, {
      dpAmount: quote.dpAmount,
      agreedPrice: quote.agreedPrice,
      quotedAt: quote.quotedAt,
      paymentAccounts,
      duplicateImage,
      duplicateReference,
    });

    await prisma.$transaction(async (tx) => {
      await tx.paymentProof.create({
        data: {
          intakeId: intake.id,
          storageKey,
          mimeType,
          imageSha256,
          aiExtraction: extraction ?? Prisma.JsonNull,
          aiFlags,
        },
      });
      await transitionIntake(tx, { intakeId: intake.id, from: "QUOTED", action: "submit_proof", actor: "AI" });
    });
    void notifyDpProof(ctx.conversationId);

    // Flag hanya untuk admin; tidak dikirim ke model maupun klien.
    return ok({
      status: "DP_REVIEW",
      message: 'Bukti diterima. Beri tahu klien: "Bukti sudah kami terima, sedang dicek tim kami." Jangan bilang DP valid.',
    });
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

  // ---- Read-only status project (§10.5, §14) ----

  async get_my_projects(ctx) {
    const conversation = await prisma.waConversation.findUniqueOrThrow({
      where: { id: ctx.conversationId },
      select: { waId: true, clientId: true },
    });
    let clientId = conversation.clientId;
    if (!clientId) {
      // Identifikasi lewat nomor; lebih dari satu Client yang cocok → tidak dipilih (§15).
      const matches = await findClientsByPhone(prisma, conversation.waId);
      if (matches.length !== 1) {
        return ok({ identified: false, message: "Nomor ini belum terhubung ke project. Minta kode project dari klien." });
      }
      clientId = matches[0].id;
      await prisma.waConversation.update({ where: { id: ctx.conversationId }, data: { clientId } });
    }
    return ok({ identified: true, projects: await getClientProjectSummaries(clientId) });
  },

  async get_project_by_code(ctx, input) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const failed = await prisma.waLookupAttempt.count({
      where: { conversationId: ctx.conversationId, success: false, createdAt: { gte: since } },
    });
    if (failed >= WA_MAX_FAILED_LOOKUPS_PER_HOUR) {
      return fail("Terlalu banyak kode yang salah. Minta klien mencoba lagi nanti atau menghubungi admin.");
    }

    const project = await getProjectDetailByCode(input.project_code);
    await prisma.waLookupAttempt.create({ data: { conversationId: ctx.conversationId, success: !!project } });
    if (!project) return fail("Kode project tidak ditemukan. Minta klien memeriksa kodenya.");
    return ok({ project });
  },

  async get_studio_info() {
    const studio = await getStudioSettings();
    return ok({ name: studio.name, email: studio.email, phone: studio.phone, address: studio.address });
  },

  async calculate_price(ctx, input) {
    const row = await prisma.service.findFirst({
      where: { code: input.service_code, isActive: true },
      select: BOT_SERVICE_SELECT,
    });
    if (!row || !getBriefConfig(row.code)) return fail("Kode layanan tidak dikenal");
    const service = toBotService(row);
    const result = calculatePrice(service, { packageName: input.package, units: input.units });
    if (!result.ok) return fail(result.error);
    ctx.calculatedTotals?.push(result.total);
    ctx.calculatedBreakdowns?.push(result.breakdown);
    return ok({ total: result.total, breakdown: result.breakdown, priceMode: service.priceMode });
  },

  async ask_owner(ctx, input) {
    if (await findPendingQuery(ctx.conversationId)) {
      return ok({ alreadyWaiting: true, message: "Masih menunggu jawaban tim untuk permintaan sebelumnya. Minta klien menunggu." });
    }
    if (!ctx.isSandbox && (await listOwnerNumbers()).length === 0) {
      return fail("Tim belum bisa dihubungi otomatis. Gunakan request_human_handoff.");
    }
    const intake = await findActiveIntake(ctx.conversationId);
    const query = await createOwnerQuery({ conversationId: ctx.conversationId, intakeId: intake?.id ?? null, question: input.request });
    if (!ctx.isSandbox && (await notifyOwners(query.id)) === 0) {
      await prisma.waOwnerQuery.update({ where: { id: query.id }, data: { status: "EXPIRED" } });
      return fail("Pertanyaan gagal dikirim ke tim. Gunakan request_human_handoff.");
    }
    return ok({
      asked: true,
      message: `Pertanyaan dikirim ke tim. Beri tahu klien bahwa tim sedang mengecek dan akan mengabari (paling lama ${WA_OWNER.queryTtlHours} jam). Jangan menjanjikan apa pun soal permintaan ini.`,
    });
  },

  async apply_pricing_rule(ctx, input) {
    const intake = await requireActiveIntake(ctx);
    if (intake.status !== "COLLECTING" && intake.status !== "AWAITING_QUOTE") {
      return fail("Aturan harga hanya bisa dicatat sebelum tim mengirim penawaran");
    }
    const guide = ctx.isSandbox ? await getDraftGuide() : (await getPublishedGuide())?.guide;
    const rule = guide?.pricingRules.find((r) => r.id === input.rule_id);
    if (!rule) return fail("Aturan harga tidak dikenal");

    const current = Array.isArray(intake.pricingRulesApplied)
      ? (intake.pricingRulesApplied as { ruleId: string }[])
      : [];
    const others = current.filter((r) => r.ruleId !== rule.id);
    const next = input.remove
      ? others
      : [
          ...others,
          {
            ruleId: rule.id,
            kind: rule.kind,
            name: rule.name,
            condition: rule.condition,
            amountType: rule.amountType,
            amount: rule.amount,
            note: input.note ?? null,
          },
        ];
    await prisma.waIntake.update({ where: { id: intake.id }, data: { pricingRulesApplied: next as Prisma.InputJsonValue } });
    return ok({
      recorded: !input.remove,
      rule: rule.name,
      message: "Tercatat untuk tim. Harga akhir tetap dari penawaran tim; jangan menghitung total.",
    });
  },

  async request_human_handoff(ctx) {
    // Keputusan owner 2026-11-13: admin dipanggil, chat tidak dipindah; mode admin hanya bila admin membalas sendiri.
    callAdmin(ctx.conversationId, "bot_handoff");
    return ok({
      adminCalled: true,
      message:
        "Admin sudah dikabari dan akan membalas langsung di chat ini. Sampaikan ke klien dengan singkat. Chat tetap kamu layani sampai admin membalas: bantu hal lain, jangan bernegosiasi atau menjanjikan hal yang diminta.",
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
