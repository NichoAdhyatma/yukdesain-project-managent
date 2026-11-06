import { prisma } from "@/lib/db";
import { isWithinServiceWindow } from "../outbound";
import { getChannel, usesServiceWindow } from "../channel";
import { replyWithAi, setHumanMode } from "../bot-reply";

export { answerOwnerQuery, createOwnerQuery, findPendingQuery, notifyOwners, ownerQuestionText, queryIdFromContext } from "./query-store";

// Jawaban owner diteruskan bot ke klien, dan kedaluwarsa pertanyaan (docs/WHATSAPP_OWNER_COMMANDS.md §5).

/**
 * Bot melanjutkan chat klien memakai jawaban owner (ada di STATE). Tidak dikirim jika admin
 * sudah mengambil alih, atau jendela 24 jam klien sudah tutup (→ mode HUMAN).
 */
export async function relayOwnerAnswer(queryId: string): Promise<boolean> {
  const query = await prisma.waOwnerQuery.findUnique({
    where: { id: queryId },
    select: {
      status: true,
      relayedAt: true,
      conversation: { select: { id: true, waId: true, isSandbox: true, mode: true, lastInboundAt: true } },
    },
  });
  if (!query || query.status !== "ANSWERED" || query.relayedAt) return false;
  const { conversation } = query;
  if (conversation.mode === "HUMAN") return false;
  if (!conversation.isSandbox && usesServiceWindow(await getChannel()) && !isWithinServiceWindow(conversation.lastInboundAt)) {
    await setHumanMode(conversation.id);
    return false;
  }
  const anchor = await prisma.waMessage.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
  if (!anchor) return false;
  return replyWithAi(conversation, anchor, { checkSuperseded: false });
}

/** Pertanyaan yang tidak dijawab owner dalam batas waktu → kedaluwarsa, chat klien ke admin. */
export async function expireOwnerQueries(now = new Date()): Promise<number> {
  const stale = await prisma.waOwnerQuery.findMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    select: { id: true, conversationId: true, conversation: { select: { isSandbox: true } } },
  });
  for (const q of stale) {
    const { count } = await prisma.waOwnerQuery.updateMany({ where: { id: q.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    if (count === 1 && !q.conversation.isSandbox) await setHumanMode(q.conversationId);
  }
  return stale.length;
}
