import { prisma } from "@/lib/db";
import { notifyNeedsAdmin, type HandoffReason } from "@/lib/notifications/owner-events";

/**
 * Alihkan chat ke admin (mode HUMAN). Owner diberi notifikasi hanya saat chat benar-benar berpindah dari bot,
 * supaya alih ulang tidak mengirim notifikasi berulang (docs/OWNER_NOTIFICATIONS_INBOX.md §2).
 */
export async function setHumanMode(conversationId: string, reason?: HandoffReason): Promise<void> {
  const { count } = await prisma.waConversation.updateMany({ where: { id: conversationId, mode: "BOT" }, data: { mode: "HUMAN" } });
  // Tidak ditunggu: notifikasi lambat tidak boleh menunda balasan ke klien.
  if (count === 1 && reason) void notifyNeedsAdmin(conversationId, reason);
}
