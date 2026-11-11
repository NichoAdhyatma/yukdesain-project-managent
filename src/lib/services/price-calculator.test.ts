import { describe, expect, it } from "vitest";
import type { BotService } from "@/lib/whatsapp/ai/service-catalog";
import { calculatePrice } from "./price-calculator";

const svc = (over: Partial<BotService>): BotService => ({
  code: "SVC-01",
  name: "Layanan",
  description: null,
  outputFormat: null,
  startingPrice: null,
  priceNote: null,
  suitableFor: null,
  botNotes: null,
  priceMode: "FIXED",
  packages: [],
  unitPricing: null,
  estimate: null,
  ...over,
});

// Nilai dari KNOWLEDGE_BASE_MASTER_YUKDESAINN.md (spec §4.1, §7).
const posterMenu = svc({ name: "Poster Menu", startingPrice: 135000, unitPricing: { unitLabel: "item", includedUnits: 35, extraUnitPrice: 5000, minUnits: null } });
const bukuMenu = svc({ name: "Buku Menu", startingPrice: 0, unitPricing: { unitLabel: "halaman", includedUnits: 0, extraUnitPrice: 90000, minUnits: 5 } });
const stickerLabel = svc({ name: "Sticker Label", startingPrice: 125000, unitPricing: { unitLabel: "varian", includedUnits: 1, extraUnitPrice: 85000, minUnits: null } });
const photobooth = svc({
  name: "Photobooth",
  startingPrice: 85000,
  packages: [
    { name: "Newspaper", price: 85000, note: null },
    { name: "Photostrips 4R", price: 50000, note: null },
  ],
});

describe("calculatePrice (spec §4.2)", () => {
  it.each([
    [35, 135000],
    [36, 140000],
    [40, 160000],
  ])("Poster Menu %i item → %i", (units, total) => {
    expect(calculatePrice(posterMenu, { units })).toMatchObject({ ok: true, total });
  });

  it("tanpa unit memakai harga dasar", () => {
    expect(calculatePrice(posterMenu, {})).toMatchObject({ ok: true, total: 135000 });
  });

  it("Buku Menu per halaman dengan minimum", () => {
    expect(calculatePrice(bukuMenu, { units: 6 })).toMatchObject({ ok: true, total: 540000 });
    expect(calculatePrice(bukuMenu, { units: 4 })).toEqual({ ok: false, error: "Minimal 5 halaman" });
    expect(calculatePrice(bukuMenu, {})).toEqual({ ok: false, error: "Sebutkan jumlah halaman" });
  });

  it("Sticker Label 3 varian → 295.000", () => {
    expect(calculatePrice(stickerLabel, { units: 3 })).toMatchObject({ ok: true, total: 295000 });
  });

  it("paket dikenali tanpa beda huruf besar/kecil; paket tak dikenal ditolak", () => {
    expect(calculatePrice(photobooth, { packageName: "newspaper" })).toMatchObject({ ok: true, total: 85000 });
    expect(calculatePrice(photobooth, { packageName: "Polaroid" })).toEqual({
      ok: false,
      error: "Paket tidak dikenal. Pilihan: Newspaper, Photostrips 4R",
    });
    expect(calculatePrice(photobooth, {})).toEqual({ ok: false, error: "Pilih paket: Newspaper, Photostrips 4R" });
  });

  it.each([6.5, -1, 0])("unit %s ditolak", (units) => {
    expect(calculatePrice(posterMenu, { units })).toEqual({ ok: false, error: "Jumlah harus bilangan bulat positif" });
  });

  it("unit untuk layanan tanpa harga per unit ditolak", () => {
    expect(calculatePrice(svc({ startingPrice: 135000 }), { units: 3 })).toEqual({ ok: false, error: "Layanan ini tidak dihitung per unit" });
  });

  it("layanan tanpa harga ditolak", () => {
    expect(calculatePrice(svc({}), {})).toEqual({ ok: false, error: "Harga layanan ini belum ada di katalog" });
  });

  it("rincian menyebut harga dasar dan tambahan", () => {
    const r = calculatePrice(posterMenu, { units: 40 });
    expect(r.ok && r.breakdown).toBe("Rp135.000 (sampai 35 item) + 5 item × Rp5.000 = Rp160.000");
  });
});
