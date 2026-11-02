import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { WhatsAppApiError, sendText } from "./client-api";
import { maskPhone } from "./phone";
import type { MediaRejection } from "./media";
import { runAiTurn } from "./ai/conversation";
import { clampReply, sanitizeReply, stripPriceMentions } from "./ai/reply-guard";

// Bagian bersama bot: kirim/simpan balasan dan satu giliran AI → balasan ke klien.
// Dipakai pesan masuk (bot.ts) dan penerusan jawaban owner (owner/queries.ts).

export const BOT_REPLIES = {
  unsupported:
    "Maaf kak, saat ini kami hanya bisa membaca pesan teks dan gambar. Silakan kirim ulang sebagai teks atau gambar ya.",
  MEDIA_TOO_LARGE: "Maaf kak, gambarnya terlalu besar. Kirim gambar maksimal 10 MB ya.",
  MEDIA_TYPE_NOT_ALLOWED: "Maaf kak, gambarnya tidak bisa kami proses. Kirim gambar JPG, PNG, atau WEBP ya.",
  handoff: "Baik kak, percakapan ini kami teruskan ke admin. Admin kami akan membalas secepatnya ya.",
  busy: "Maaf kak, sistem kami sedang sibuk. Admin kami akan membalas secepatnya ya.",
  tooManyMessages: "Kak, pesannya banyak sekali dalam waktu singkat. Kami balas lagi beberapa menit lagi ya.",
  tooManyImages: "Maaf kak, gambar untuk order ini sudah banyak sekali, jadi gambar ini tidak kami simpan. Kalau masih ada gambar penting, ketik *admin* untuk dibantu tim kami.",
  dailyLimit: "Kak, percakapan hari ini sudah panjang sekali. Kami teruskan ke admin supaya bisa dibantu langsung ya.",
} satisfies Record<string, string> & Record<MediaRejection, string>;

// Status sebelum admin memberi harga: balasan tidak boleh memuat harga/durasi.
const PRE_QUOTE_STATUSES = new Set([null, "COLLECTING", "AWAITING_QUOTE"]);

/**
 * Kirim teks bebas lalu simpan sebagai WaMessage OUTBOUND, supaya status
 * pengiriman dari webhook bisa dicocokkan via wamid. Kegagalan kirim tetap
 * disimpan dengan errorCode untuk ditampilkan di portal.
 */
export async function sendBotText(
  conversation: { id: string; waId: string; isSandbox?: boolean },
  body: string,
): Promise<boolean> {
  if (conversation.isSandbox) {
    // Uji bot: balasan hanya disimpan untuk ditampilkan di Settings, tidak dikirim ke WhatsApp.
    await prisma.waMessage.create({
      data: { conversationId: conversation.id, direction: "OUTBOUND", body, sentByBot: true, deliveryStatus: "sandbox" },
    });
    return true;
  }
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

export async function setHumanMode(conversationId: string) {
  await prisma.waConversation.update({ where: { id: conversationId }, data: { mode: "HUMAN" } });
}

/** Ada pesan masuk yang lebih baru? Giliran pesan itu yang membalas (termasuk konteks pesan ini). */
export async function isSuperseded(conversationId: string, createdAt: Date): Promise<boolean> {
  const newer = await prisma.waMessage.count({
    where: { conversationId, direction: "INBOUND", createdAt: { gt: createdAt } },
  });
  return newer > 0;
}

/**
 * Satu giliran AI untuk percakapan klien lalu kirim balasannya (dengan semua penjaga balasan).
 * `anchor` = pesan terakhir yang dijawab. Return true jika balasan AI terkirim/tersimpan.
 */
export async function replyWithAi(
  conversation: { id: string; waId: string; isSandbox?: boolean },
  anchor: { id: string; createdAt: Date },
  opts: { checkSuperseded: boolean },
): Promise<boolean> {
  const turnStartedAt = new Date();
  let turn: Awaited<ReturnType<typeof runAiTurn>>;
  try {
    turn = await runAiTurn({ conversationId: conversation.id, messageId: anchor.id });
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
    return false;
  }

  if (!turn.reply) {
    await setHumanMode(conversation.id);
    await sendBotText(conversation, BOT_REPLIES.busy);
    return false;
  }

  // Klien sudah mengirim pesan baru selama AI berpikir → biarkan giliran itu yang membalas.
  if (opts.checkSuperseded && (await isSuperseded(conversation.id, anchor.createdAt))) return false;

  const sanitized = sanitizeReply(turn.reply);
  if (sanitized.rejected) {
    console.error(`[whatsapp] balasan AI rusak untuk ${maskPhone(conversation.waId)}, dialihkan ke admin`);
    await setHumanMode(conversation.id);
    await sendBotText(conversation, BOT_REPLIES.busy);
    return false;
  }

  const safe = PRE_QUOTE_STATUSES.has(turn.intakeStatus)
    ? stripPriceMentions(sanitized.text, turn.briefText, turn.allowedPriceNumbers).text
    : sanitized.text;
  const sent = await sendBotText(conversation, clampReply(safe));
  if (sent) {
    // Jawaban owner yang ada di STATE giliran ini sudah disampaikan ke klien (owner/queries.ts).
    await prisma.waOwnerQuery.updateMany({
      where: { conversationId: conversation.id, status: "ANSWERED", relayedAt: null, answeredAt: { lte: turnStartedAt } },
      data: { relayedAt: new Date() },
    });
  }
  return sent;
}
