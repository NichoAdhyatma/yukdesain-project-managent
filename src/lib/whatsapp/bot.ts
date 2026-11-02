import { prisma } from "@/lib/db";
import { markAsRead } from "./client-api";
import { storeInboundMedia } from "./media";
import { findActiveIntake } from "./ai/tools";
import { botReplyLimitReached, checkInboundRate, imageLimitExceeded } from "./rate-limit";
import { BOT_REPLIES, isSuperseded, replyWithAi, sendBotText, setHumanMode } from "./bot-reply";
import { resolveOwner } from "./owner/identity";
import { handleOwnerMessage } from "./owner/handle";

export { BOT_REPLIES, sendBotText } from "./bot-reply";

// Orkestrasi pesan masuk (docs/WHATSAPP_AI_CHATBOT.md §10.3).

// Kata kunci untuk langsung bicara dengan admin (§10.3 langkah 3).
const HANDOFF_KEYWORDS = new Set(["admin", "cs"]);

export async function handleInboundMessage(messageId: string): Promise<void> {
  const message = await prisma.waMessage.findUniqueOrThrow({
    where: { id: messageId },
    select: {
      id: true,
      wamid: true,
      type: true,
      body: true,
      createdAt: true,
      contextWamid: true,
      conversation: { select: { id: true, waId: true, mode: true, isSandbox: true } },
    },
  });
  const { conversation } = message;

  // Nomor owner (atau Uji bot sebagai owner): instruksi ke bot, bukan chat klien
  // (docs/WHATSAPP_OWNER_COMMANDS.md §3).
  const owner = await resolveOwner(conversation);
  if (owner) {
    if (message.wamid) await markAsRead(message.wamid).catch(() => undefined);
    await handleOwnerMessage(message, conversation, owner);
    return;
  }

  // Saklar dibaca langsung tanpa cache: mematikan bot harus langsung berlaku. Uji bot tetap
  // jalan saat bot nonaktif, supaya owner bisa mencoba sebelum menyalakannya.
  if (!conversation.isSandbox) {
    const settings = await prisma.studioSettings.findUnique({
      where: { id: "default" },
      select: { waBotEnabled: true },
    });
    if (!settings?.waBotEnabled) return;
  }
  if (conversation.mode === "HUMAN") return;

  if (message.wamid) {
    // Centang biru hanya kosmetik; gagal tidak menghentikan balasan.
    await markAsRead(message.wamid).catch(() => undefined);
  }

  // Banjir pesan: peringatan sekali, sisanya diabaikan (§17). Owner yang menguji tidak dibatasi.
  const rate = conversation.isSandbox ? "ok" : await checkInboundRate(conversation.id, message.createdAt);
  if (rate === "warn") {
    await sendBotText(conversation, BOT_REPLIES.tooManyMessages);
    return;
  }
  if (rate === "ignore") return;

  if (message.type === "text" && HANDOFF_KEYWORDS.has(message.body.trim().toLowerCase())) {
    await setHumanMode(conversation.id);
    await sendBotText(conversation, BOT_REPLIES.handoff);
    return;
  }

  if (message.type === "unsupported") {
    await sendBotText(conversation, BOT_REPLIES.unsupported);
    return;
  }

  if (message.type === "image") {
    const intake = await findActiveIntake(conversation.id);
    if (await imageLimitExceeded(conversation.id, intake?.createdAt ?? null)) {
      await sendBotText(conversation, BOT_REPLIES.tooManyImages);
      return;
    }
    // Disimpan dulu walau nanti dilewati: giliran pesan berikutnya membutuhkan gambarnya.
    const result = await storeInboundMedia(message.id);
    if (!result.ok) {
      await sendBotText(conversation, BOT_REPLIES[result.reason]);
      return;
    }
  }

  if (await isSuperseded(conversation.id, message.createdAt)) return;

  // Batas biaya: percakapan yang sangat panjang dialihkan ke admin (§17).
  if (await botReplyLimitReached(conversation.id)) {
    await setHumanMode(conversation.id);
    await sendBotText(conversation, BOT_REPLIES.dailyLimit);
    return;
  }

  await replyWithAi(conversation, message, { checkSuperseded: true });
}
