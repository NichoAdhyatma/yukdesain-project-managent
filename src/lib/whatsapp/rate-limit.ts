import { prisma } from "@/lib/db";
import { WA_RATE_LIMITS } from "@/lib/constants";

// Rate limit dihitung dari tabel DB (tanpa Redis, §6). Semua fungsi di sini hanya membaca.

export type InboundRate = "ok" | "warn" | "ignore";

/**
 * Pesan masuk dalam jendela 5 menit (termasuk pesan ini). Pesan pertama yang melewati
 * batas mendapat peringatan; sisanya diabaikan tanpa balasan.
 */
export async function checkInboundRate(conversationId: string, at: Date): Promise<InboundRate> {
  const since = new Date(at.getTime() - WA_RATE_LIMITS.inboundWindowMinutes * 60_000);
  const count = await prisma.waMessage.count({
    where: { conversationId, direction: "INBOUND", createdAt: { gt: since, lte: at } },
  });
  if (count <= WA_RATE_LIMITS.inboundPerWindow) return "ok";
  return count === WA_RATE_LIMITS.inboundPerWindow + 1 ? "warn" : "ignore";
}

/** Balasan bot ke nomor ini dalam 24 jam terakhir sudah mencapai batas. */
export async function botReplyLimitReached(conversationId: string, now = new Date()): Promise<boolean> {
  const count = await prisma.waMessage.count({
    where: {
      conversationId,
      direction: "OUTBOUND",
      sentByBot: true,
      createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60_000) },
    },
  });
  return count >= WA_RATE_LIMITS.botRepliesPerDay;
}

/**
 * Gambar yang sudah diterima untuk order aktif (sejak order dibuat; tanpa order: 24 jam
 * terakhir). Termasuk gambar yang sedang diproses.
 */
export async function imageLimitExceeded(conversationId: string, intakeCreatedAt: Date | null, now = new Date()): Promise<boolean> {
  const since = intakeCreatedAt ?? new Date(now.getTime() - 24 * 60 * 60_000);
  const count = await prisma.waMessage.count({
    where: { conversationId, direction: "INBOUND", type: "image", createdAt: { gte: since } },
  });
  return count > WA_RATE_LIMITS.imagesPerIntake;
}

/** Awal bulan kalender di WIB (UTC+7), untuk statistik bulanan. */
export function startOfMonthWib(now = new Date()): Date {
  const wib = new Date(now.getTime() + 7 * 60 * 60_000);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1) - 7 * 60 * 60_000);
}

export type MonthlyUsage = {
  month: string; // YYYY-MM (WIB)
  outboundSent: number;
  outboundFailed: number;
  templatesSent: number;
  botReplies: number;
  inbound: number;
  warningThreshold: number;
  freeTier: number;
  nearLimit: boolean;
};

export async function getMonthlyUsage(now = new Date()): Promise<MonthlyUsage> {
  const since = startOfMonthWib(now);
  const where = { createdAt: { gte: since } };
  const [outboundSent, outboundFailed, templatesSent, botReplies, inbound] = await Promise.all([
    prisma.waMessage.count({ where: { ...where, direction: "OUTBOUND", NOT: { deliveryStatus: "failed" } } }),
    prisma.waMessage.count({ where: { ...where, direction: "OUTBOUND", deliveryStatus: "failed" } }),
    prisma.waMessage.count({ where: { ...where, direction: "OUTBOUND", type: "template", NOT: { deliveryStatus: "failed" } } }),
    prisma.waMessage.count({ where: { ...where, direction: "OUTBOUND", sentByBot: true, NOT: { deliveryStatus: "failed" } } }),
    prisma.waMessage.count({ where: { ...where, direction: "INBOUND" } }),
  ]);
  const wibMonth = new Date(since.getTime() + 7 * 60 * 60_000).toISOString().slice(0, 7);
  return {
    month: wibMonth,
    outboundSent,
    outboundFailed,
    templatesSent,
    botReplies,
    inbound,
    warningThreshold: WA_RATE_LIMITS.outboundMonthlyWarning,
    freeTier: WA_RATE_LIMITS.outboundMonthlyFreeTier,
    nearLimit: outboundSent >= WA_RATE_LIMITS.outboundMonthlyWarning,
  };
}
