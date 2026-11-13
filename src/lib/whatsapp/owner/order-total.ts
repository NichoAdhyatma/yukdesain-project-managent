import { calculatePrice, type PricedService } from "@/lib/services/price-calculator";
import { formatRupiah } from "@/lib/whatsapp/format";

// Hitungan total untuk OWNER (bukan untuk klien): harga katalog × jumlah desain + persen tambahan yang owner sebut
// (mis. express 50%). Produksi 2026-11-13 21:55: owner minta "2701 itu minta totalan… tinggal hitung aja" untuk 5
// banner + express, asisten menolak menghitung, dan klien membatalkan order. Harga ke klien tetap lewat invoice
// Order WA di portal.

export type OrderTotalInput = { packageName?: string; units?: number; quantity?: number; surchargePercent?: number };
export type OrderTotalResult = { ok: true; total: number; lines: string[] } | { ok: false; error: string };

const MAX_QUANTITY = 100;
const MAX_SURCHARGE_PERCENT = 300;

export function calculateOrderTotal(service: PricedService & { name: string }, input: OrderTotalInput): OrderTotalResult {
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return { ok: false, error: `Jumlah desain harus bilangan bulat 1–${MAX_QUANTITY}` };
  }
  const percent = input.surchargePercent ?? 0;
  if (!Number.isFinite(percent) || percent < 0 || percent > MAX_SURCHARGE_PERCENT) {
    return { ok: false, error: `Persen tambahan harus 0–${MAX_SURCHARGE_PERCENT}` };
  }

  const one = calculatePrice(service, { packageName: input.packageName, units: input.units });
  if (!one.ok) return one;

  const subtotal = one.total * quantity;
  const lines = [
    quantity > 1
      ? `${service.name}: ${one.breakdown} × ${quantity} desain = ${formatRupiah(subtotal)}`
      : `${service.name}: ${one.breakdown}`,
  ];
  const surcharge = Math.round((subtotal * percent) / 100);
  if (surcharge > 0) lines.push(`Tambahan ${percent}% = ${formatRupiah(surcharge)}`);
  const total = subtotal + surcharge;
  lines.push(`Total: ${formatRupiah(total)}`);
  return { ok: true, total, lines };
}
