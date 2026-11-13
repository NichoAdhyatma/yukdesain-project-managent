import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { deliveryErrorCode, sendTextOnChannel } from "./channel";
import { maskPhone } from "./phone";
import type { MediaRejection } from "./media";
import { runAiTurn } from "./ai/conversation";
import { callAdmin, lastOutboundIs } from "./handoff";
import { clampReply, dropRepeatedSentences, sanitizeReply, stripDpMentions, stripPriceMentions } from "./ai/reply-guard";
import { AiProviderError, isTechnicalFailure } from "@/lib/ai/client";

// Bagian bersama bot: kirim/simpan balasan dan satu giliran AI → balasan ke klien.
// Dipakai pesan masuk (bot.ts) dan penerusan jawaban owner (owner/queries.ts).

export const BOT_REPLIES = {
  unsupported:
    "Maaf kak, saat ini kami hanya bisa membaca pesan teks dan gambar. Silakan kirim ulang sebagai teks atau gambar ya.",
  MEDIA_TOO_LARGE: "Maaf kak, gambarnya terlalu besar. Kirim gambar maksimal 10 MB ya.",
  MEDIA_TYPE_NOT_ALLOWED: "Maaf kak, gambarnya tidak bisa kami proses. Kirim gambar JPG, PNG, atau WEBP ya.",
  handoff: "Baik kak, admin kami sudah dikabari dan akan membalas di chat ini secepatnya ya.",
  busy: "Maaf kak, sistem kami sedang sibuk. Admin kami akan membalas secepatnya ya.",
  tooManyMessages: "Kak, pesannya banyak sekali dalam waktu singkat. Kami balas lagi beberapa menit lagi ya.",
  tooManyImages: "Maaf kak, gambar untuk order ini sudah banyak sekali, jadi gambar berikutnya belum kami simpan. Admin kami sudah dikabari dan akan membantu langsung ya.",
  dailyLimit: "Kak, percakapan hari ini sudah panjang sekali. Kami teruskan ke admin supaya bisa dibantu langsung ya.",
  monthlyCap: "Pesan kakak sudah kami terima. Admin kami akan membalas secepatnya ya.",
  ownerClientModeOn:
    "Mode klien aktif ✅ Mulai sekarang chat dari nomor ini dilayani seperti klien, jadi bisa tes order. Order yang dibuat diberi label *Tes owner* di Order WA. Kirim *#owner* untuk kembali memberi instruksi ke bot.",
  ownerClientModeOff: "Mode owner aktif ✅ Chat dari nomor ini kembali dianggap instruksi ke bot. Kirim *#klien* untuk tes order lagi.",
} satisfies Record<string, string> & Record<MediaRejection, string>;

// Status sebelum admin memberi harga: balasan tidak boleh memuat harga/durasi.
const PRE_QUOTE_STATUSES = new Set([null, "COLLECTING", "AWAITING_QUOTE"]);
// Invoice sudah terkirim: nominal/persen DP hanya ada di invoice (spec 2026-11-11 §5).
const INVOICE_STATUSES = new Set<string | null>(["QUOTED", "DP_REVIEW"]);

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
    const wamid = await sendTextOnChannel(conversation.waId, body);
    await prisma.waMessage.create({
      data: { conversationId: conversation.id, wamid, direction: "OUTBOUND", body, sentByBot: true, deliveryStatus: "sent" },
    });
    return true;
  } catch (error) {
    const errorCode = deliveryErrorCode(error);
    await prisma.waMessage.create({
      data: { conversationId: conversation.id, direction: "OUTBOUND", body, sentByBot: true, deliveryStatus: "failed", errorCode },
    });
    console.error(`[whatsapp] gagal kirim ke ${maskPhone(conversation.waId)}: ${errorCode}`);
    return false;
  }
}

export { callAdmin } from "./handoff";

/** Ada pesan masuk yang lebih baru? Giliran pesan itu yang membalas (termasuk konteks pesan ini). */
export async function isSuperseded(conversationId: string, createdAt: Date): Promise<boolean> {
  const newer = await prisma.waMessage.count({
    where: { conversationId, direction: "INBOUND", createdAt: { gt: createdAt } },
  });
  return newer > 0;
}

// Model lewat gateway sesekali menulis tool call sebagai teks atau membalas kosong. Satu percobaan
// ulang biasanya cukup; baru setelah itu klien menerima pesan "sibuk" dan admin dipanggil (chat tetap BOT).
const AI_ATTEMPTS = 2;
// Jeda sebelum mencoba lagi setelah gangguan teknis (SDK sudah mencoba ulang sendiri dengan backoff pendek).
const AI_RETRY_DELAY_MS = 4000;

/**
 * AI gagal: admin dipanggil, chat tetap BOT supaya pesan klien berikutnya dicoba lagi (keputusan owner 2026-11-13).
 * Pesan sibuk ke klien hanya bila klien sedang menunggu balasan dan belum menerima pesan sibuk sebagai pesan terakhir.
 */
