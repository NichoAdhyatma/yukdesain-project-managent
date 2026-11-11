import { formatRupiah } from "@/lib/whatsapp/format";
import { normalizePricing, type BotService } from "@/lib/whatsapp/ai/service-catalog";

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

/** Jumlah unit dari brief: halaman / varian / pose, atau banyaknya item menu. */
function unitsFromBrief(draft: Record<string, unknown>): number | undefined {
  for (const key of ["page_count", "variant_count", "pose_count"]) {
    const n = Number(draft[key]);
    if (Number.isInteger(n) && n > 0) return n;
  }
  const items = draft.menu_items_json;
  return Array.isArray(items) && items.length > 0 ? items.length : undefined;
}

/**
 * Isian awal harga di panel Order WA (spec §4.3): dari kalkulator dengan paket/unit di brief,
 * atau harga mulai layanan bila tidak bisa dihitung. Admin tetap yang menyimpan.
 */
export function suggestQuotePrice(
  service: { startingPrice: number | null; packages: unknown; unitPricing: unknown } | null,
  draft: Record<string, unknown>,
): { total: number; breakdown: string } | null {
  if (!service) return null;
  const pricing = { startingPrice: service.startingPrice, ...normalizePricing(service) };
  const packageName = typeof draft.package_choice === "string" ? draft.package_choice : undefined;
  const result = calculatePrice(pricing, { packageName, units: unitsFromBrief(draft) });
  if (result.ok) return { total: result.total, breakdown: result.breakdown };
  return service.startingPrice ? { total: service.startingPrice, breakdown: `Harga layanan ${formatRupiah(service.startingPrice)}` } : null;
}
