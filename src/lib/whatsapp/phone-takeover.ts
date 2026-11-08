import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { notifyOwnersPush } from "@/lib/notifications/push";
import { listOwnerNumbers } from "./owner/identity";

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

export const PHONE_REPLY_WAMID_PREFIX = "kirimi:phone:";
export const PHONE_MEDIA_BODY = "[Media dikirim dari HP admin]";

export type KirimiEcho = { to: { waId: string | null; lid: string | null }; body: string; msgId: string | null };

export type EchoOutcome = "own" | "takeover" | "already_human" | "duplicate" | "ambiguous" | "no_active_chat";

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** Pantulan pesan yang dikirim bot / portal sendiri? Dicocokkan dari isi (Kirimi tidak mengembalikan id pesan). */
export function isOwnEcho(echoBody: string, recentOutbound: string[]): boolean {
  const echo = normalize(echoBody);
  // Bot tidak pernah mengirim media; pantulan tanpa teks = admin mengirim foto/stiker dari HP.
  if (!echo) return false;
  return recentOutbound.some((body) => {
    const sent = normalize(body);
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

/** Chat klien yang aktif: ada pesan klien dalam ACTIVE_CHAT_WINDOW_MS. Chat instruksi owner tidak dihitung. */
async function activeChats(now: Date) {
  const [chats, owners] = await Promise.all([
    prisma.waConversation.findMany({
      where: {
        isSandbox: false,
        blockedAt: null,
        messages: { some: { direction: "INBOUND", createdAt: { gte: new Date(now.getTime() - ACTIVE_CHAT_WINDOW_MS) } } },
      },
      select: { id: true, waId: true, mode: true, ownerActsAsClient: true },
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
    // Tidak menebak: owner mengambil alih sendiri chat yang dibalas.
    void notifyOwnersPush("NEEDS_ADMIN", {
      title: "Balasan dari HP belum dicocokkan",
      body: `Ada ${chats.length} chat aktif. Tekan "Ambil alih" di Inbox pada chat yang kamu balas, supaya bot berhenti.`,
      url: "/wa-orders?tab=inbox",
      tag: "PHONE_REPLY",
    });
    return "ambiguous";
  }

  const [chat] = chats;
  // Tanpa notifikasi: admin sendiri yang sedang membalas.
  const { count } = await prisma.waConversation.updateMany({ where: { id: chat.id, mode: "BOT" }, data: { mode: "HUMAN" } });
  try {
    await prisma.waMessage.create({
      data: {
        conversationId: chat.id,
        wamid,
        direction: "OUTBOUND",
        type: "text",
        body: normalize(echo.body) ? echo.body : PHONE_MEDIA_BODY,
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
  return count === 1 ? "takeover" : "already_human";
}

/** Simpan LID pengirim pada percakapannya (untuk pantulan yang hanya membawa LID). */
export async function rememberConversationLid(waId: string, lid: string): Promise<void> {
  await prisma.waConversation.updateMany({
    where: { waId, OR: [{ waLid: null }, { waLid: { not: lid } }] },
    data: { waLid: lid },
  });
}
