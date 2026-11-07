import { describe, expect, it } from "vitest";
import { OPERATIONS_DEFAULTS } from "@/lib/studio-operations";
import { buildStateBlock, buildSystemPrompt, type StateInput } from "./system-prompt";

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
    const prompt = buildSystemPrompt("YukDesain", null, ops);
    expect(prompt).toContain("# Kebijakan studio");
    expect(prompt).toContain("DP 30%");
    expect(prompt).toContain("Lunas sebelum file final dikirim.");
    expect(prompt).toContain("Revisi gratis 5x per project");
    expect(prompt).toContain(OPERATIONS_DEFAULTS.revisionNotice);
    expect(prompt).toContain("Jam kerja tim desain: Senin–Sabtu, 09.00–17.00 WIB. Sebutkan saat klien menanyakan progres, revisi, atau kapan desainnya dikerjakan.");
    expect(prompt).not.toContain("Jam kerja admin");
    expect(prompt).not.toContain("DP 50%");
  });

  it("kuota 0 → tanpa revisi gratis, revisi dialihkan ke admin", () => {
    const prompt = buildSystemPrompt("YukDesain", null, { ...ops, revisionQuota: 0 });
    expect(prompt).toContain("Tidak ada revisi gratis");
    expect(prompt).not.toContain("Revisi gratis 0x");
  });

  it("input sama → teks identik (prompt cache)", () => {
    expect(buildSystemPrompt("YukDesain", null, ops)).toBe(buildSystemPrompt("YukDesain", null, ops));
  });
});
