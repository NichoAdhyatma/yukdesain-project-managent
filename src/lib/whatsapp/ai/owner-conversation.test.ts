import { beforeEach, describe, expect, it, vi } from "vitest";

const proposals = vi.hoisted(() => ({ createProposal: vi.fn(), findPendingProposal: vi.fn() }));
const queries = vi.hoisted(() => ({ answerOwnerQuery: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/studio", () => ({ getStudioSettings: async () => ({ name: "YukDesain Studio" }) }));
vi.mock("../owner/proposals", async (orig) => ({ ...(await orig<typeof import("../owner/proposals")>()), ...proposals }));
vi.mock("../owner/query-store", () => queries);

import { buildOwnerState, executeOwnerTool, type OwnerTurnResult } from "./owner-conversation";

const owner = { user: { id: "u_owner", name: "Rizal" }, target: "PUBLISH" as const };
const base = {
  instructions: "Admin membalas 09.00-17.00.",
  faqs: [],
  pricingRules: [
    { id: "express", kind: "SURCHARGE" as const, name: "Express", condition: "butuh cepat", amountType: "PERCENT" as const, amount: 50, note: "" },
  ],
};

function ctx() {
  const result: OwnerTurnResult = { reply: null, proposal: null, answeredQueryIds: [] };
  return { owner, conversationId: "conv_o", current: { guide: base, version: 4 }, openIds: new Set(["q_1"]), result };
}

beforeEach(() => {
  vi.clearAllMocks();
  proposals.createProposal.mockResolvedValue({ id: "p_1" });
  queries.answerOwnerQuery.mockResolvedValue(true);
});

describe("propose_guide_change", () => {
  it("bagian yang tidak dikirim tetap; aturan baru dapat id; usulan menyimpan versi dasar", async () => {
    const c = ctx();
    const out = await executeOwnerTool(
      "propose_guide_change",
      {
        summary: "Tambah diskon 50rb untuk order >5 pcs.",
        pricing_rules: [
          { id: "express", kind: "SURCHARGE", name: "Express", condition: "butuh cepat", amountType: "PERCENT", amount: 50 },
          { kind: "DISCOUNT", name: "Diskon >5 pcs", condition: "lebih dari 5 pcs", amountType: "FIXED", amount: 50000, note: "kalimat promosi" },
        ],
      },
      c,
    );
    expect(out.isError).toBe(false);
    const created = proposals.createProposal.mock.calls[0][0];
    expect(created.baseVersion).toBe(4);
    expect(created.guide.instructions).toBe(base.instructions);
    expect(created.guide.pricingRules.map((r: { id: string }) => r.id)).toEqual(["express", "diskon-5-pcs"]);
    expect(c.result.proposal?.base).toBe(base);
  });

  it("nilai tidak valid (persen > 100) → error ke model, tidak ada usulan", async () => {
    const c = ctx();
    const out = await executeOwnerTool(
      "propose_guide_change",
      { summary: "x", pricing_rules: [{ kind: "SURCHARGE", name: "Express", condition: "cepat", amountType: "PERCENT", amount: 150 }] },
      c,
    );
    expect(out.isError).toBe(true);
    expect(proposals.createProposal).not.toHaveBeenCalled();
  });

  it("tidak ada perubahan → error", async () => {
    const out = await executeOwnerTool("propose_guide_change", { summary: "sama", instructions: base.instructions }, ctx());
    expect(out.isError).toBe(true);
  });
});

describe("answer_client_query", () => {
  it("meneruskan jawaban untuk pertanyaan yang terbuka", async () => {
    const c = ctx();
    const out = await executeOwnerTool("answer_client_query", { query_id: "q_1", approved: true, note: "pakai layanan Kemasan" }, c);
    expect(out.isError).toBe(false);
    expect(queries.answerOwnerQuery).toHaveBeenCalledWith("q_1", { approved: true, note: "pakai layanan Kemasan", answeredById: "u_owner" });
    expect(c.result.answeredQueryIds).toEqual(["q_1"]);
  });

  it("id yang tidak ada di STATE ditolak (model tidak bisa menjawab pertanyaan sembarang)", async () => {
    const out = await executeOwnerTool("answer_client_query", { query_id: "q_lain", approved: true }, ctx());
    expect(out.isError).toBe(true);
    expect(queries.answerOwnerQuery).not.toHaveBeenCalled();
  });
});

describe("buildOwnerState", () => {
  it("memuat panduan saat ini, pertanyaan terbuka, dan pertanyaan yang dibalas", () => {
    const text = buildOwnerState({
      owner,
      current: { guide: base, version: 4 },
      pendingProposalSummary: null,
      queries: [{ id: "q_1", question: "kemasan sachet", createdAt: new Date(), conversation: { waId: "6281234567890", profileName: "Sari" } }],
      repliedQueryId: "q_1",
    });
    expect(text).toContain("versi 4");
    expect(text).toContain("biaya tambahan 50% dari total");
    expect(text).toContain("id=q_1");
    expect(text).toContain("6281****7890");
    expect(text).not.toContain("6281234567890");
    expect(text).toContain("balasan (reply) untuk pertanyaan id=q_1");
  });
});
