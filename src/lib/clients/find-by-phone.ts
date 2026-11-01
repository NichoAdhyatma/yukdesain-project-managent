import type { Prisma } from "@prisma/client";
import { normalizePhone } from "@/lib/whatsapp/phone";

/**
 * Client yang nomornya sama dengan wa_id (format 62…). Nomor tersimpan dalam berbagai
 * format ("0812-9999-0007", "+62 812…"): bandingkan digit saja di DB, lalu pastikan
 * dengan normalizePhone. Bisa lebih dari satu; pemanggil yang memutuskan (§15).
 */
export async function findClientsByPhone(db: Prisma.TransactionClient, waId: string) {
  const candidates = await db.$queryRaw<{ id: string; name: string; phone: string | null }[]>`
    SELECT id, name, phone FROM clients
    WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE ${`%${waId.slice(-8)}`}`;
  return candidates.filter((c) => normalizePhone(c.phone) === waId).map(({ id, name }) => ({ id, name }));
}
