import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ service: { findMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { getBotServiceCatalog, serviceBotFieldsSchema, servicePriceGroups,
  serviceGuardNumbers, type BotService } from "./service-catalog";

const svc = (over: Partial<BotService>): BotService => ({
  code: "SVC-01",
  name: "Logo Minimalis",
  description: null,
  outputFormat: null,
  startingPrice: null,
  priceNote: null,
  suitableFor: null,
  botNotes: null,
  priceMode: "STARTING",
  packages: [],
  unitPricing: null,
  estimate: null,
  ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("serviceBotFieldsSchema (spec §5)", () => {
  it("merapikan teks dan mengubah string kosong menjadi null", () => {
    expect(serviceBotFieldsSchema.parse({ startingPrice: 150000, priceNote: "  A3 mulai Rp200.000 ", suitableFor: "", botNotes: null })).toEqual({
      startingPrice: 150000,
      priceNote: "A3 mulai Rp200.000",
      suitableFor: null,
      botNotes: null,
    });
  });

  it.each([
    [{ startingPrice: 0 }],
    [{ startingPrice: 100_000_001 }],
    [{ startingPrice: 1500.5 }],
    [{ priceNote: "x".repeat(81) }],
    [{ suitableFor: "x".repeat(201) }],
    [{ botNotes: "x".repeat(301) }],
  ])("menolak %j", (input) => {
    expect(serviceBotFieldsSchema.safeParse(input).success).toBe(false);
  });
});

describe("getBotServiceCatalog", () => {
  it("hanya layanan aktif yang punya konfigurasi brief", async () => {
    db.service.findMany.mockResolvedValue([svc({ code: "SVC-01" }), svc({ code: "SVC-99", name: "Tanpa brief" })]);
    const catalog = await getBotServiceCatalog();
    expect(catalog.map((s) => s.code)).toEqual(["SVC-01"]);
    expect(db.service.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true }, orderBy: { code: "asc" } }));
  });
});

describe("servicePriceGroups", () => {
  it("satu kelompok per layanan berharga: harga mulai + teks catatan harga", () => {
    expect(servicePriceGroups([svc({ startingPrice: 150000, priceNote: "A3 mulai Rp200.000" }), svc({}), svc({ startingPrice: 300000 })])).toEqual([
      ["150000", "A3 mulai Rp200.000"],
      ["300000"],
    ]);
  });
});

describe("Bagian A: mode harga, paket, unit, estimasi (docs/superpowers/specs/2026-11-11-kb-merge-design.md §4.1)", () => {
  it("paket: maks 6, harga wajib > 0", () => {
    const pkg = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, price: 1000 }));
    expect(serviceBotFieldsSchema.safeParse({ packages: pkg(6) }).success).toBe(true);
    expect(serviceBotFieldsSchema.safeParse({ packages: pkg(7) }).success).toBe(false);
    expect(serviceBotFieldsSchema.safeParse({ packages: [{ name: "A", price: 0 }] }).success).toBe(false);
  });

  it("mode harga dan estimasi", () => {
    expect(serviceBotFieldsSchema.parse({ priceMode: "FIXED", estimate: " 3 hari " })).toMatchObject({ priceMode: "FIXED", estimate: "3 hari" });
    expect(serviceBotFieldsSchema.safeParse({ priceMode: "MURAH" }).success).toBe(false);
    expect(serviceBotFieldsSchema.safeParse({ estimate: "x".repeat(41) }).success).toBe(false);
  });

  it("harga per unit: bilangan bulat, tambahan > 0", () => {
    expect(serviceBotFieldsSchema.parse({ unitPricing: { unitLabel: "item", includedUnits: 35, extraUnitPrice: 5000 } }).unitPricing).toEqual({
      unitLabel: "item",
      includedUnits: 35,
      extraUnitPrice: 5000,
      minUnits: null,
    });
    expect(serviceBotFieldsSchema.safeParse({ unitPricing: { unitLabel: "item", includedUnits: 1.5, extraUnitPrice: 5000 } }).success).toBe(false);
    expect(serviceBotFieldsSchema.safeParse({ unitPricing: { unitLabel: "item", includedUnits: 0, extraUnitPrice: 0 } }).success).toBe(false);
  });

  it("katalog: paket kosong jadi [] dan kelompok angka memuat harga paket + tambahan per unit", async () => {
    db.service.findMany.mockResolvedValue([{ ...svc({ code: "SVC-08" }), packages: null }]);
    expect((await getBotServiceCatalog())[0]).toMatchObject({ packages: [], unitPricing: null, priceMode: "STARTING" });
    expect(
      servicePriceGroups([
        svc({ startingPrice: 125000, unitPricing: { unitLabel: "varian", includedUnits: 1, extraUnitPrice: 85000, minUnits: null } }),
        svc({ startingPrice: 50000, packages: [{ name: "Newspaper", price: 85000, note: null }, { name: "Photostrips 4R", price: 50000, note: null }] }),
      ]),
    ).toEqual([
      ["125000", "85000"],
      ["50000", "85000", "50000"],
    ]);
  });
});

describe("serviceGuardNumbers (review akhir Plan A)", () => {
  it("per layanan; angka uang dari catatan harga/paket ikut, jumlah biasa tidak", () => {
    const banner = svc({ code: "SVC-04", priceMode: "FIXED", startingPrice: 135000, priceNote: "ukuran A3 Rp200.000", estimate: "3 hari" });
    const poster = svc({ code: "SVC-03", priceMode: "FIXED", startingPrice: 135000, unitPricing: { unitLabel: "item", includedUnits: 35, extraUnitPrice: 5000, minUnits: 5 } });
    const auto = svc({ code: "SVC-13", priceMode: "FIXED", startingPrice: 1250000, packages: [{ name: "UMKM Starter", price: 1250000, note: "8 desain feed, cetak Rp50.000" }] });
    const logo = svc({ code: "SVC-01", priceMode: "STARTING", startingPrice: 150000, estimate: "5-7 hari" });
    expect(serviceGuardNumbers([banner, poster, auto, logo])).toEqual({
      fixedGroups: [["135000", "200000"], ["135000", "5000"], ["1250000", "50000"]],
      estimateGroups: [["3"], ["5", "7"]],
    });
    expect(serviceGuardNumbers([banner, logo], "SVC-01").estimateGroups).toEqual([["5", "7"]]);
  });
});
