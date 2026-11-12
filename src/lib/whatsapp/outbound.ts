import { prisma } from "@/lib/db";
import { WA_TEMPLATES } from "@/lib/constants";
import { randomInt } from "node:crypto";
import {
  deliveryErrorCode,
  getChannel,
  isChannelConfigured,
  sendImageOnChannel,
  sendTemplateOnChannel,
  sendTextOnChannel,
  usesServiceWindow,
} from "./channel";
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
  /** false = isi template Meta tidak cocok dengan pesan ini (template penawaran tertulis "DP 50%"); jangan kirim lewat template */
  templateMatchesText?: boolean;
};

// Isi template yd_penawaran_order yang disetujui Meta menulis DP 50% (docs/WHATSAPP_TEMPLATES.md).
const OFFER_TEMPLATE_DP_PERCENT = 50;

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

const INVOICE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Nomor invoice WA: INV-WA-YYYYMMDD-XXXX, tanggal WIB, XXXX 4 karakter acak [A-Z0-9]. */
export function invoiceNumberFor(now: Date): string {
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).replaceAll("-", "");
  const code = Array.from({ length: 4 }, () => INVOICE_ALPHABET[randomInt(INVOICE_ALPHABET.length)]).join("");
  return `INV-WA-${date}-${code}`;
}

/**
 * Invoice setelah admin menyimpan harga (spec 2026-11-11-kb-merge-design §5): tagihan DP dari snapshot order, sisa
 * pelunasan, deadline, dan semua metode bayar aktif. QRIS dikirim terpisah sebagai gambar (sendInvoiceToClient).
 * Di luar 24 jam (Meta) pembukanya tetap template penawaran yang sudah disetujui.
 */
