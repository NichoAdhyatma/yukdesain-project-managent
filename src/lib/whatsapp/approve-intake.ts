import type { AttachmentCategory, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPublicUrl } from "@/lib/storage";
import { briefResponsesToEntries } from "@/lib/brief/responses";
import { generateClientLinkToken } from "@/lib/client-link-token";
import { createProject } from "@/lib/projects/create-project";
import { findClientsByPhone } from "@/lib/clients/find-by-phone";
import { computePaymentStatus } from "@/lib/payments/record-payment";
import { IntakeError, transitionIntake } from "./intake";
import type { BriefDraft } from "./ai/brief-schema";

// Approve DP order WhatsApp → project lengkap dalam satu transaksi
// (docs/WHATSAPP_AI_CHATBOT.md §12.4). Pengiriman pesan ke klien dilakukan pemanggil
// SETELAH transaksi commit, supaya kegagalan kirim tidak membatalkan project.

// Checklist wajib, divalidasi ulang di server (§12.2).
export const approveChecklistSchema = z.object({
  fundsReceived: z.literal(true, { error: "Konfirmasi dana sudah masuk di mutasi rekening" }),
  amountMatches: z.literal(true, { error: "Konfirmasi nominal sesuai" }),
  briefReviewed: z.literal(true, { error: "Konfirmasi brief sudah dibaca" }),
});

export type ApproveInput = {
  intakeId: string;
  proofId: string;
  verifiedAmount: number;
  actorId: string;
};

export type ApproveResult = {
  conversationId: string;
  clientName: string;
  project: { id: string; projectNumber: string };
  clientLinkToken: string;
};

const WHATSAPP_UPLOADER = "whatsapp";

const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const mimeOf = (key: string) => EXT_MIME[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/** URL publik gambar brief → storageKey di bucket publik (null jika bukan file kita). */
function storageKeyFromUrl(url: string): string | null {
  const probe = getPublicUrl("__key__");
  const base = probe ? probe.slice(0, -"__key__".length) : "";
  if (base && url.startsWith(base)) return url.slice(base.length);
  try {
    const path = new URL(url).pathname.replace(/^\/+/, "");
    return path.startsWith("wa-intake/") ? path : null;
  } catch {
    return null;
  }
}

/** Gambar yang dilampirkan ke brief WA → baris Attachment (bentuk item: brief-schema.ts). */
function briefImages(draft: BriefDraft): { url: string; caption: string | null; category: AttachmentCategory }[] {
  const out: { url: string; caption: string | null; category: AttachmentCategory }[] = [];
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);

  for (const i of list(draft.reference_items_json)) {
    if (i.type === "image" && str(i.url)) out.push({ url: i.url as string, caption: str(i.caption), category: "BRIEF_REFERENCE" });
  }
  for (const i of list(draft.logos_json)) {
    if (str(i.url)) out.push({ url: i.url as string, caption: str(i.caption), category: "LOGO" });
  }
  for (const key of ["box_references_json", "cart_references_json"] as const) {
    for (const i of list(draft[key])) {
      if (str(i.imageUrl)) out.push({ url: i.imageUrl as string, caption: str(i.description), category: "BRIEF_REFERENCE" });
    }
  }
  for (const key of ["vendor_logo_url", "brand_logo_url"] as const) {
    const url = str(draft[key]);
    if (url) out.push({ url, caption: null, category: "LOGO" });
  }
  return out;
}

/**
 * Cari Client lewat nomor WA. Nomor yang cocok dengan lebih dari satu Client tidak
 * dipilih otomatis (§15): buat Client baru.
 */
async function resolveClient(
  tx: Prisma.TransactionClient,
  p: { waId: string; linkedClientId: string | null; name: string; email: string | null },
) {
  if (p.linkedClientId) {
    const linked = await tx.client.findUnique({ where: { id: p.linkedClientId }, select: { id: true, name: true } });
    if (linked) return linked;
  }
  const matches = await findClientsByPhone(tx, p.waId);
  if (matches.length === 1) return matches[0];

  // Simpan dengan phone = waId supaya order berikutnya langsung dikenali.
  return tx.client.create({
    data: { name: p.name, phone: p.waId, email: p.email },
    select: { id: true, name: true },
  });
}

