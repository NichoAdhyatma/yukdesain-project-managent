import { describe, expect, it } from "vitest";
import { OPERATIONS_DEFAULTS } from "@/lib/studio-operations";
import { buildStateBlock, buildSystemPrompt, renderServiceCatalog, type StateInput } from "./system-prompt";

const quoted = (dpPercent: number): StateInput => ({
  intake: {
    status: "QUOTED",
    service: { code: "SVC-01", name: "Logo Minimalis" },
    clientName: "Sari",
    clientEmail: null,
    briefDraft: {},
    missingRequired: [],
    writableFields: [],
    imageTargets: [],
    quote: { agreedPrice: 150000, dpAmount: 75000, dpPercent, deadline: new Date("2026-11-20T00:00:00Z") },
  },
  paymentAccounts: [],
  pendingImageMessageIds: [],
});

describe("buildStateBlock: DP dari snapshot order (docs/STUDIO_OPERATIONS.md)", () => {
  it("memakai persen order, bukan nilai Operasional saat ini", () => {
    expect(buildStateBlock(quoted(50))).toContain("DP 50%: Rp75.000");
    expect(buildStateBlock(quoted(30))).toContain("DP 30%: Rp75.000");
  });
});

describe("buildSystemPrompt: blok Kebijakan dari Operasional studio", () => {
  const ops = { ...OPERATIONS_DEFAULTS, dpPercent: 30, revisionQuota: 5, settlementNote: "Lunas sebelum file final dikirim." };

  it("memuat DP, pelunasan, kuota dan teks revisi, serta jam kerja", () => {
    const prompt = buildSystemPrompt("YukDesain", null, ops, []);
    expect(prompt).toContain("# Kebijakan studio");
    expect(prompt).toContain("DP 30%");
    expect(prompt).toContain("Lunas sebelum file final dikirim.");
    expect(prompt).toContain("Revisi gratis 5x per project");
    expect(prompt).toContain(OPERATIONS_DEFAULTS.revisionNotice);
    expect(prompt).toContain("Jam kerja tim desain: Senin–Sabtu, 09.00–17.00 WIB. Sebutkan saat klien menanyakan progres, revisi, atau kapan desainnya dikerjakan.");
    expect(prompt).not.toContain("Jam kerja admin");
    expect(prompt).not.toContain("DP 50%");
  });

  it("project berjalan mengikuti kuota project dari tool, bukan angka Operasional saat ini", () => {
    expect(buildSystemPrompt("YukDesain", null, ops, [])).toContain(
      "Untuk project yang sudah berjalan, kuota dan sisa revisi mengikuti data project dari tool (revisionQuota, revisionQuotaRemaining).",
    );
  });

  it("kuota 0 → tanpa revisi gratis, revisi dialihkan ke admin", () => {
    const prompt = buildSystemPrompt("YukDesain", null, { ...ops, revisionQuota: 0 }, []);
    expect(prompt).toContain("Tidak ada revisi gratis");
    expect(prompt).not.toContain("Revisi gratis 0x");
  });

  it("input sama → teks identik (prompt cache)", () => {
    expect(buildSystemPrompt("YukDesain", null, ops, [])).toBe(buildSystemPrompt("YukDesain", null, ops, []));
  });
});

describe("Katalog Layanan untuk bot (docs/SERVICES_CATALOG.md)", () => {
  const logo = {
    code: "SVC-01",
    name: "Logo Minimalis",
    description: "Logo simpel",
    outputFormat: "AI, PNG",
    startingPrice: 150000,
    priceNote: "termasuk 3 konsep",
    suitableFor: "brand modern",
    botNotes: "tanyakan logo dipakai di mana",
    priceMode: "STARTING" as const,
    packages: [],
    unitPricing: null,
    estimate: null,
  };
  const ops = OPERATIONS_DEFAULTS;

  it("satu baris per layanan dengan harga mulai, catatan harga, dan cocok untuk", () => {
    expect(renderServiceCatalog([logo])).toContain("- Logo Minimalis (SVC-01): mulai Rp150.000 (termasuk 3 konsep). Cocok untuk: brand modern");
  });

  it("layanan tanpa harga mulai tidak menyebut angka", () => {
    const text = renderServiceCatalog([{ ...logo, startingPrice: null, priceNote: null }]);
    expect(text).toContain("harga dikirim tim setelah brief");
    expect(text).not.toContain("mulai Rp");
  });

  it("system prompt memuat daftar Layanan dan aturan harga mulai", () => {
    const prompt = buildSystemPrompt("YukDesain", null, ops, [logo]);
    expect(prompt).toContain("# Layanan");
    expect(prompt).toContain('Kamu boleh menyebut harga mulai sebuah layanan hanya persis seperti di daftar Layanan, selalu dengan kata "mulai"');
    expect(prompt).not.toContain("tanyakan logo dipakai di mana");
  });

  it("STATE memuat detail layanan order dan yang perlu disiapkan klien", () => {
    const base = quoted(50);
    const state = buildStateBlock({ ...base, intake: { ...base.intake!, status: "COLLECTING", quote: null, serviceDetail: logo } });
    expect(state).toContain("Yang perlu disiapkan klien:");
    expect(state).toContain("nama brand/usaha");
    expect(state).toContain("tanyakan logo dipakai di mana");
  });
});
