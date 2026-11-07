import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ service: { findMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { getBotServiceCatalog, serviceBotFieldsSchema, servicePriceNumbers, type BotService } from "./service-catalog";

const svc = (over: Partial<BotService>): BotService => ({
  code: "SVC-01",
  name: "Logo Minimalis",
  description: null,
  outputFormat: null,
  startingPrice: null,
  priceNote: null,
  suitableFor: null,
  botNotes: null,
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

describe("servicePriceNumbers", () => {
  it("harga mulai dan semua angka di catatan harga (penjaga memakainya hanya untuk kalimat harga)", () => {
    expect(servicePriceNumbers([svc({ startingPrice: 150000, priceNote: "A3 mulai Rp200.000" }), svc({})])).toEqual(["150000", "3", "200000"]);
  });
});
