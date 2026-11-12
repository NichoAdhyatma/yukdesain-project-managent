import { prisma } from "@/lib/db";
import { isWithinServiceWindow } from "../outbound";
import { getChannel, usesServiceWindow } from "../channel";
import { replyWithAi, setHumanMode } from "../bot-reply";
import { maskPhone } from "../phone";
import { sandboxWaId, type OwnerContext } from "./identity";

export { answerOwnerQuery, createOwnerQuery, findPendingQuery, notifyOwners, ownerQuestionText, queryIdFromContext } from "./query-store";

// Jawaban owner diteruskan bot ke klien, dan kedaluwarsa pertanyaan (docs/WHATSAPP_OWNER_COMMANDS.md §5).

export type RelayOutcome = "sent" | "failed" | "admin" | "window_closed" | "skipped";
export type RelayResult = { outcome: RelayOutcome; clientLabel: string };

const PHONE_REPLY_PREFIX = "kirimi:phone:";

/**
 * Bot melanjutkan chat klien memakai jawaban owner (ada di STATE). Hasilnya dilaporkan ke owner apa adanya
 * (owner/handle.ts). Tidak dikirim jika admin sudah mengambil alih, atau jendela 24 jam klien sudah tutup.
 * `force` (owner minta kirim ulang): chat yang pindah ke admin karena kiriman sebelumnya gagal, dan belum dibalas
 * admin sejak itu, dikembalikan ke bot dulu.
 */
export async function relayOwnerAnswer(queryId: string, opts: { force?: boolean } = {}): Promise<RelayResult> {
  const query = await prisma.waOwnerQuery.findUnique({
    where: { id: queryId },
    select: {
      status: true,
      relayedAt: true,
      relayFailedAt: true,
      conversation: { select: { id: true, waId: true, profileName: true, isSandbox: true, mode: true, lastInboundAt: true } },
    },
  });
  if (!query) return { outcome: "skipped", clientLabel: "klien" };
  const { conversation } = query;
  const clientLabel = `${conversation.profileName ?? "Klien"} (${maskPhone(conversation.waId)})`;
  if (query.status !== "ANSWERED" || query.relayedAt) return { outcome: "skipped", clientLabel };

  if (conversation.mode === "HUMAN") {
    if (!opts.force || !query.relayFailedAt) return { outcome: "admin", clientLabel };
    const adminReplies = await prisma.waMessage.count({
      where: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        createdAt: { gt: query.relayFailedAt },
        OR: [{ sentById: { not: null } }, { wamid: { startsWith: PHONE_REPLY_PREFIX } }],
      },
    });
    if (adminReplies > 0) return { outcome: "admin", clientLabel };
    await prisma.waConversation.updateMany({ where: { id: conversation.id, mode: "HUMAN" }, data: { mode: "BOT" } });
  }

  if (!conversation.isSandbox && usesServiceWindow(await getChannel()) && !isWithinServiceWindow(conversation.lastInboundAt)) {
    await setHumanMode(conversation.id, "owner_timeout");
    return { outcome: "window_closed", clientLabel };
  }
  const anchor = await prisma.waMessage.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
  if (anchor && (await replyWithAi(conversation, anchor, { checkSuperseded: false, notifyClient: false }))) return { outcome: "sent", clientLabel };
  // replyWithAi sudah mengalihkan chat ke admin (tanpa pesan sibuk ke klien); owner yang memutuskan kirim ulang.
  await prisma.waOwnerQuery.update({ where: { id: queryId }, data: { relayFailedAt: new Date() } });
  return { outcome: "failed", clientLabel };
}

/** Jawaban owner yang gagal diteruskan dan belum terkirim (24 jam terakhir), untuk "kirim ulang". */
export async function findFailedRelays(owner: OwnerContext) {
  return prisma.waOwnerQuery.findMany({
    where: {
      status: "ANSWERED",
      relayedAt: null,
      relayFailedAt: { not: null },
      answeredAt: { gt: new Date(Date.now() - 24 * 3_600_000) },
      conversation: owner.target === "DRAFT" ? { waId: sandboxWaId(owner.user.id) } : { isSandbox: false },
    },
    orderBy: { answeredAt: "desc" },
    select: { id: true },
  });
}

/** Pertanyaan yang tidak dijawab owner dalam batas waktu → kedaluwarsa, chat klien ke admin. */
export async function expireOwnerQueries(now = new Date()): Promise<number> {
  const stale = await prisma.waOwnerQuery.findMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    select: { id: true, conversationId: true, conversation: { select: { isSandbox: true } } },
  });
  for (const q of stale) {
    const { count } = await prisma.waOwnerQuery.updateMany({ where: { id: q.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    if (count === 1 && !q.conversation.isSandbox) await setHumanMode(q.conversationId, "owner_timeout");
  }
  return stale.length;
}
