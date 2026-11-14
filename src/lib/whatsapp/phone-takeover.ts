import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { notifyOwnersPush } from "@/lib/notifications/push";
import { listOwnerNumbers } from "./owner/identity";
import { maskPhone } from "./phone";

// Admin membalas langsung dari HP nomor Kirimi (docs/WHATSAPP_CHANNEL_KIRIMI.md §10). Setiap pesan keluar dari
// perangkat memantul ke webhook (isFromMe), tetapi pantulannya hanya membawa nomor perangkat sendiri, tanpa nomor
// klien (dipastikan 2026-11-08). Karena itu:
// - pantulan yang isinya sama dengan pesan bot/portal yang baru terkirim (chat mana pun) diabaikan;
// - selebihnya diketik admin di HP: bila tepat satu chat aktif (pesan klien 15 menit terakhir), chat itu pindah ke
//   mode HUMAN dan pesannya dicatat; bila lebih dari satu, sistem tidak menebak dan owner diberi notifikasi.

/** Jeda sebelum mencocokkan: pesan bot/portal baru tersimpan setelah Kirimi menjawab, pantulannya bisa lebih dulu. */
export const ECHO_SETTLE_MS = 10_000;
/** Pesan keluar portal/bot yang dianggap "baru dikirim" saat mencocokkan pantulan. */
const MATCH_WINDOW_MS = 10 * 60_000;
/** Chat dianggap aktif bila klien mengirim pesan dalam rentang ini. */
export const ACTIVE_CHAT_WINDOW_MS = 15 * 60_000;
/** Notifikasi "belum dicocokkan" paling banyak sekali per rentang ini (produksi 9–10 Nov: ±200 per hari). */
export const AMBIGUOUS_NOTIFY_INTERVAL_MS = 15 * 60_000;

// Satu proses Node di VPS: cukup di memori; restart hanya membuat satu notifikasi lebih awal.
let lastAmbiguousNotifyAt = 0;

/** Untuk tes: kosongkan batas waktu notifikasi. */
export function resetPhoneReplyNotifyThrottle(): void {
  lastAmbiguousNotifyAt = 0;
}

export const PHONE_REPLY_WAMID_PREFIX = "kirimi:phone:";
export const PHONE_MEDIA_BODY = "[Media dikirim dari HP admin]";

/** Teks pantulan yang disimpan: media ditandai, keterangannya ikut (bukan seolah admin mengetik keterangan itu). */
function echoBody(echo: KirimiEcho): string {
  const caption = echo.body.trim();
  if (echo.hasMedia) return caption ? `${PHONE_MEDIA_BODY} ${caption}` : PHONE_MEDIA_BODY;
  return caption ? echo.body : PHONE_MEDIA_BODY;
}

export type KirimiEcho = { to: { waId: string | null; lid: string | null }; body: string; msgId: string | null; hasMedia?: boolean };

export type EchoOutcome =
  | "bot_off"
  | "own"
  | "takeover"
  | "already_human"
  | "duplicate"
  | "ambiguous"
  | "ambiguous_all_human"
  | "no_active_chat"
  | "auto_greeting";

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** Pantulan pesan yang dikirim bot / portal sendiri? Dicocokkan dari isi (Kirimi tidak mengembalikan id pesan). */
// Gambar yang dikirim sistem (QRIS di invoice, outbound.ts) disimpan sebagai "[Gambar <caption>] <url>"; pantulannya
// dari Kirimi hanya membawa caption.
const SENT_IMAGE = /^\[Gambar ([\s\S]+?)\] \S+$/;

export function isOwnEcho(echoBody: string, recentOutbound: string[]): boolean {
  const echo = normalize(echoBody);
  // Pantulan tanpa teks = admin mengirim foto/stiker dari HP (gambar dari sistem selalu punya caption).
  if (!echo) return false;
  return recentOutbound.some((body) => {
    const sent = normalize(body.match(SENT_IMAGE)?.[1] ?? body);
    if (sent === echo) return true;
    // Toleransi kecil (emoji/tanda baca di ujung), bukan sekadar awalan: "Halo kak" ≠ balasan bot yang diawali "Halo kak".
    const [short, long] = sent.length <= echo.length ? [sent, echo] : [echo, sent];
    return short.length >= 20 && short.length >= long.length * 0.9 && long.startsWith(short);
  });
}

