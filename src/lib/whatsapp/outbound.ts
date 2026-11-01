import { prisma } from "@/lib/db";
import { DP_PERCENT, WA_TEMPLATES } from "@/lib/constants";
import { getWhatsAppEnv } from "./env";
import { WhatsAppApiError, sendTemplate, sendText } from "./client-api";
import { formatRupiah, formatTanggal } from "./format";
import { maskPhone } from "./phone";

// Pesan keluar yang dipicu admin (§13). Di dalam jendela layanan 24 jam sejak pesan
// terakhir klien → teks bebas; di luar itu → message template yang disetujui Meta.

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
// Margin supaya pesan tidak dikirim sebagai teks bebas tepat saat jendela habis.
const WINDOW_MARGIN_MS = 5 * 60 * 1000;

export type OutboundMessage = {
  kind: "offer" | "dp_verified" | "dp_rejected" | "cancelled";
  text: string;
  template: { name: string; params: string[] };
};

export type DeliveryResult =
  | { ok: true; via: "text" | "template"; messageId: string }
  | { ok: false; via: "text" | "template" | null; errorCode: string; messageId: string | null };

export function isWithinServiceWindow(lastInboundAt: Date | null, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() < SERVICE_WINDOW_MS - WINDOW_MARGIN_MS;
}

// Meta menolak parameter template yang berisi baris baru, tab, atau >4 spasi beruntun.
export function templateParam(value: string, maxLength = 500): string {
  const v = value.replace(/\s+/g, " ").trim();
  return (v.length > maxLength ? `${v.slice(0, maxLength - 1)}…` : v) || "-";
}

const greet = (name: string | null) => (name ? `Halo kak ${name}` : "Halo kak");

export function offerMessage(p: {
  clientName: string | null;
  serviceName: string;
  agreedPrice: number;
  dpAmount: number;
  deadline: Date;
  accounts: { name: string; accountNumber: string; accountHolder: string }[];
}): OutboundMessage {
  const accounts = p.accounts.length
    ? `Silakan transfer DP ke salah satu rekening berikut:\n${p.accounts
        .map((a) => `• ${a.name} ${a.accountNumber} a.n. ${a.accountHolder}`)
        .join("\n")}`
    : "Info rekening pembayaran akan dikirim tim kami.";
  return {
    kind: "offer",
    text: [
      `${greet(p.clientName)}, berikut penawaran untuk order *${p.serviceName}*:`,
      `• Harga: *${formatRupiah(p.agreedPrice)}*`,
      `• DP ${DP_PERCENT}%: *${formatRupiah(p.dpAmount)}*`,
      `• Deadline: ${formatTanggal(p.deadline)}`,
      "",
      accounts,
      "",
      "Setelah transfer, kirim foto atau screenshot bukti transfernya di chat ini ya kak.",
    ].join("\n"),
    template: {
      name: WA_TEMPLATES.OFFER,
      params: [
        templateParam(p.clientName ?? "Kak"),
        templateParam(p.serviceName),
        formatRupiah(p.agreedPrice),
        formatRupiah(p.dpAmount),
        formatTanggal(p.deadline),
      ],
    },
  };
}

export function dpVerifiedMessage(p: { clientName: string | null; projectNumber: string; trackingUrl: string }): OutboundMessage {
  return {
    kind: "dp_verified",
    text: `${greet(p.clientName)}, pembayaran DP sudah kami verifikasi. Order kamu sudah jadi project dengan kode *${p.projectNumber}*.\n\nPantau progres project di:\n${p.trackingUrl}`,
    template: {
      name: WA_TEMPLATES.DP_VERIFIED,
      params: [templateParam(p.clientName ?? "Kak"), p.projectNumber, p.trackingUrl],
    },
  };
}

export function dpRejectedMessage(p: { clientName: string | null; serviceName: string; reason: string }): OutboundMessage {
  return {
    kind: "dp_rejected",
    text: `${greet(p.clientName)}, bukti transfer DP untuk order *${p.serviceName}* belum bisa kami terima.\nAlasan: ${p.reason}\n\nSilakan kirim ulang bukti transfer yang sesuai di chat ini ya kak.`,
    template: {
      name: WA_TEMPLATES.DP_REJECTED,
      params: [templateParam(p.clientName ?? "Kak"), templateParam(p.reason)],
    },
  };
}

export function cancelledMessage(p: { clientName: string | null; serviceName: string; reason: string }): OutboundMessage {
  return {
    kind: "cancelled",
    text: `${greet(p.clientName)}, order *${p.serviceName}* dibatalkan oleh tim kami.\nAlasan: ${p.reason}\n\nKalau ada pertanyaan, balas pesan ini ya kak.`,
    template: {
      name: WA_TEMPLATES.CANCELLED,
      params: [templateParam(p.clientName ?? "Kak"), templateParam(p.reason)],
    },
  };
}

/**
 * Kirim pesan ke klien dan simpan sebagai WaMessage OUTBOUND (berhasil atau gagal),
 * supaya portal bisa menampilkan "Pesan gagal terkirim, hubungi klien manual".
 */
export async function sendToClient(conversationId: string, message: OutboundMessage): Promise<DeliveryResult> {
  const conversation = await prisma.waConversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { id: true, waId: true, lastInboundAt: true },
  });
  const via = isWithinServiceWindow(conversation.lastInboundAt) ? "text" : "template";

  const store = (data: { wamid?: string; deliveryStatus: string; errorCode?: string }) =>
    prisma.waMessage.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        type: via,
        body: via === "template" ? `[template ${message.template.name}] ${message.text}` : message.text,
        sentByBot: false,
        ...data,
      },
      select: { id: true },
    });

  let lang: string;
  try {
    lang = getWhatsAppEnv().WHATSAPP_TEMPLATE_LANG;
  } catch {
    const saved = await store({ deliveryStatus: "failed", errorCode: "NOT_CONFIGURED" });
    return { ok: false, via: null, errorCode: "NOT_CONFIGURED", messageId: saved.id };
  }

  try {
    const wamid =
      via === "text"
        ? await sendText(conversation.waId, message.text)
        : await sendTemplate(conversation.waId, message.template.name, lang, message.template.params);
    const saved = await store({ wamid, deliveryStatus: "sent" });
    return { ok: true, via, messageId: saved.id };
  } catch (error) {
    const errorCode = error instanceof WhatsAppApiError ? (error.code ?? String(error.status)) : "SEND_FAILED";
    const saved = await store({ deliveryStatus: "failed", errorCode });
    console.error(`[whatsapp] ${message.kind} gagal ke ${maskPhone(conversation.waId)} via ${via}: ${errorCode}`);
    return { ok: false, via, errorCode, messageId: saved.id };
  }
}
