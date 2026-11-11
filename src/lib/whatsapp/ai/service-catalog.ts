import { z } from "zod";
import { amountsOf, moneyAmounts } from "./reply-guard";
import { prisma } from "@/lib/db";
import { SERVICE_BOT_LIMITS as LIMITS } from "@/lib/constants";
import { getBriefConfig } from "./brief-schema";

// Katalog layanan untuk bot dari menu Layanan (docs/SERVICES_CATALOG.md). Modul data saja: teks untuk prompt
// dirender di system-prompt.ts supaya tidak ada impor melingkar.

export type ServicePackage = { name: string; price: number; note: string | null };
export type UnitPricing = { unitLabel: string; includedUnits: number; extraUnitPrice: number; minUnits: number | null };
export type PriceMode = "FIXED" | "STARTING";

export type BotService = {
  code: string;
  name: string;
  description: string | null;
  outputFormat: string | null;
  startingPrice: number | null;
  priceNote: string | null;
  suitableFor: string | null;
  botNotes: string | null;
  priceMode: PriceMode;
  packages: ServicePackage[];
  unitPricing: UnitPricing | null;
  estimate: string | null;
};

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} maksimal ${max} karakter`)
    .nullish()
    .transform((v) => (v ? v : null));

const rupiah = (label: string) =>
  z
    .number({ error: `${label} harus angka` })
    .int(`${label} harus bilangan bulat`)
    .min(1, `${label} minimal Rp1`)
    .max(LIMITS.startingPriceMax, `${label} maksimal Rp100.000.000`);

export const servicePackageSchema = z.object({
  name: z.string().trim().min(1, "Nama paket wajib diisi").max(LIMITS.packageNameMaxChars, `Nama paket maksimal ${LIMITS.packageNameMaxChars} karakter`),
  price: rupiah("Harga paket"),
  note: optionalText(LIMITS.packageNoteMaxChars, "Catatan paket"),
});

export const unitPricingSchema = z.object({
  unitLabel: z.string().trim().min(1, "Satuan wajib diisi").max(LIMITS.unitLabelMaxChars, `Satuan maksimal ${LIMITS.unitLabelMaxChars} karakter`),
  includedUnits: z.number({ error: "Jumlah termasuk harus angka" }).int("Jumlah termasuk harus bilangan bulat").min(0, "Jumlah termasuk minimal 0"),
  extraUnitPrice: rupiah("Tambahan per unit"),
  minUnits: z
    .number({ error: "Minimal unit harus angka" })
    .int("Minimal unit harus bilangan bulat")
    .min(1, "Minimal unit minimal 1")
    .nullish()
    .transform((v) => v ?? null),
});

export const serviceBotFieldsSchema = z.object({
  startingPrice: z
    .number({ error: "Harga mulai harus angka" })
    .int("Harga mulai harus bilangan bulat")
    // 0 hanya untuk layanan berharga per unit tanpa harga dasar (mis. Buku Menu); dicek di superRefine di bawah.
    .min(0, "Harga mulai minimal Rp0")
    .max(LIMITS.startingPriceMax, "Harga mulai maksimal Rp100.000.000")
    .nullish()
    .transform((v) => v ?? null),
  priceNote: optionalText(LIMITS.priceNoteMaxChars, "Catatan harga"),
  suitableFor: optionalText(LIMITS.suitableForMaxChars, "Cocok untuk"),
  botNotes: optionalText(LIMITS.botNotesMaxChars, "Catatan untuk bot"),
  // Kolom Bagian A: tidak dikirim = tidak diubah (undefined), dikosongkan = null.
  priceMode: z.enum(["FIXED", "STARTING"], { error: "Mode harga tidak dikenal" }).optional(),
  packages: z
    .array(servicePackageSchema)
    .max(LIMITS.packagesMax, `Maksimal ${LIMITS.packagesMax} paket`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v?.length ? v : null)),
  unitPricing: unitPricingSchema.nullish().transform((v) => (v === undefined ? undefined : v)),
  estimate: z
    .string()
    .trim()
    .max(LIMITS.estimateMaxChars, `Estimasi maksimal ${LIMITS.estimateMaxChars} karakter`)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null)),
}).superRefine((v, ctx) => {
  // Rp0 hanya untuk harga per unit tanpa harga dasar (mis. Buku Menu: per halaman).
  if (v.startingPrice === 0 && !v.unitPricing) {
    ctx.addIssue({ code: "custom", path: ["startingPrice"], message: "Harga mulai minimal Rp1 (Rp0 hanya untuk layanan dengan harga per unit)" });
  }
});

export type ServiceBotFields = z.output<typeof serviceBotFieldsSchema>;

/** Layanan aktif yang bisa dipesan lewat WA (punya konfigurasi brief), urut kode. */
export const BOT_SERVICE_SELECT = {
  code: true,
  name: true,
  description: true,
  outputFormat: true,
  startingPrice: true,
  priceNote: true,
  suitableFor: true,
  botNotes: true,
  priceMode: true,
  packages: true,
  unitPricing: true,
  estimate: true,
} as const;

export async function getBotServiceCatalog(): Promise<BotService[]> {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    select: BOT_SERVICE_SELECT,
    orderBy: { code: "asc" },
  });
  return services.filter((s) => getBriefConfig(s.code)).map(toBotService);
}

type ServiceRow = Omit<BotService, "priceMode" | "packages" | "unitPricing"> & { priceMode: string; packages: unknown; unitPricing: unknown };

/** Normalkan kolom Json harga dari DB (data lama / tidak valid → kosong). */
export function normalizePricing(row: { packages: unknown; unitPricing: unknown }): Pick<BotService, "packages" | "unitPricing"> {
  const packages = z.array(servicePackageSchema).safeParse(row.packages ?? []);
  const unit = unitPricingSchema.safeParse(row.unitPricing);
  return { packages: packages.success ? packages.data : [], unitPricing: row.unitPricing && unit.success ? unit.data : null };
}

export function toBotService(row: ServiceRow): BotService {
  return { ...row, priceMode: row.priceMode === "FIXED" ? "FIXED" : "STARTING", ...normalizePricing(row) };
}

/**
 * Angka katalog untuk penjaga harga, satu kelompok per layanan yang punya harga mulai: harga mulai + teks catatan
 * harga (dinormalkan penjaga lewat amountsOf). Kalimat bot hanya lolos bila semua angkanya dari satu kelompok
 * (reply-guard `catalogGroups`), jadi harga layanan lain tidak bisa dicampur menjadi total.
 */
export function servicePriceGroups(
  services: (Pick<BotService, "startingPrice" | "priceNote"> & Partial<Pick<BotService, "packages" | "unitPricing">>)[],
): string[][] {
  return services
    .filter((s) => s.startingPrice || s.unitPricing || s.packages?.length)
    .map((s) => [
      ...(s.startingPrice ? [String(s.startingPrice)] : []),
      ...(s.unitPricing ? [String(s.unitPricing.extraUnitPrice)] : []),
      ...(s.packages ?? []).map((p) => String(p.price)),
      ...(s.priceNote ? [s.priceNote] : []),
    ]);
}

/**
 * Angka untuk penjaga harga, per layanan (spec §4.3): nominal layanan FIXED (harga, paket, tambahan per unit, nominal
 * di catatan harga/paket) dan angka estimasi. `activeServiceCode`: order sudah punya layanan → estimasi hanya layanan itu.
 */
export function serviceGuardNumbers(
  services: Pick<BotService, "code" | "priceMode" | "startingPrice" | "priceNote" | "packages" | "unitPricing" | "estimate">[],
  activeServiceCode?: string | null,
): { fixedGroups: string[][]; estimateGroups: string[][] } {
  const unique = (list: string[]) => [...new Set(list)];
  const fixedGroups = services
    .filter((s) => s.priceMode === "FIXED")
    .map((s) =>
      unique([
        ...(s.startingPrice ? [String(s.startingPrice)] : []),
        ...s.packages.map((p) => String(p.price)),
        ...(s.unitPricing ? [String(s.unitPricing.extraUnitPrice)] : []),
        ...moneyAmounts([s.priceNote ?? "", ...s.packages.map((p) => p.note ?? "")].join(" ")),
      ]),
    )
    .filter((g) => g.length > 0);
  const scoped = activeServiceCode && services.some((s) => s.code === activeServiceCode) ? services.filter((s) => s.code === activeServiceCode) : services;
  const estimateGroups = scoped.map((s) => (s.estimate ? unique(amountsOf(s.estimate)) : [])).filter((g) => g.length > 0);
  return { fixedGroups, estimateGroups };
}
