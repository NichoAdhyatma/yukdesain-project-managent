import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { resolveOwner } from "./owner/identity";

// Admin membalas langsung dari HP nomor Kirimi (docs/WHATSAPP_CHANNEL_KIRIMI.md §10). Setiap pesan keluar dari
// perangkat memantul ke webhook (isFromMe). Pantulan yang isinya sama dengan pesan yang baru dikirim bot / portal
// diabaikan; selebihnya diketik admin di HP: chat pindah ke mode HUMAN dan pesannya dicatat di riwayat.

/** Jeda sebelum mencocokkan: pesan bot/portal baru tersimpan setelah Kirimi menjawab, pantulannya bisa lebih dulu. */
export const ECHO_SETTLE_MS = 10_000;
/** Pesan keluar portal/bot yang dianggap "baru dikirim" saat mencocokkan pantulan. */
const MATCH_WINDOW_MS = 10 * 60_000;

export const PHONE_REPLY_WAMID_PREFIX = "kirimi:phone:";
export const PHONE_MEDIA_BODY = "[Media dikirim dari HP admin]";

export type KirimiEcho = { to: { waId: string | null; lid: string | null }; body: string; msgId: string | null };

export type EchoOutcome = "own" | "takeover" | "already_human" | "duplicate" | "owner" | "no_conversation";

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

async function findConversation(to: KirimiEcho["to"]) {
  const select = { id: true, waId: true, mode: true, isSandbox: true } as const;
  if (to.waId) {
    const byPhone = await prisma.waConversation.findUnique({ where: { waId: to.waId }, select });
    if (byPhone) return byPhone;
  }
  if (to.lid) return prisma.waConversation.findFirst({ where: { waLid: to.lid, isSandbox: false }, select });
  return null;
}

/**
 * Proses satu pantulan pesan keluar. Dipanggil setelah ECHO_SETTLE_MS supaya pesan bot/portal sudah tersimpan.
 * Chat yang belum ada (admin menyapa pelanggan lama lebih dulu) dibuat langsung dalam mode HUMAN.
 */
export async function handleKirimiEcho(echo: KirimiEcho, now = new Date()): Promise<EchoOutcome> {
  const wamid = echoWamid(echo, now);
  if (await prisma.waMessage.findUnique({ where: { wamid }, select: { id: true } })) return "duplicate";

  let conversation = await findConversation(echo.to);
  if (conversation) {
    const recent = await prisma.waMessage.findMany({
      where: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        createdAt: { gte: new Date(now.getTime() - MATCH_WINDOW_MS) },
        NOT: { wamid: { startsWith: PHONE_REPLY_WAMID_PREFIX } },
      },
      select: { body: true },
    });
    if (isOwnEcho(echo.body, recent.map((m) => m.body))) return "own";
  }

  const waId = conversation?.waId ?? echo.to.waId;
  if (!waId) return "no_conversation";
  // Chat ke nomor owner tetap jalur instruksi owner; tidak dialihkan.
  if (await resolveOwner({ waId, isSandbox: false })) return "owner";

  conversation ??= await prisma.waConversation.upsert({
    where: { waId },
    create: { waId, mode: "HUMAN", waLid: echo.to.lid },
    update: {},
    select: { id: true, waId: true, mode: true, isSandbox: true },
  });
  if (conversation.isSandbox) return "no_conversation";

  // Tanpa notifikasi: admin sendiri yang sedang membalas.
  const { count } = await prisma.waConversation.updateMany({
    where: { id: conversation.id, mode: "BOT" },
    data: { mode: "HUMAN" },
  });
  try {
    await prisma.waMessage.create({
      data: {
        conversationId: conversation.id,
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
