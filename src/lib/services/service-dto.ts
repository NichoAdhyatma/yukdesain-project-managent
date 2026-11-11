import { Prisma, type Service } from "@prisma/client";
import { serviceBotFieldsSchema, type ServiceBotFields } from "@/lib/whatsapp/ai/service-catalog";

// Kolom pengetahuan bot di Layanan khusus owner (docs/SERVICES_CATALOG.md): harga mulai dan catatan bot tidak
// dikirim ke desainer.

const BOT_KEYS = ["startingPrice", "priceNote", "suitableFor", "botNotes", "priceMode", "packages", "unitPricing", "estimate"] as const;

/**
 * Kolom layanan untuk payload project (dipakai juga oleh route yang dibuka desainer): tanpa kolom bot, supaya
 * harga mulai dan catatan bot tidak ikut terkirim lewat data project.
 */
export const SERVICE_PUBLIC_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  outputFormat: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function toServiceDto(service: Service, isOwner: boolean) {
  if (isOwner) return service;
  const rest: Partial<Service> = { ...service };
  for (const key of BOT_KEYS) delete rest[key];
  return rest as Omit<Service, (typeof BOT_KEYS)[number]>;
}

/** Validasi kolom bot dari body POST/PUT; hanya kunci yang ada di body yang diubah. */
export function parseServiceBotFields(
  body: unknown,
): { ok: true; data: Partial<ServiceBotFields> } | { ok: false; fields: Record<string, string> } {
  const source = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const present = BOT_KEYS.filter((k) => k in source);
  const parsed = serviceBotFieldsSchema.safeParse(source);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fields[key] ??= issue.message;
    }
    return { ok: false, fields };
  }
  const data: Partial<ServiceBotFields> = {};
  for (const key of present) Object.assign(data, { [key]: parsed.data[key] });
  // Paket: harga mulai = paket termurah (dipakai daftar layanan dan penjaga harga).
  if (data.packages?.length) data.startingPrice = Math.min(...data.packages.map((p) => p.price));
  return { ok: true, data };
}

/** Data hasil parseServiceBotFields → bentuk tulis Prisma (Json null = Prisma.DbNull). */
export function toServiceWriteData(data: Partial<ServiceBotFields>) {
  const { packages, unitPricing, ...rest } = data;
  return {
    ...rest,
    ...(packages !== undefined && { packages: packages ?? Prisma.DbNull }),
    ...(unitPricing !== undefined && { unitPricing: unitPricing ?? Prisma.DbNull }),
  };
}
