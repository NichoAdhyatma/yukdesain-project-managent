import { prisma } from "@/lib/db";
import { WhatsAppApiError, markAsRead, sendText } from "./client-api";
import { maskPhone } from "./phone";
import { storeInboundMedia, type MediaRejection } from "./media";

// Versi awal (langkah 5): balasan statis. Langkah 7 mengganti balasan teks
// dengan AI (docs/WHATSAPP_AI_CHATBOT.md §10.3).

export const BOT_REPLIES = {
  received:
    "Terima kasih, pesan kamu sudah kami terima. Asisten WhatsApp YukDesain sedang disiapkan, tim kami akan membalas secepatnya.",
  unsupported:
    "Maaf, saat ini kami hanya bisa membaca pesan teks dan gambar. Silakan kirim ulang sebagai teks atau gambar ya.",
  MEDIA_TOO_LARGE: "Maaf, gambarnya terlalu besar. Kirim gambar maksimal 10 MB ya.",
  MEDIA_TYPE_NOT_ALLOWED: "Maaf, gambarnya tidak bisa kami proses. Kirim gambar JPG, PNG, atau WEBP ya.",
} satisfies Record<string, string> & Record<MediaRejection, string>;

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

export async function handleInboundMessage(messageId: string): Promise<void> {
  const message = await prisma.waMessage.findUniqueOrThrow({
    where: { id: messageId },
    select: {
      id: true,
      wamid: true,
      type: true,
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

  if (message.type === "unsupported") {
    await sendBotText(conversation, BOT_REPLIES.unsupported);
    return;
  }

  if (message.type === "image") {
    const result = await storeInboundMedia(message.id);
    if (!result.ok) {
      await sendBotText(conversation, BOT_REPLIES[result.reason]);
      return;
    }
  }

  await sendBotText(conversation, BOT_REPLIES.received);
}