/** Pesan yang diketik admin di HP (wamid kirimi:phone:…), ditampilkan sebagai balasan admin. */
export function isPhoneReplyWamid(wamid: string | null): boolean {
  return !!wamid?.startsWith(PHONE_REPLY_WAMID_PREFIX);
}

function echoWamid(echo: KirimiEcho, now: Date): string {
  if (echo.msgId) return `${PHONE_REPLY_WAMID_PREFIX}${echo.msgId}`;
  const minute = Math.floor(now.getTime() / 60_000);
  return `${PHONE_REPLY_WAMID_PREFIX}${createHash("sha256")
    .update(`${echo.to.waId}|${echo.to.lid}|${echo.body}|${minute}`)
    .digest("hex")
    .slice(0, 32)}`;
}

/**
 * Sapaan otomatis dikirim aplikasi WA Business segera setelah pesan pertama klien (kontak baru / lama tidak chat).
 * Produksi 8–12 Nov: 24 dari 25 sapaan tercatat −1 s/d +20 detik dari pesan klien; balasan cepat admin dari HP
 * (8–12 detik) selalu pendek, jadi sapaan juga harus panjang (GREETING_MIN_LENGTH).
 */
export const GREETING_WINDOW_MS = 30_000;
/** Sapaan WA Business studio 345 karakter; balasan cepat admin ("selamat pagi ka", "boleh kak") jauh lebih pendek. */
export const GREETING_MIN_LENGTH = 100;
/** Jeda sepi sebelum pesan klien itu: pesan baru setelah sepi selama ini memicu sapaan WA Business. */
export const GREETING_QUIET_MS = 24 * 3_600_000;

/**
 * Pantulan ini sapaan otomatis WA Business? Produksi 2026-11-12 (Virgi, Santi, gg, hastalinuwih): sapaan "Hai Kak,
 * selamat datang di Yukdesainn!" keluar dari HP studio saat kontak baru menulis, lalu dianggap ketikan admin.
 * Ciri: teks minimal GREETING_MIN_LENGTH, pesan klien pertama dalam GREETING_WINDOW_MS terakhir, dan sebelum itu chat
 * sepi minimal GREETING_QUIET_MS. Diuji pada pantulan produksi 8–12 Nov: 25/25 sapaan cocok, 0 balasan admin.
 */
