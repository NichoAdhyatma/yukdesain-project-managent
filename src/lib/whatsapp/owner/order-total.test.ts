import { describe, expect, it } from "vitest";
import { calculateOrderTotal } from "./order-total";

// Produksi 13 Nov 21:55: owner "2701 itu minta totalan… tinggal hitung aja" (5 banner + express 50%); bot menolak
// menghitung, klien membatalkan order karena tidak dapat angka.
const banner = { name: "Banner UMKM", priceMode: "FIXED" as const, startingPrice: 135000, packages: [], unitPricing: null };
const poster = {
  name: "Poster Menu",
  priceMode: "FIXED" as const,
  startingPrice: 135000,
  packages: [],
  unitPricing: { unitLabel: "item", includedUnits: 35, extraUnitPrice: 5000, minUnits: null },
};

describe("calculateOrderTotal", () => {
  it("5 desain banner + express 50% → rincian dan total", () => {
    expect(calculateOrderTotal(banner, { quantity: 5, surchargePercent: 50 })).toEqual({
      ok: true,
      total: 1012500,
      lines: ["Banner UMKM: Rp135.000 × 5 desain = Rp675.000", "Tambahan 50% = Rp337.500", "Total: Rp1.012.500"],
    });
  });

  it("satu desain tanpa tambahan", () => {
    expect(calculateOrderTotal(banner, {})).toEqual({ ok: true, total: 135000, lines: ["Banner UMKM: Rp135.000", "Total: Rp135.000"] });
  });

  it("harga per unit dari katalog dipakai (Poster Menu 40 item = Rp160.000)", () => {
    const r = calculateOrderTotal(poster, { units: 40, surchargePercent: 50 });
    expect(r).toMatchObject({ ok: true, total: 240000 });
  });

  it("tambahan persen dibulatkan ke rupiah", () => {
    expect(calculateOrderTotal(poster, { surchargePercent: 33 })).toMatchObject({ ok: true, total: 179550 });
  });

  it("jumlah desain / persen tidak wajar → ditolak", () => {
    expect(calculateOrderTotal(banner, { quantity: 0 })).toMatchObject({ ok: false });
    expect(calculateOrderTotal(banner, { quantity: 2.5 })).toMatchObject({ ok: false });
    expect(calculateOrderTotal(banner, { surchargePercent: -10 })).toMatchObject({ ok: false });
    expect(calculateOrderTotal(banner, { surchargePercent: 500 })).toMatchObject({ ok: false });
  });

  it("kesalahan kalkulator katalog diteruskan", () => {
    expect(calculateOrderTotal({ ...banner, startingPrice: null }, {})).toMatchObject({ ok: false });
  });
});
