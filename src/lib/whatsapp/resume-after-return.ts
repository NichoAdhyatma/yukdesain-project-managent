import { prisma } from "@/lib/db";
import { replyWithAi } from "./bot-reply";
import { storeInboundMedia } from "./media";
import { listOwnerNumbers } from "./owner/identity";

// Chat dikembalikan ke bot (Inbox / Order WA): pesan klien yang tertinggal selama mode admin langsung dijawab bot.
// Produksi 2026-11-12 (hastalinuwih): chat dikembalikan 22:15, pertanyaan klien 21:52 tidak pernah dijawab karena bot
// hanya membalas pesan klien berikutnya.

/** Pesan klien yang lebih lama dari ini tidak dibalas otomatis. */
export const RESUME_WINDOW_MS = 24 * 3_600_000;

export type ResumeOutcome = "replied" | "failed" | "nothing_pending" | "skipped";

export async function replyPendingAfterReturn(conversationId: string, now = new Date()): Promise<ResumeOutcome> {
  const settings = await prisma.studioSettings.findUnique({ where: { id: "default" }, select: { waBotEnabled: true } });
  if (!settings?.waBotEnabled) return "skipped";
  const conversation = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, waId: true, isSandbox: true, mode: true, blockedAt: true, ownerActsAsClient: true },
  });
  if (!conversation || conversation.mode !== "BOT" || conversation.blockedAt) return "skipped";
  // Chat owner berisi instruksi ke bot, bukan pertanyaan klien.
  const owners = await listOwnerNumbers();
  if (!conversation.ownerActsAsClient && owners.some((o) => o.waNumber === conversation.waId)) return "skipped";

  const last = await prisma.waMessage.findFirst({
    where: { conversationId, NOT: { direction: "OUTBOUND", deliveryStatus: "failed" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, direction: true, type: true, mediaStorageKey: true, createdAt: true },
  });
  if (!last || last.direction !== "INBOUND" || now.getTime() - last.createdAt.getTime() > RESUME_WINDOW_MS) {
    return "nothing_pending";
  }
  // Selama mode admin gambar klien belum diunduh; giliran AI membutuhkannya.
  if (last.type === "image" && !last.mediaStorageKey) await storeInboundMedia(last.id).catch(() => undefined);

  const sent = await replyWithAi(
    { id: conversation.id, waId: conversation.waId, isSandbox: conversation.isSandbox },
    { id: last.id, createdAt: last.createdAt },
    { checkSuperseded: true },
  );
  return sent ? "replied" : "failed";
}
