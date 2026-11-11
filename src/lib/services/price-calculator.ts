import { formatRupiah } from "@/lib/whatsapp/format";
import type { BotService } from "@/lib/whatsapp/ai/service-catalog";

// Kalkulator harga katalog (spec 2026-11-11-kb-merge-design §4.2). Satu layanan saja:
// gabungan beberapa layanan, diskon, dan express tetap lewat owner/admin.

export type PriceInput = { packageName?: string; units?: number };
export type PriceResult = { ok: true; total: number; breakdown: string } | { ok: false; error: string };

type PricedService = Pick<BotService, "startingPrice" | "packages" | "unitPricing">;

export function calculatePrice(service: PricedService, input: PriceInput): PriceResult {
  const { packages, unitPricing: unit } = service;
  if (input.units !== undefined && (!Number.isInteger(input.units) || input.units < 1)) {
    return { ok: false, error: "Jumlah harus bilangan bulat positif" };
  }

  if (packages.length) {
    const names = packages.map((p) => p.name).join(", ");
    if (!input.packageName) return { ok: false, error: `Pilih paket: ${names}` };
    const wanted = input.packageName.trim().toLowerCase();
    const pkg = packages.find((p) => p.name.toLowerCase() === wanted);
    if (!pkg) return { ok: false, error: `Paket tidak dikenal. Pilihan: ${names}` };
    if (input.units !== undefined && !unit) return { ok: false, error: "Layanan ini tidak dihitung per unit" };
    return withUnits(pkg.price, `Paket ${pkg.name} ${formatRupiah(pkg.price)}`, unit, input.units);
  }

  if (service.startingPrice === null || (service.startingPrice === 0 && !unit)) {
    return { ok: false, error: "Harga layanan ini belum ada di katalog" };
  }
  if (input.units !== undefined && !unit) return { ok: false, error: "Layanan ini tidak dihitung per unit" };
  return withUnits(service.startingPrice, formatRupiah(service.startingPrice), unit, input.units);
}

function withUnits(base: number, baseLabel: string, unit: BotService["unitPricing"], units: number | undefined): PriceResult {
  if (!unit) return { ok: true, total: base, breakdown: baseLabel };
  if (units === undefined) {
    // Tanpa harga dasar (mis. Buku Menu per halaman), jumlah wajib disebut.
    if (base === 0) return { ok: false, error: `Sebutkan jumlah ${unit.unitLabel}` };
    return { ok: true, total: base, breakdown: unit.includedUnits ? `${baseLabel} (sampai ${unit.includedUnits} ${unit.unitLabel})` : baseLabel };
  }
  if (unit.minUnits && units < unit.minUnits) return { ok: false, error: `Minimal ${unit.minUnits} ${unit.unitLabel}` };
  const extra = Math.max(0, units - unit.includedUnits);
  const total = base + extra * unit.extraUnitPrice;
  const extraLabel = `${extra} ${unit.unitLabel} × ${formatRupiah(unit.extraUnitPrice)}`;
  const parts = base === 0 ? [extraLabel] : extra === 0 ? [baseLabel] : [`${baseLabel} (sampai ${unit.includedUnits} ${unit.unitLabel})`, extraLabel];
  return { ok: true, total, breakdown: `${parts.join(" + ")} = ${formatRupiah(total)}` };
}
