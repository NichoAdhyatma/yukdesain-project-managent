import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { WhatsAppApiError, markAsRead, sendText } from "./client-api";
import { maskPhone } from "./phone";
import { storeInboundMedia, type MediaRejection } from "./media";
import { runAiTurn } from "./ai/conversation";
import { clampReply, sanitizeReply, stripPriceMentions } from "./ai/reply-guard";

// Orkestrasi pesan masuk (docs/WHATSAPP_AI_CHATBOT.md §10.3).

export const BOT_REPLIES = {
  unsupported:
    "Maaf kak, saat ini kami hanya bisa membaca pesan teks dan gambar. Silakan kirim ulang sebagai teks atau gambar ya.",
  MEDIA_TOO_LARGE: "Maaf kak, gambarnya terlalu besar. Kirim gambar maksimal 10 MB ya.",
  MEDIA_TYPE_NOT_ALLOWED: "Maaf kak, gambarnya tidak bisa kami proses. Kirim gambar JPG, PNG, atau WEBP ya.",
  handoff: "Baik kak, percakapan ini kami teruskan ke admin. Admin kami akan membalas secepatnya ya.",
  busy: "Maaf kak, sistem kami sedang sibuk. Admin kami akan membalas secepatnya ya.",
} satisfies Record<string, string> & Record<MediaRejection, string>;

// Kata kunci untuk langsung bicara dengan admin (§10.3 langkah 3).
const HANDOFF_KEYWORDS = new Set(["admin", "cs"]);

// Status sebelum admin memberi harga: balasan tidak boleh memuat harga/durasi.
const PRE_QUOTE_STATUSES = new Set([null, "COLLECTING", "AWAITING_QUOTE"]);

/**
 * Kirim teks bebas lalu simpan sebagai WaMessage OUTBOUND, supaya status
 * pengiriman dari webhook bisa dicocokkan via wamid. Kegagalan kirim tetap
 * disimpan dengan errorCode untuk ditampilkan di portal.
 */
export async function sendBotText(conversation: { id: string; waId: string }, body: string): Promise<boolean> {
  try {
    const wamid = await sendText(conversation.waId, body);
    await prisma.waMessage.create({
      data: { conversationId: conversation.id, wamid, direction: "OUTBOUND", body, sentByBot: true, deliveryStatus: "sent" },
    });
    return true;
  } catch (error) {
    const errorCode = error instanceof WhatsAppApiError ? (error.code ?? String(error.status)) : "SEND_FAILED";
    await prisma.waMessage.create({
      data: { conversationId: conversation.id, direction: "OUTBOUND", body, sentByBot: true, deliveryStatus: "failed", errorCode },
    });
    console.error(`[whatsapp] gagal kirim ke ${maskPhone(conversation.waId)}: ${errorCode}`);
    return false;
  }
}

async function setHumanMode(conversationId: string) {
  await prisma.waConversation.update({ where: { id: conversationId }, data: { mode: "HUMAN" } });
}

/** Ada pesan masuk yang lebih baru? Giliran pesan itu yang membalas (termasuk konteks pesan ini). */
async function isSuperseded(conversationId: string, createdAt: Date): Promise<boolean> {
  const newer = await prisma.waMessage.count({
    where: { conversationId, direction: "INBOUND", createdAt: { gt: createdAt } },
  });
  return newer > 0;
}

export async function handleInboundMessage(messageId: string): Promise<void> {
  const message = await prisma.waMessage.findUniqueOrThrow({
    where: { id: messageId },
    select: {
      id: true,
      wamid: true,
      type: true,
      body: true,
      createdAt: true,
      conversation: { select: { id: true, waId: true, mode: true } },
    },
  });
  const { conversation } = message;

  // Saklar dibaca langsung tanpa cache: mematikan bot harus langsung berlaku.
  const settings = await prisma.studioSettings.findUnique({
    where: { id: "default" },
    select: { waBotEnabled: true },
  });
  if (!settings?.waBotEnabled) return;
  if (conversation.mode === "HUMAN") return;

  if (message.wamid) {
    // Centang biru hanya kosmetik; gagal tidak menghentikan balasan.
    await markAsRead(message.wamid).catch(() => undefined);
  }

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
    // Disimpan dulu walau nanti dilewati: giliran pesan berikutnya membutuhkan gambarnya.
    const result = await storeInboundMedia(message.id);
    if (!result.ok) {
      await sendBotText(conversation, BOT_REPLIES[result.reason]);
      return;
    }
  }

  if (await isSuperseded(conversation.id, message.createdAt)) return;

  let turn: Awaited<ReturnType<typeof runAiTurn>>;
  try {
    turn = await runAiTurn({ conversationId: conversation.id, messageId: message.id });
  } catch (error) {
    // Hanya nama error: pesan error API bisa memuat potongan isi chat.
    const reason =
      error instanceof Anthropic.APIError
        ? `api_${error.status ?? "connection"}`
        : (error as Error).message === "AI_REFUSAL"
          ? "refusal"
          : (error as Error).name;
    console.error(`[whatsapp] AI gagal untuk ${maskPhone(conversation.waId)}: ${reason}`);
    await setHumanMode(conversation.id);
    await sendBotText(conversation, BOT_REPLIES.busy);
    return;
  }

  if (!turn.reply) {
    await setHumanMode(conversation.id);
    await sendBotText(conversation, BOT_REPLIES.busy);
    return;
  }

  // Klien sudah mengirim pesan baru selama AI berpikir → biarkan giliran itu yang membalas.
  if (await isSuperseded(conversation.id, message.createdAt)) return;

  const sanitized = sanitizeReply(turn.reply);
  if (sanitized.rejected) {
    console.error(`[whatsapp] balasan AI rusak untuk ${maskPhone(conversation.waId)}, dialihkan ke admin`);
    await setHumanMode(conversation.id);
    await sendBotText(conversation, BOT_REPLIES.busy);
    return;
  }

  const safe = PRE_QUOTE_STATUSES.has(turn.intakeStatus)
    ? stripPriceMentions(sanitized.text, turn.briefText).text
    : sanitized.text;
  await sendBotText(conversation, clampReply(safe));
}