async function looksLikeAutoGreeting(conversationId: string, body: string, now: Date): Promise<boolean> {
  if (normalize(body).length < GREETING_MIN_LENGTH) return false;
  const [first] = await prisma.waMessage.findMany({
    where: { conversationId, direction: "INBOUND", createdAt: { gte: new Date(now.getTime() - GREETING_WINDOW_MS) } },
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { createdAt: true },
  });
  if (!first) return false;
  const prior = await prisma.waMessage.findFirst({
    where: { conversationId, createdAt: { lt: first.createdAt } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return !prior || first.createdAt.getTime() - prior.createdAt.getTime() >= GREETING_QUIET_MS;
}

/** Chat klien yang aktif: ada pesan klien dalam ACTIVE_CHAT_WINDOW_MS. Chat instruksi owner tidak dihitung. */
async function activeChats(now: Date) {
  const [chats, owners] = await Promise.all([
    prisma.waConversation.findMany({
      where: {
        isSandbox: false,
        blockedAt: null,
        messages: { some: { direction: "INBOUND", createdAt: { gte: new Date(now.getTime() - ACTIVE_CHAT_WINDOW_MS) } } },
      },
      select: { id: true, waId: true, profileName: true, mode: true, ownerActsAsClient: true },
    }),
    listOwnerNumbers(),
  ]);
  const ownerNumbers = new Set(owners.map((o) => o.waNumber));
  return chats.filter((c) => !ownerNumbers.has(c.waId) || c.ownerActsAsClient);
}

/**
 * Proses satu pantulan pesan keluar. Dipanggil setelah ECHO_SETTLE_MS supaya pesan bot/portal sudah tersimpan.
 * Pantulan tidak membawa nomor klien, jadi chat tujuan ditentukan dari chat yang sedang aktif.
 */
export async function handleKirimiEcho(echo: KirimiEcho, now = new Date()): Promise<EchoOutcome> {
  // Balas otomatis portal mati (mis. Agen AI Kirimi yang sedang membalas): tidak ada bot yang perlu dihentikan, dan
  // balasan AI Kirimi tidak boleh dianggap ketikan admin (2026-11-11: 41 chat pindah ke admin karena itu).
  const settings = await prisma.studioSettings.findUnique({ where: { id: "default" }, select: { waBotEnabled: true } });
  if (!settings?.waBotEnabled) return "bot_off";

  const wamid = echoWamid(echo, now);
  if (await prisma.waMessage.findUnique({ where: { wamid }, select: { id: true } })) return "duplicate";

  // Pesan bot / portal dari chat mana pun yang baru terkirim.
  const recent = await prisma.waMessage.findMany({
    where: {
      direction: "OUTBOUND",
      createdAt: { gte: new Date(now.getTime() - MATCH_WINDOW_MS) },
      NOT: { wamid: { startsWith: PHONE_REPLY_WAMID_PREFIX } },
    },
    select: { body: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  if (isOwnEcho(echo.body, recent.map((m) => m.body))) return "own";

  const chats = await activeChats(now);
  if (chats.length === 0) return "no_active_chat";
  if (chats.length > 1) {
    // Tidak menebak. Notifikasi hanya bila masih ada chat aktif yang dipegang bot (kalau semuanya sudah di admin,
    // bot memang diam), dan paling banyak sekali per AMBIGUOUS_NOTIFY_INTERVAL_MS.
    const botChats = chats.filter((c) => c.mode === "BOT");
    if (botChats.length === 0) return "ambiguous_all_human";
    if (now.getTime() - lastAmbiguousNotifyAt >= AMBIGUOUS_NOTIFY_INTERVAL_MS) {
      lastAmbiguousNotifyAt = now.getTime();
      const names = botChats.map((c) => c.profileName ?? maskPhone(c.waId));
      const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? ` (+${names.length - 3})` : "");
      void notifyOwnersPush("NEEDS_ADMIN", {
        title: "Balasan dari HP belum dicocokkan",
        body: `Masih dipegang bot: ${shown}. Tekan "Ambil alih" di Inbox pada chat yang kamu balas.`,
        url: "/wa-orders?tab=inbox",
        tag: "PHONE_REPLY",
      });
    }
    return "ambiguous";
  }

  const [chat] = chats;
  // Sapaan otomatis WA Business: dicatat di chat (pesan tim), tetapi bot tetap melayani.
  const greeting = await looksLikeAutoGreeting(chat.id, echo.body, now);
  // Tanpa notifikasi: admin sendiri yang sedang membalas.
  const { count } = greeting
    ? { count: 0 }
    : await prisma.waConversation.updateMany({ where: { id: chat.id, mode: "BOT" }, data: { mode: "HUMAN" } });
  try {
    await prisma.waMessage.create({
      data: {
        conversationId: chat.id,
        wamid,
        direction: "OUTBOUND",
        type: "text",
        body: echoBody(echo),
        sentByBot: false,
        deliveryStatus: "sent",
        createdAt: now,
      },
    });
  } catch (error) {
    // Webhook yang sama datang bersamaan (Kirimi mencoba ulang): cukup satu catatan.
    if ((error as { code?: string }).code === "P2002") return "duplicate";
    throw error;
  }
  if (greeting) return "auto_greeting";
  return count === 1 ? "takeover" : "already_human";
}

/** Simpan LID pengirim pada percakapannya (untuk pantulan yang hanya membawa LID). */
export async function rememberConversationLid(waId: string, lid: string): Promise<void> {
  await prisma.waConversation.updateMany({
    where: { waId, OR: [{ waLid: null }, { waLid: { not: lid } }] },
    data: { waLid: lid },
  });
}
