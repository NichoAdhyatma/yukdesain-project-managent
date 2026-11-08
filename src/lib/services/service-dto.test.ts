import { describe, expect, it } from "vitest";
import type { Service } from "@prisma/client";
import { execSync } from "node:child_process";
import { SERVICE_PUBLIC_SELECT, parseServiceBotFields, toServiceDto } from "./service-dto";

const svc: Service = {
  id: "s1",
  code: "SVC-01",
  name: "Logo Minimalis",
  description: null,
  outputFormat: "AI, PNG",
  isActive: true,
  startingPrice: 150000,
  priceNote: "termasuk 3 konsep",
  suitableFor: "brand modern",
  botNotes: "jangan janji 1 hari",
  createdAt: new Date("2026-11-08T00:00:00Z"),
  updatedAt: new Date("2026-11-08T00:00:00Z"),
};

const BOT_KEYS = ["startingPrice", "priceNote", "suitableFor", "botNotes"];

describe("toServiceDto (khusus owner, spec §10)", () => {
  it("bukan owner: tanpa kolom bot", () => {
    const dto = toServiceDto(svc, false);
    for (const key of BOT_KEYS) expect(dto).not.toHaveProperty(key);
    expect(dto).toMatchObject({ code: "SVC-01", name: "Logo Minimalis", outputFormat: "AI, PNG" });
  });

  it("owner: semua kolom", () => {
    expect(toServiceDto(svc, true)).toMatchObject({ startingPrice: 150000, priceNote: "termasuk 3 konsep", suitableFor: "brand modern", botNotes: "jangan janji 1 hari" });
  });
});

describe("parseServiceBotFields", () => {
  it("hanya field yang dikirim yang diubah (PUT parsial)", () => {
    expect(parseServiceBotFields({ name: "x" })).toEqual({ ok: true, data: {} });
  });

  it("owner mengosongkan harga", () => {
    expect(parseServiceBotFields({ startingPrice: null })).toEqual({ ok: true, data: { startingPrice: null } });
  });

  it("nilai tidak valid → pesan di field", () => {
    const r = parseServiceBotFields({ startingPrice: 0, priceNote: "ok" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fields.startingPrice).toBeTruthy();
  });

  it("teks dirapikan", () => {
    expect(parseServiceBotFields({ suitableFor: "  usaha makanan  " })).toEqual({ ok: true, data: { suitableFor: "usaha makanan" } });
  });
});

describe("SERVICE_PUBLIC_SELECT: data layanan di payload project (desainer ikut menerima)", () => {
  it("tanpa kolom bot", () => {
    for (const key of BOT_KEYS) expect(SERVICE_PUBLIC_SELECT).not.toHaveProperty(key);
    expect(SERVICE_PUBLIC_SELECT).toMatchObject({ id: true, code: true, name: true });
  });

  it("tidak ada route/lib yang memuat layanan utuh (service: true) ke payload project", () => {
    const files = execSync("grep -rln 'service: true' src/app src/lib || true", { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !f.includes(".test."));
    expect(files).toEqual([]);
  });
});
