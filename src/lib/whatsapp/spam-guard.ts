import type { WaIntakeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { WA_RATE_LIMITS } from "@/lib/constants";
import { getChannel, isChannelConfigured, sendTextOnChannel, usesServiceWindow, deliveryErrorCode } from "./channel";
import { listOwnerNumbers } from "./owner/identity";
import { maskPhone } from "./phone";
import { startOfMonthWib } from "./rate-limit";
import { isWithinServiceWindow } from "./outbound";

// Perlindungan spam dan hemat token (docs/WHATSAPP_SPAM_GUARD.md).

/** Jeda sebelum membalas, supaya pesan beruntun digabung jadi satu giliran (§2). */
export function waitForBurst(ms: number = WA_RATE_LIMITS.debounceMs): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

// ── Basa-basi setelah brief (§4) ────────────────────────────────────────────

/** Status order yang briefnya sudah dikonfirmasi: basa-basi tidak perlu dibalas. */
export const SMALL_TALK_SILENT_STATUSES: ReadonlySet<WaIntakeStatus> = new Set(["AWAITING_QUOTE", "DP_REVIEW", "APPROVED"]);

const SMALL_TALK_WORDS = new Set([
  "ok",
  "oke",
  "okay",
  "okey",
  "okee",
  "okeh",
  "sip",
  "siap",
  "baik",
  "noted",
  "mantap",
  "mantab",
  "makasih",
  "makasi",
  "makasii",
  "makasihh",
  "trims",
  "thanks",
  "thank",
  "you",
  "thx",
  "tq",
  "ty",
  "terima",
  "kasih",
  "kak",
  "ka",
  "min",
  "ya",
  "yaa",
  "iya",
  "iyaa",
  "yups",
  "yup",
  "banyak",
  "sekali",
  "deh",
  "dong",
  "nya",
]);

const SMALL_TALK_MAX_CHARS = 25;

/**
 * Pesan yang isinya hanya basa-basi: kata dari daftar di atas, emoji, atau tanda baca.
 * Pertanyaan (ada "?") atau kata lain → bukan basa-basi.
 */
export function isSmallTalk(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > SMALL_TALK_MAX_CHARS || t.includes("?")) return false;
  const words = t
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]/gu, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    // "okeee", "siapp" → huruf berulang di akhir diringkas dulu
    .map((w) => w.replace(/(\p{L})\1+$/u, "$1$1").replace(/(\p{L})\1$/u, "$1"));
  return words.every((w) => SMALL_TALK_WORDS.has(w));
}

// ── Potong teks panjang (§6) ────────────────────────────────────────────────

export function trimForAi(text: string, max: number = WA_RATE_LIMITS.inboundMaxCharsForAi): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[Pesan klien dipotong: ${text.length.toLocaleString("id-ID")} karakter, yang terbaca ${max.toLocaleString("id-ID")} karakter pertama. Jika bagian sisanya penting, minta klien meringkas.]`;
}

// ── Rem bulanan (§3) ────────────────────────────────────────────────────────

export type MonthlyBrake = { cap: number; used: number; active: boolean; month: string };

const wibMonth = (now: Date) => new Date(startOfMonthWib(now).getTime() + 7 * 60 * 60_000).toISOString().slice(0, 7);

/** Balasan bot bulan ini (WIB) ke klien sungguhan, dibanding batas owner. */
export async function getMonthlyBrake(now = new Date()): Promise<MonthlyBrake> {
  const [settings, used] = await Promise.all([
    prisma.studioSettings.findUnique({ where: { id: "default" }, select: { waBotMonthlyReplyCap: true } }),
    prisma.waMessage.count({
      where: {
        createdAt: { gte: startOfMonthWib(now) },
        direction: "OUTBOUND",
        sentByBot: true,
        NOT: { deliveryStatus: "failed" },
        conversation: { isSandbox: false },
      },
    }),
  ]);
  const cap = settings?.waBotMonthlyReplyCap ?? WA_RATE_LIMITS.monthlyReplyCapDefault;
  return { cap, used, active: used >= cap, month: wibMonth(now) };
}

/**
 * Beri tahu owner sekali per bulan saat rem aktif. Hanya teks biasa (tanpa template berbayar): di Meta
 * hanya terkirim jika owner masih dalam jendela 24 jam; banner di portal selalu tampil.
 */
export async function notifyOwnersBrakeOnce(brake: MonthlyBrake): Promise<void> {
  const { count } = await prisma.studioSettings.updateMany({
    where: { id: "default", OR: [{ waBotCapNotifiedMonth: null }, { waBotCapNotifiedMonth: { not: brake.month } }] },
    data: { waBotCapNotifiedMonth: brake.month },
  });
  if (count === 0) return;
  console.warn(`[whatsapp] rem bulanan aktif: ${brake.used}/${brake.cap} balasan bot bulan ${brake.month}`);

  const channel = await getChannel();
  if (!isChannelConfigured(channel)) return;
  const text = `⚠️ Rem bulanan bot aktif: ${brake.used.toLocaleString("id-ID")} dari ${brake.cap.toLocaleString("id-ID")} balasan bot bulan ini sudah terpakai. Bot berhenti membalas otomatis sampai awal bulan depan; pesan klien tetap masuk di Order WA. Batas bisa dinaikkan di portal: Settings › WhatsApp › Pemakaian.`;
  for (const owner of await listOwnerNumbers()) {
    const conversation = await prisma.waConversation.findUnique({
      where: { waId: owner.waNumber },
      select: { id: true, lastInboundAt: true },
    });
    if (!conversation) continue;
    if (usesServiceWindow(channel) && !isWithinServiceWindow(conversation.lastInboundAt)) continue;
    try {
      const wamid = await sendTextOnChannel(owner.waNumber, text, channel);
      await prisma.waMessage.create({
        data: { conversationId: conversation.id, wamid, direction: "OUTBOUND", body: text, sentByBot: true, deliveryStatus: "sent" },
      });
    } catch (error) {
      console.error(`[whatsapp] info rem ke owner ${maskPhone(owner.waNumber)} gagal: ${deliveryErrorCode(error)}`);
    }
  }
}