export function invoiceMessage(p: {
  clientName: string | null;
  serviceName: string;
  invoiceNumber: string;
  agreedPrice: number;
  dpAmount: number;
  dpPercent: number;
  deadline: Date;
  /** Rincian harga (paket/unit dari kalkulator), boleh kosong */
  lines: string[];
  accounts: { name: string; accountNumber: string; accountHolder: string }[];
  /** Ada QRIS yang dikirim sebagai gambar setelah pesan ini */
  hasQris?: boolean;
}): OutboundMessage {
  const methods = p.accounts.length
    ? [
        "Metode pembayaran:",
        ...p.accounts.map((a) => `• ${a.name} ${a.accountNumber} a.n. ${a.accountHolder}`),
        ...(p.hasQris ? ["QRIS kami kirim sebagai gambar setelah pesan ini."] : []),
      ].join("\n")
    : "Metode pembayaran akan dikirim tim kami.";
  return {
    kind: "offer",
    templateMatchesText: p.dpPercent === OFFER_TEMPLATE_DP_PERCENT,
    text: [
      `${greet(p.clientName)}, berikut invoice order *${p.serviceName}*:`,
      `Invoice ${p.invoiceNumber}`,
      ...p.lines.map((l) => `• Rincian: ${l}`),
      `• Total: *${formatRupiah(p.agreedPrice)}*`,
      `• Tagihan DP ${p.dpPercent}%: *${formatRupiah(p.dpAmount)}*`,
      `• Sisa pelunasan: *${formatRupiah(Math.max(0, p.agreedPrice - p.dpAmount))}*`,
      `• Deadline: ${formatTanggal(p.deadline)}`,
      "",
      methods,
      "",
      "Setelah transfer DP, kirim foto atau screenshot bukti transfernya di chat ini ya kak.",
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

export function offerMessage(p: {
  clientName: string | null;
  serviceName: string;
  agreedPrice: number;
  dpAmount: number;
  dpPercent: number;
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
    templateMatchesText: p.dpPercent === OFFER_TEMPLATE_DP_PERCENT,
    text: [
      `${greet(p.clientName)}, berikut penawaran untuk order *${p.serviceName}*:`,
      `• Harga: *${formatRupiah(p.agreedPrice)}*`,
      `• DP ${p.dpPercent}%: *${formatRupiah(p.dpAmount)}*`,
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
  const channel = await getChannel();
  // Fonnte tidak punya aturan 24 jam/template: selalu teks (docs/WHATSAPP_CHANNEL_FONNTE.md §3).
  const via = !usesServiceWindow(channel) || isWithinServiceWindow(conversation.lastInboundAt) ? "text" : "template";

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

  if (!isChannelConfigured(channel)) {
    const saved = await store({ deliveryStatus: "failed", errorCode: "NOT_CONFIGURED" });
    return { ok: false, via: null, errorCode: "NOT_CONFIGURED", messageId: saved.id };
  }
  // Template penawaran tertulis DP 50%: dengan DP lain dari Operasional studio, lebih baik gagal (admin menghubungi
  // klien manual) daripada klien menerima persen yang salah (docs/STUDIO_OPERATIONS.md §5).
  if (via === "template" && message.templateMatchesText === false) {
    const saved = await store({ deliveryStatus: "failed", errorCode: "TEMPLATE_DP_MISMATCH" });
    return { ok: false, via, errorCode: "TEMPLATE_DP_MISMATCH", messageId: saved.id };
  }

  try {
    const wamid =
      via === "text"
        ? await sendTextOnChannel(conversation.waId, message.text, channel)
        : (await sendTemplateOnChannel(conversation.waId, message.template, message.text, channel)).id;
    const saved = await store({ wamid, deliveryStatus: "sent" });
    return { ok: true, via, messageId: saved.id };
  } catch (error) {
    const errorCode = deliveryErrorCode(error);
    const saved = await store({ deliveryStatus: "failed", errorCode });
    console.error(`[whatsapp] ${message.kind} gagal ke ${maskPhone(conversation.waId)} via ${via}: ${errorCode}`);
    return { ok: false, via, errorCode, messageId: saved.id };
  }
}

export type InvoiceDelivery = DeliveryResult & { qrisSent: number; qrisFailed: number };

/**
 * Kirim invoice lalu setiap QRIS (URL https) sebagai gambar. Gambar gagal → URL dikirim sebagai teks. Di Meta di luar
 * jendela 24 jam gambar maupun teks bebas tidak bisa dikirim: QRIS dihitung gagal (admin melihatnya di hasil kirim).
 */
export async function sendInvoiceToClient(
  conversationId: string,
  message: OutboundMessage,
  qris: { name: string; url: string }[],
): Promise<InvoiceDelivery> {
  const images = qris.filter((q) => /^https:\/\//i.test(q.url.trim()));
  const delivery = await sendToClient(conversationId, message);
  if (!delivery.ok) return { ...delivery, qrisSent: 0, qrisFailed: images.length };

  const conversation = await prisma.waConversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { waId: true, lastInboundAt: true },
  });
  const channel = await getChannel();
  const withinServiceWindow = !usesServiceWindow(channel) || isWithinServiceWindow(conversation.lastInboundAt);
  const store = (body: string, data: { wamid?: string; deliveryStatus: string; errorCode?: string }) =>
    prisma.waMessage.create({ data: { conversationId, direction: "OUTBOUND", type: "text", body, sentByBot: false, ...data } });

  let qrisSent = 0;
  let qrisFailed = 0;
  for (const q of images) {
    // Akun yang namanya sudah diawali "QRIS" tidak diberi awalan lagi ("QRIS QRIS").
    const caption = /^qris\b/i.test(q.name.trim()) ? q.name.trim() : `QRIS ${q.name}`;
    const url = q.url.trim();
    try {
      const wamid = await sendImageOnChannel(conversation.waId, url, caption, channel, { withinServiceWindow });
      await store(`[Gambar ${caption}] ${url}`, { wamid, deliveryStatus: "sent" });
      qrisSent++;
      continue;
    } catch (error) {
      console.error(`[whatsapp] gambar QRIS gagal ke ${maskPhone(conversation.waId)}: ${deliveryErrorCode(error)}`);
    }
    qrisFailed++;
    if (!withinServiceWindow) {
      await store(`[Gambar ${caption}] ${url}`, { deliveryStatus: "failed", errorCode: "OUTSIDE_WINDOW" });
      continue;
    }
    const fallback = `${caption}: ${url}`;
    try {
      await store(fallback, { wamid: await sendTextOnChannel(conversation.waId, fallback, channel), deliveryStatus: "sent" });
    } catch (error) {
      await store(fallback, { deliveryStatus: "failed", errorCode: deliveryErrorCode(error) });
    }
  }
  return { ...delivery, qrisSent, qrisFailed };
}

/**
 * Pesan sistem berupa teks saja (kabar otomatis ke klien, docs/CLIENT_NOTIFICATIONS.md). Tidak pernah lewat template:
 * di saluran dengan jendela 24 jam (Meta) dan di luar jendela, pesan tidak dikirim dan tidak disimpan.
 */
export async function sendSystemText(conversationId: string, text: string): Promise<DeliveryResult> {
  const conversation = await prisma.waConversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { id: true, waId: true, lastInboundAt: true },
  });
  const channel = await getChannel();
  if (usesServiceWindow(channel) && !isWithinServiceWindow(conversation.lastInboundAt)) {
    return { ok: false, via: null, errorCode: "OUTSIDE_SERVICE_WINDOW", messageId: null };
  }
  const store = (data: { wamid?: string; deliveryStatus: string; errorCode?: string }) =>
    prisma.waMessage.create({
      data: { conversationId, direction: "OUTBOUND", type: "text", body: text, sentByBot: false, ...data },
      select: { id: true },
    });
  if (!isChannelConfigured(channel)) {
    const saved = await store({ deliveryStatus: "failed", errorCode: "NOT_CONFIGURED" });
    return { ok: false, via: null, errorCode: "NOT_CONFIGURED", messageId: saved.id };
  }
  try {
    const wamid = await sendTextOnChannel(conversation.waId, text, channel);
    const saved = await store({ wamid, deliveryStatus: "sent" });
    return { ok: true, via: "text", messageId: saved.id };
  } catch (error) {
    const errorCode = deliveryErrorCode(error);
    const saved = await store({ deliveryStatus: "failed", errorCode });
    console.error(`[whatsapp] kabar sistem gagal ke ${maskPhone(conversation.waId)}: ${errorCode}`);
    return { ok: false, via: "text", errorCode, messageId: saved.id };
  }
}

// Batas teks bebas Cloud API (text.body).
export const MANUAL_REPLY_MAX_LENGTH = 4096;

/**
 * Balasan manual admin dari portal (mode HUMAN). Hanya teks bebas, jadi pemanggil wajib
 * memastikan masih di dalam jendela 24 jam. Disimpan sebagai OUTBOUND (berhasil atau gagal)
 * dengan sentById supaya portal bisa membedakannya dari pesan bot/sistem.
 */
export async function sendManualReply(
  conversation: { id: string; waId: string },
  text: string,
  senderId: string,
): Promise<DeliveryResult> {
  const store = (data: { wamid?: string; deliveryStatus: string; errorCode?: string }) =>
    prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        type: "text",
        body: text,
        sentByBot: false,
        sentById: senderId,
        ...data,
      },
      select: { id: true },
    });

  const channel = await getChannel();
  if (!isChannelConfigured(channel)) {
    const saved = await store({ deliveryStatus: "failed", errorCode: "NOT_CONFIGURED" });
    return { ok: false, via: null, errorCode: "NOT_CONFIGURED", messageId: saved.id };
  }

  try {
    const wamid = await sendTextOnChannel(conversation.waId, text, channel);
    const saved = await store({ wamid, deliveryStatus: "sent" });
    return { ok: true, via: "text", messageId: saved.id };
  } catch (error) {
    const errorCode = deliveryErrorCode(error);
    const saved = await store({ deliveryStatus: "failed", errorCode });
    console.error(`[whatsapp] balasan manual gagal ke ${maskPhone(conversation.waId)}: ${errorCode}`);
    return { ok: false, via: "text", errorCode, messageId: saved.id };
  }
}