async function notifyAiFailed(conversation: { id: string; waId: string; isSandbox?: boolean }, opts: { notifyClient?: boolean }) {
  callAdmin(conversation.id, "ai_failed");
  if (opts.notifyClient === false) return;
  if (await lastOutboundIs(conversation.id, BOT_REPLIES.busy)) return;
  await sendBotText(conversation, BOT_REPLIES.busy);
}

/**
 * Satu giliran AI untuk percakapan klien lalu kirim balasannya (dengan semua penjaga balasan).
 * `anchor` = pesan terakhir yang dijawab. Return true jika balasan AI terkirim/tersimpan.
 */
export async function replyWithAi(
  conversation: { id: string; waId: string; isSandbox?: boolean },
  anchor: { id: string; createdAt: Date },
  // notifyClient false: giliran tanpa pesan baru klien (meneruskan jawaban owner). Kalau gagal, owner yang menerima
  // laporan; klien tidak dikirimi "sistem sibuk" karena tidak sedang menunggu balasan.
  opts: { checkSuperseded: boolean; notifyClient?: boolean },
): Promise<boolean> {
  const turnStartedAt = new Date();
  let turn: Awaited<ReturnType<typeof runAiTurn>> | null = null;
  let sanitized: ReturnType<typeof sanitizeReply> | null = null;
  for (let attempt = 1; attempt <= AI_ATTEMPTS; attempt++) {
    try {
      turn = await runAiTurn({ conversationId: conversation.id, messageId: anchor.id });
    } catch (error) {
      // Hanya nama/status error: pesan error API bisa memuat potongan isi chat.
      const reason =
        error instanceof AiProviderError
          ? `provider_${error.status ?? "network"}`
          : error instanceof Anthropic.APIError
            ? `api_${error.status ?? "connection"}`
            : (error as Error).message === "AI_REFUSAL"
              ? "refusal"
              : (error as Error).name;
      // Gangguan teknis (rate limit, 5xx, jaringan) dicoba sekali lagi sebelum admin dipanggil.
      if (attempt < AI_ATTEMPTS && isTechnicalFailure(error)) {
        console.warn(`[whatsapp] AI gagal untuk ${maskPhone(conversation.waId)} (percobaan ${attempt}/${AI_ATTEMPTS}): ${reason}, dicoba lagi`);
        await new Promise((resolve) => setTimeout(resolve, AI_RETRY_DELAY_MS));
        continue;
      }
      console.error(`[whatsapp] AI gagal untuk ${maskPhone(conversation.waId)}: ${reason}`);
      await notifyAiFailed(conversation, opts);
      return false;
    }

    // Klien sudah mengirim pesan baru selama AI berpikir → biarkan giliran itu yang membalas.
    if (opts.checkSuperseded && (await isSuperseded(conversation.id, anchor.createdAt))) return false;

    sanitized = turn.reply ? sanitizeReply(turn.reply) : null;
    if (sanitized && !sanitized.rejected) break;
    // Hanya alasan dan panjang: isi balasan bisa memuat data klien.
    console.warn(
      `[whatsapp] balasan AI ditolak untuk ${maskPhone(conversation.waId)} (percobaan ${attempt}/${AI_ATTEMPTS}): ` +
        `${sanitized?.reason ?? "empty"}, ${turn.reply?.length ?? 0} karakter, stop=${turn.stopReason ?? "-"}`,
    );
  }

  if (!turn || !sanitized || sanitized.rejected) {
    console.error(`[whatsapp] balasan AI rusak untuk ${maskPhone(conversation.waId)}, admin dipanggil`);
    await notifyAiFailed(conversation, opts);
    return false;
  }

  const safe = PRE_QUOTE_STATUSES.has(turn.intakeStatus)
    ? stripPriceMentions(sanitized.text, turn.briefText, turn.allowedPriceNumbers, turn.guardExtras).text
    : INVOICE_STATUSES.has(turn.intakeStatus)
      ? stripDpMentions(sanitized.text, turn.dpGuardNumbers ?? []).text
      : sanitized.text;
  // Kalimat yang sudah dikirim di pesan sebelumnya tidak diulang; balasan yang seluruhnya ulangan tidak dikirim.
  const fresh = dropRepeatedSentences(safe, turn.recentOutbound ?? []);
  if (!fresh) console.warn(`[whatsapp] balasan AI seluruhnya ulangan untuk ${maskPhone(conversation.waId)}, tidak dikirim`);
  const sent = fresh ? await sendBotText(conversation, clampReply(fresh)) : true;
  if (sent) {
    // Jawaban owner yang ada di STATE giliran ini sudah disampaikan ke klien (owner/queries.ts).
    await prisma.waOwnerQuery.updateMany({
      where: { conversationId: conversation.id, status: "ANSWERED", relayedAt: null, answeredAt: { lte: turnStartedAt } },
      data: { relayedAt: new Date() },
    });
  }
  return sent;
}
