import { beforeEach, describe, expect, it, vi } from "vitest";

const proposals = vi.hoisted(() => ({ createProposal: vi.fn(), findPendingProposal: vi.fn() }));
const queries = vi.hoisted(() => ({ answerOwnerQuery: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/studio", () => ({ getStudioSettings: async () => ({ name: "YukDesain Studio" }) }));
vi.mock("../owner/proposals", async (orig) => ({ ...(await orig<typeof import("../owner/proposals")>()), ...proposals }));
vi.mock("../owner/query-store", () => queries);

import { buildOwnerState, buildOwnerSystemPrompt, executeOwnerTool, type OwnerTurnResult } from "./owner-conversation";

const owner = { user: { id: "u_owner", name: "Rizal" }, target: "PUBLISH" as const };
const base = {
  instructions: "Admin membalas 09.00-17.00.",
  faqs: [],
  pricingRules: [
    { id: "express", kind: "SURCHARGE" as const, name: "Express", condition: "butuh cepat", amountType: "PERCENT" as const, amount: 50, note: "" },
  ],
  knowledgeFiles: [{ title: "Gaya komunikasi", whenToUse: "", content: "Sapa dengan kak." }],
};

type OpenClient = { profileName: string | null; waId: string };
function ctx(over: { openQueries?: Map<string, OpenClient>; ownerText?: string; repliedQueryId?: string | null } = {}) {
  const result: OwnerTurnResult = { reply: null, proposal: null, answeredQueryIds: [], resendQueryIds: [], stopReason: null };
  return {
    owner,
    conversationId: "conv_o",
    current: { guide: base, version: 4 },
    openQueries: new Map([["q_1", { profileName: "Sari", waId: "6281234567890" }]]),
    unrelayedIds: new Set(["q_9"]),
    ownerText: "BISA",
    repliedQueryId: null,
    result,
    ...over,
  };
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
      unrelayed: [],
      recentlyRelayed: [],
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

describe("propose_guide_change — file pengetahuan", () => {
  it("usulan WhatsApp membawa file pengetahuan apa adanya", async () => {
    const c = ctx();
    await executeOwnerTool("propose_guide_change", { summary: "ubah jam", instructions: "Admin membalas 08.00-17.00." }, c);
    expect(proposals.createProposal.mock.calls[0][0].guide.knowledgeFiles).toEqual(base.knowledgeFiles);
  });
});

describe("jawaban owner yang belum terkirim (review produksi 2026-11-11)", () => {
  it("STATE memuat jawaban yang sudah dicatat tapi belum terkirim ke klien, dengan tanda gagal kirim", () => {
    const text = buildOwnerState({
      owner,
      current: { guide: base, version: 4 },
      pendingProposalSummary: null,
      queries: [],
      unrelayed: [
        {
          id: "q_9",
          question: "desain 3D",
          approved: false,
          relayFailedAt: new Date(),
          conversation: { waId: "6288123455389", profileName: "zidan" },
        },
      ],
      recentlyRelayed: [],
      repliedQueryId: null,
    });
    expect(text).toContain("Jawaban owner yang belum terkirim ke klien");
    expect(text).toContain("id=q_9");
    expect(text).toContain("zidan (6288****5389)");
    expect(text).toContain("gagal dikirim");
  });

  it("resend_client_answer hanya untuk jawaban yang belum terkirim", async () => {
    const c = ctx();
    expect((await executeOwnerTool("resend_client_answer", { query_id: "q_9" }, c)).isError).toBe(false);
    expect(c.result.resendQueryIds).toEqual(["q_9"]);
    expect((await executeOwnerTool("resend_client_answer", { query_id: "q_1" }, c)).isError).toBe(true);
  });

  it("answer_client_query tidak lagi mengaku sudah terkirim", async () => {
    const out = await executeOwnerTool("answer_client_query", { query_id: "q_1", approved: false, note: "tawarkan 2D" }, ctx());
    expect(JSON.parse(out.content)).toEqual({ recorded: true });
  });

  it("prompt: jangan menyatakan sudah terkirim; harga khusus satu klien bukan perubahan panduan", () => {
    const prompt = buildOwnerSystemPrompt("YukDesain");
    expect(prompt).not.toContain("konfirmasi singkat ke owner bahwa jawabannya diteruskan ke klien");
    expect(prompt).toContain("Jangan menyatakan jawaban sudah terkirim");
    expect(prompt).toContain("resend_client_answer");
    expect(prompt).toContain("Harga khusus untuk satu klien");
    expect(prompt).not.toContain("bot tidak menyebut harga layanan");
  });

  // Produksi 12 Nov: "Untuk CV WIETAS ..., pertanyaannya masih menunggu" ditempel di 6 balasan berturut-turut.
  it("prompt: tidak mengingatkan pertanyaan lain yang menunggu di setiap balasan; jawaban dicocokkan dengan isinya", () => {
    const prompt = buildOwnerSystemPrompt("YukDesain");
    expect(prompt).toContain("Jangan mengingatkan pertanyaan klien lain yang masih menunggu di setiap balasan");
    expect(prompt).toContain("Cocokkan isi jawaban owner dengan permintaan");
  });
});

// Produksi 12 Nov 18:57: "BISA, ini masuk ke desain poster menu" tanpa reply, dua pertanyaan terbuka →
// AI menebak Coffee Duri Citata; lalu bilang ke owner jawabannya "belum tentu tersimpan" padahal sudah terkirim.
describe("jawaban owner saat beberapa pertanyaan terbuka", () => {
  const two = new Map<string, OpenClient>([
    ["q_coffee", { profileName: "Coffee Duri Citata", waId: "6281200002256" }],
    ["q_mahre", { profileName: "Mahresyiadnan", waId: "6283100008846" }],
  ]);

  it("tanpa reply dan tanpa menyebut klien → ditolak, AI diminta menanyakan yang mana", async () => {
    const c = ctx({ openQueries: two, ownerText: "BISA, ini masuk ke desain poster menu" });
    const out = await executeOwnerTool("answer_client_query", { query_id: "q_coffee", approved: true, note: "Poster Menu" }, c);
    expect(out.isError).toBe(true);
    expect(out.content).toContain("tanyakan ke owner");
    expect(queries.answerOwnerQuery).not.toHaveBeenCalled();
    expect(c.result.answeredQueryIds).toEqual([]);
  });

  it("owner menyebut nama klien → dicatat", async () => {
    const c = ctx({ openQueries: two, ownerText: "2. Mahresyiadnan" });
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_mahre", approved: true }, c)).isError).toBe(false);
    expect(c.result.answeredQueryIds).toEqual(["q_mahre"]);
  });

  it("menyebut sebagian nama atau 4 digit akhir nomor juga cukup", async () => {
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_coffee", approved: true }, ctx({ openQueries: two, ownerText: "yang duri citata BISA" }))).isError).toBe(false);
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_mahre", approved: true }, ctx({ openQueries: two, ownerText: "8846 bisa" }))).isError).toBe(false);
  });

  it("nama klien lain yang disebut tidak cukup untuk pertanyaan ini", async () => {
    const out = await executeOwnerTool("answer_client_query", { query_id: "q_coffee", approved: true }, ctx({ openQueries: two, ownerText: "Mahresyiadnan BISA" }));
    expect(out.isError).toBe(true);
  });

  it("owner me-reply pesan pertanyaannya → dicatat tanpa menyebut nama", async () => {
    const c = ctx({ openQueries: two, ownerText: "BISA", repliedQueryId: "q_mahre" });
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_mahre", approved: true }, c)).isError).toBe(false);
  });

  it("satu pertanyaan terbuka → langsung dicatat", async () => {
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_1", approved: true }, ctx({ ownerText: "BISA" }))).isError).toBe(false);
  });

  it("STATE memuat jawaban yang baru dicatat dan sudah terkirim", () => {
    const text = buildOwnerState({
      owner,
      current: { guide: base, version: 4 },
      pendingProposalSummary: null,
      queries: [],
      unrelayed: [],
      recentlyRelayed: [{ id: "q_coffee", question: "desain menu roti goreng", approved: true, conversation: { waId: "6281200002256", profileName: "Coffee Duri Citata" } }],
      repliedQueryId: null,
    });
    expect(text).toContain("Jawaban owner yang sudah terkirim ke klien (2 jam terakhir)");
    expect(text).toContain("Coffee Duri Citata (6281****2256)");
    expect(text).toContain("jawaban: BISA");
  });

  it("prompt: minta owner menyebut nama klien; jangan meragukan jawaban yang sudah dicatat", () => {
    const prompt = buildOwnerSystemPrompt("YukDesain");
    expect(prompt).toContain("minta owner menyebut nama klien atau me-reply pesan pertanyaannya");
    expect(prompt).toContain("Jangan bilang jawaban owner belum tersimpan");
  });
});
