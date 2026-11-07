import { z } from "zod";
import { prisma } from "@/lib/db";
import { SERVICE_BOT_LIMITS as LIMITS } from "@/lib/constants";
import { getBriefConfig } from "./brief-schema";

// Katalog layanan untuk bot dari menu Layanan (docs/SERVICES_CATALOG.md). Modul data saja: teks untuk prompt
// dirender di system-prompt.ts supaya tidak ada impor melingkar.

export type BotService = {
  code: string;
  name: string;
  description: string | null;
  outputFormat: string | null;
  startingPrice: number | null;
  priceNote: string | null;
  suitableFor: string | null;
  botNotes: string | null;
};

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} maksimal ${max} karakter`)
    .nullish()
    .transform((v) => (v ? v : null));

export const serviceBotFieldsSchema = z.object({
  startingPrice: z
    .number({ error: "Harga mulai harus angka" })
    .int("Harga mulai harus bilangan bulat")
    .min(1, "Harga mulai minimal Rp1")
    .max(LIMITS.startingPriceMax, "Harga mulai maksimal Rp100.000.000")
    .nullish()
    .transform((v) => v ?? null),
  priceNote: optionalText(LIMITS.priceNoteMaxChars, "Catatan harga"),
  suitableFor: optionalText(LIMITS.suitableForMaxChars, "Cocok untuk"),
  botNotes: optionalText(LIMITS.botNotesMaxChars, "Catatan untuk bot"),
});

export type ServiceBotFields = z.output<typeof serviceBotFieldsSchema>;

/** Layanan aktif yang bisa dipesan lewat WA (punya konfigurasi brief), urut kode. */
export async function getBotServiceCatalog(): Promise<BotService[]> {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    select: {
      code: true,
      name: true,
      description: true,
      outputFormat: true,
      startingPrice: true,
      priceNote: true,
      suitableFor: true,
      botNotes: true,
    },
    orderBy: { code: "asc" },
  });
  return services.filter((s) => getBriefConfig(s.code));
}

const digitsOf = (s: string) => (s.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]/g, ""));

/**
 * Angka katalog untuk penjaga harga: harga mulai dan semua angka di catatan harga ("termasuk 3 konsep").
 * Penjaga memakainya hanya untuk kalimat harga, bukan lama pengerjaan (reply-guard `catalogNumbers`).
 */
export function servicePriceNumbers(services: Pick<BotService, "startingPrice" | "priceNote">[]): string[] {
  return services.flatMap((s) => [...(s.startingPrice ? [String(s.startingPrice)] : []), ...digitsOf(s.priceNote ?? "")]);
}
