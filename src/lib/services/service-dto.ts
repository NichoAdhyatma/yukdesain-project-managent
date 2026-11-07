import type { Service } from "@prisma/client";
import { serviceBotFieldsSchema, type ServiceBotFields } from "@/lib/whatsapp/ai/service-catalog";

// Kolom pengetahuan bot di Layanan khusus owner (docs/SERVICES_CATALOG.md): harga mulai dan catatan bot tidak
// dikirim ke desainer.

const BOT_KEYS = ["startingPrice", "priceNote", "suitableFor", "botNotes"] as const;

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
  const parsed = serviceBotFieldsSchema.pick({ startingPrice: true, priceNote: true, suitableFor: true, botNotes: true }).safeParse(source);
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
  return { ok: true, data };
}