export async function approveIntake(input: ApproveInput): Promise<ApproveResult> {
  return prisma.$transaction(
    async (tx) => {
      // Order dari Uji bot tidak boleh pernah menjadi project (docs/WHATSAPP_BOT_GUIDE.md §5).
      const intake = await tx.waIntake.findFirst({
        where: { id: input.intakeId, conversation: { isSandbox: false } },
        select: {
          status: true,
          serviceId: true,
          clientName: true,
          clientEmail: true,
          agreedPrice: true,
          deadline: true,
          briefDraft: true,
          conversation: { select: { id: true, waId: true, clientId: true, profileName: true } },
        },
      });
      if (!intake) throw new IntakeError("NOT_FOUND", "Order WA tidak ditemukan");
      if (!intake.serviceId || intake.agreedPrice === null || !intake.deadline) {
        throw new IntakeError("UNPROCESSABLE_ENTITY", "Layanan, harga, atau deadline order belum lengkap");
      }
      if (input.verifiedAmount > intake.agreedPrice) {
        throw new IntakeError("VALIDATION_ERROR", "Nominal diterima melebihi harga order", {
          fields: { verifiedAmount: "Tidak boleh melebihi harga" },
        });
      }

      // 1. Kunci: hanya satu approve yang bisa lolos dari DP_REVIEW.
      await transitionIntake(tx, { intakeId: input.intakeId, from: intake.status, action: "approve", actor: "ADMIN" });

      // Bukti harus milik order ini dan belum diperiksa.
      const proof = await tx.paymentProof.findFirst({
        where: { id: input.proofId, intakeId: input.intakeId, status: "PENDING" },
        select: { id: true, storageKey: true, mimeType: true, aiExtraction: true },
      });
      if (!proof) throw new IntakeError("CONFLICT", "Bukti tidak ditemukan atau sudah diperiksa");

      // 2. Client
      const clientName = intake.clientName ?? intake.conversation.profileName ?? "Klien WhatsApp";
      const client = await resolveClient(tx, {
        waId: intake.conversation.waId,
        linkedClientId: intake.conversation.clientId,
        name: clientName,
        email: intake.clientEmail,
      });

      // 3. Project + struk + payment (logika sama dengan POST /api/projects)
      const extraction = (proof.aiExtraction ?? null) as { bankOrWallet?: string | null; referenceNo?: string | null } | null;
      const { project, payment } = await createProject(tx, {
        client,
        serviceId: intake.serviceId,
        ownerId: input.actorId,
        agreedPrice: intake.agreedPrice,
        paidAmount: input.verifiedAmount,
        deadline: intake.deadline,
        notes: "Order via WhatsApp",
        // Brief sudah ada → langsung siap dikerjakan (sama dengan setelah brief submit di alur lama)
        status: "BELUM_DIKERJAKAN",
        // Keputusan owner: dicatat sesuai nominal diterima; lunas → PAID
        paymentStatus: computePaymentStatus(input.verifiedAmount, intake.agreedPrice),
        payment: {
          method: extraction?.bankOrWallet ? `Transfer ${extraction.bankOrWallet}` : "Transfer",
          reference: extraction?.referenceNo ?? null,
          notes: "Pembayaran via WhatsApp, diverifikasi admin",
        },
      });

      // 4. Brief (format sama dengan form brief → BriefReader identik)
      const draft = (intake.briefDraft ?? {}) as BriefDraft;
      await tx.brief.create({
        data: { projectId: project.id, responses: briefResponsesToEntries(draft) as Prisma.InputJsonValue },
      });

      // 5. Attachment: gambar brief + bukti transfer (bukti tetap di bucket privat)
      const attachments: Prisma.AttachmentCreateManyInput[] = [];
      for (const img of briefImages(draft)) {
        const key = storageKeyFromUrl(img.url);
        if (!key) continue;
        attachments.push({
          filename: key.split("/").pop() ?? key,
          mimeType: mimeOf(key),
          size: 0,
          storageKey: key,
          caption: img.caption,
          category: img.category,
          projectId: project.id,
          uploaderId: WHATSAPP_UPLOADER,
        });
      }
      attachments.push({
        filename: proof.storageKey.split("/").pop() ?? proof.storageKey,
        mimeType: proof.mimeType,
        size: 0,
        storageKey: proof.storageKey,
        caption: "Bukti transfer via WhatsApp",
        category: "PAYMENT_PROOF",
        projectId: project.id,
        uploaderId: WHATSAPP_UPLOADER,
      });
      await tx.attachment.createMany({ data: attachments });

      // 6. Bukti → APPROVED, tertaut ke payment
      await tx.paymentProof.update({
        where: { id: proof.id },
        data: {
          status: "APPROVED",
          verifiedAmount: input.verifiedAmount,
          reviewedById: input.actorId,
          reviewedAt: new Date(),
          paymentId: payment?.id ?? null,
        },
      });

      // 7. Link tracking (token acak 16 karakter, generator sama dengan POST /api/client-links)
      const link = await tx.clientLink.create({
        data: { projectId: project.id, token: generateClientLinkToken(), status: "ACTIVE", expiresAt: null },
        select: { token: true },
      });

      // 8. Tautkan intake & percakapan
      await tx.waIntake.update({ where: { id: input.intakeId }, data: { projectId: project.id } });
      await tx.waConversation.update({ where: { id: intake.conversation.id }, data: { clientId: client.id } });

      await tx.activityLog.create({
        data: {
          entityType: "WaIntake",
          entityId: input.intakeId,
          action: "WA_DP_APPROVED",
          actorId: input.actorId,
          newValue: {
            proofId: proof.id,
            verifiedAmount: input.verifiedAmount,
            projectId: project.id,
            projectNumber: project.projectNumber,
          },
        },
      });

      return {
        conversationId: intake.conversation.id,
        clientName,
        project: { id: project.id, projectNumber: project.projectNumber },
        clientLinkToken: link.token,
      };
    },
    // createProject + lampiran + link: beberapa query; batas default 5 detik terlalu ketat.
    { timeout: 20_000, maxWait: 5_000 },
  );
}
