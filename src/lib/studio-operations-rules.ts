import { z } from "zod";
import { DP_PERCENT, MAX_REVISION_QUOTA, REVISION_NOTICE } from "@/lib/constants";

// Bagian murni Operasional studio (docs/STUDIO_OPERATIONS.md): tipe, default, validasi, dan jam kerja WIB.
// Tanpa akses database, jadi aman dipakai form di browser.

export type StudioOperations = {
  dpPercent: number;
  revisionQuota: number;
  revisionNotice: string;
  settlementNote: string;
  /** 1 = Senin … 7 = Minggu, urut naik */
  workingDays: number[];
  /** Jam kerja desainer, "HH:mm" WIB */
  workingHoursStart: string;
  workingHoursEnd: string;
};

export const OPERATIONS_DEFAULTS: StudioOperations = {
  dpPercent: DP_PERCENT,
  revisionQuota: MAX_REVISION_QUOTA,
  revisionNotice: REVISION_NOTICE,
  settlementNote: "Pelunasan dilakukan setelah desain selesai.",
  workingDays: [1, 2, 3, 4, 5, 6],
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
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
  })
  .refine((o) => toMinutes(o.workingHoursStart) < toMinutes(o.workingHoursEnd), {
    message: "Jam selesai harus setelah jam mulai (tidak melewati tengah malam)",
    path: ["workingHoursEnd"],
  });

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
