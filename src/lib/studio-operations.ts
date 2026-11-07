import { z } from "zod";
import { prisma } from "@/lib/db";
import { DP_PERCENT, MAX_REVISION_QUOTA, REVISION_NOTICE } from "@/lib/constants";

// Operasional studio (docs/STUDIO_OPERATIONS.md): satu sumber untuk DP, kuota revisi, kebijakan, dan jam kerja.
// Dibaca portal dan bot WhatsApp. Nilai yang mengikat transaksi di-snapshot (Project.revisionQuota, WaIntake.dpPercent).

export type StudioOperations = {
  dpPercent: number;
  revisionQuota: number;
  revisionNotice: string;
  settlementNote: string;
  /** 1 = Senin … 7 = Minggu, urut naik */
  workingDays: number[];
  /** "HH:mm" WIB */
  workingHoursStart: string;
  workingHoursEnd: string;
  outsideHoursNote: string;
};

export const OPERATIONS_DEFAULTS: StudioOperations = {
  dpPercent: DP_PERCENT,
  revisionQuota: MAX_REVISION_QUOTA,
  revisionNotice: REVISION_NOTICE,
  settlementNote: "Pelunasan dilakukan setelah desain selesai.",
  workingDays: [1, 2, 3, 4, 5, 6],
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  outsideHoursNote: "Admin membalas di jam kerja berikutnya.",
};

const time = (label: string) => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label}: format JJ:MM, mis. 09:00`);
const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export const studioOperationsSchema = z
  .object({
    dpPercent: z.number().int("Harus bilangan bulat").min(10, "Minimal 10%").max(100, "Maksimal 100%"),
    revisionQuota: z.number().int("Harus bilangan bulat").min(0, "Minimal 0").max(10, "Maksimal 10"),
    revisionNotice: z.string().trim().min(1, "Wajib diisi").max(300, "Maksimal 300 karakter"),
    settlementNote: z.string().trim().min(1, "Wajib diisi").max(200, "Maksimal 200 karakter"),
    workingDays: z
      .array(z.number().int().min(1, "Hari tidak valid").max(7, "Hari tidak valid"))
      .min(1, "Pilih minimal satu hari kerja")
      .max(7)
      .refine((days) => new Set(days).size === days.length, "Hari tidak boleh dobel")
      .transform((days) => [...days].sort((a, b) => a - b)),
    workingHoursStart: time("Jam mulai"),
    workingHoursEnd: time("Jam selesai"),
    outsideHoursNote: z.string().trim().min(1, "Wajib diisi").max(200, "Maksimal 200 karakter"),
  })
  .refine((o) => toMinutes(o.workingHoursStart) < toMinutes(o.workingHoursEnd), {
    message: "Jam selesai harus setelah jam mulai (tidak melewati tengah malam)",
    path: ["workingHoursEnd"],
  });

let cached: StudioOperations | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export async function getStudioOperations(): Promise<StudioOperations> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  const row = await prisma.studioSettings.findUnique({
    where: { id: "default" },
    select: {
      opsDpPercent: true,
      opsRevisionQuota: true,
      opsRevisionNotice: true,
      opsSettlementNote: true,
      opsWorkingDays: true,
      opsWorkingHoursStart: true,
      opsWorkingHoursEnd: true,
      opsOutsideHoursNote: true,
    },
  });
  cached = row
    ? {
        dpPercent: row.opsDpPercent,
        revisionQuota: row.opsRevisionQuota,
        revisionNotice: row.opsRevisionNotice ?? OPERATIONS_DEFAULTS.revisionNotice,
        settlementNote: row.opsSettlementNote ?? OPERATIONS_DEFAULTS.settlementNote,
        workingDays: row.opsWorkingDays.length ? row.opsWorkingDays : OPERATIONS_DEFAULTS.workingDays,
        workingHoursStart: row.opsWorkingHoursStart,
        workingHoursEnd: row.opsWorkingHoursEnd,
        outsideHoursNote: row.opsOutsideHoursNote ?? OPERATIONS_DEFAULTS.outsideHoursNote,
      }
    : OPERATIONS_DEFAULTS;
  cachedAt = Date.now();
  return cached;
}

export function invalidateOperationsCache(): void {
  cached = null;
  cachedAt = 0;
}

// WIB = UTC+7 tetap (Indonesia tanpa DST).
const WIB_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

/** Hari ISO (1 = Senin … 7 = Minggu) dan menit sejak tengah malam, di WIB. */
function wibParts(date: Date): { day: number; minutes: number; midnightUtcMs: number } {
  const shifted = new Date(date.getTime() + WIB_OFFSET_MS);
  const minutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  const midnightUtcMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - WIB_OFFSET_MS;
  return { day: shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay(), minutes, midnightUtcMs };
}

export function isWithinWorkingHours(now: Date, ops: StudioOperations): boolean {
  const { day, minutes } = wibParts(now);
  return ops.workingDays.includes(day) && minutes >= toMinutes(ops.workingHoursStart) && minutes < toMinutes(ops.workingHoursEnd);
}

/** Awal jam kerja berikutnya; bila sedang jam kerja, `now` itu sendiri. */
export function nextWorkingStart(now: Date, ops: StudioOperations): Date {
  if (isWithinWorkingHours(now, ops)) return now;
  const { day, minutes, midnightUtcMs } = wibParts(now);
  const start = toMinutes(ops.workingHoursStart);
  for (let offset = 0; offset <= 7; offset++) {
    const candidateDay = ((day - 1 + offset) % 7) + 1;
    if (!ops.workingDays.includes(candidateDay)) continue;
    if (offset === 0 && minutes >= start) continue;
    return new Date(midnightUtcMs + offset * DAY_MS + start * 60_000);
  }
  return now; // tidak terjangkau: workingDays minimal satu hari (skema)
}

const DAY_NAMES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const dot = (hhmm: string) => hhmm.replace(":", ".");

/** Mis. "Senin–Sabtu, 09.00–17.00 WIB"; hari tidak berurutan dipisah koma. */
export function formatWorkingHours(ops: StudioOperations): string {
  const days = ops.workingDays;
  const consecutive = days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  const dayText = consecutive
    ? `${DAY_NAMES[days[0] - 1]}–${DAY_NAMES[days[days.length - 1] - 1]}`
    : days.map((d) => DAY_NAMES[d - 1]).join(", ");
  return `${dayText}, ${dot(ops.workingHoursStart)}–${dot(ops.workingHoursEnd)} WIB`;
}
