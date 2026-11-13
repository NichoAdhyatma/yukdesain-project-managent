import { beforeEach, describe, expect, it, vi } from "vitest";

const proposals = vi.hoisted(() => ({ createProposal: vi.fn(), findPendingProposal: vi.fn() }));
const queries = vi.hoisted(() => ({ answerOwnerQuery: vi.fn() }));
const db = vi.hoisted(() => ({
  waConversation: { findMany: vi.fn(), updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
  service: { findFirst: vi.fn() },
  waOwnerQuery: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/studio", () => ({ getStudioSettings: async () => ({ name: "YukDesain Studio" }) }));
vi.mock("../owner/proposals", async (orig) => ({ ...(await orig<typeof import("../owner/proposals")>()), ...proposals }));
vi.mock("../owner/query-store", () => queries);

import { buildOwnerState, buildOwnerSystemPrompt, executeOwnerTool, loadOpenQueries, type OwnerTurnResult } from "./owner-conversation";

const owner = { user: { id: "u_owner", name: "Rizal" }, target: "PUBLISH" as const };
const base = {
  instructions: "Admin membalas 09.00-17.00.",
  faqs: [],
  pricingRules: [
    { id: "express", kind: "SURCHARGE" as const, name: "Express", condition: "butuh cepat", amountType: "PERCENT" as const, amount: 50, note: "" },
  ],
  knowledgeFiles: [{ title: "Gaya komunikasi", whenToUse: "", content: "Sapa dengan kak." }],
};

type OpenClient = { profileName: string | null; waId: string; createdAt: Date };
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
function ctx(
  over: { openQueries?: Map<string, OpenClient>; ownerText?: string; recentOwnerTexts?: string[]; repliedQueryId?: string | null } = {},
) {
  const result: OwnerTurnResult = { reply: null, proposal: null, answeredQueryIds: [], resendQueryIds: [], returnedChats: [], stopReason: null };
  return {
    owner,
    conversationId: "conv_o",
    current: { guide: base, version: 4 },
    openQueries: new Map([["q_1", { profileName: "Sari", waId: "6281234567890", createdAt: minutesAgo(30) }]]),
    unrelayedIds: new Set(["q_9"]),
    ownerText: "BISA",
    recentOwnerTexts: [] as string[],
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
    ["q_coffee", { profileName: "Coffee Duri Citata", waId: "6281200002256", createdAt: minutesAgo(67) }],
    ["q_mahre", { profileName: "Mahresyiadnan", waId: "6283100008846", createdAt: minutesAgo(10) }],
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

// Produksi 13 Nov 07:51–07:53: pertanyaan hastalinuwih baru masuk 1 menit sebelumnya, pertanyaan lain berumur
// berjam-jam, tetapi "BISA, namun tanyakan dulu detail desainnya" ditolak sampai owner mengetik "9821".
describe("jawaban owner untuk satu pertanyaan yang baru masuk", () => {
  const open = new Map<string, OpenClient>([
    ["q_wietas", { profileName: "CV WIETAS Creative Studio", waId: "6285100006679", createdAt: minutesAgo(21 * 60) }],
    ["q_day", { profileName: "Day", waId: "6285100008867", createdAt: minutesAgo(17 * 60) }],
    ["q_hasta", { profileName: "hastalinuwih", waId: "6282300009821", createdAt: minutesAgo(1) }],
  ]);

  it("pertanyaan terbaru (≤10 menit) dan yang lain jauh lebih lama → dicatat untuk pertanyaan terbaru", async () => {
    const c = ctx({ openQueries: open, ownerText: "BISA, namun kamu tanyakan dulu detail desainnya" });
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_hasta", approved: true }, c)).isError).toBe(false);
  });

  it("tetap ditolak untuk pertanyaan lama yang tidak disebut", async () => {
    const c = ctx({ openQueries: open, ownerText: "BISA" });
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_day", approved: true }, c)).isError).toBe(true);
  });

  it("dua pertanyaan baru berdekatan (12 Nov 18:57) → tetap ditanyakan yang mana", async () => {
    const two = new Map<string, OpenClient>([
      ["q_a", { profileName: "A", waId: "6281100001111", createdAt: minutesAgo(9) }],
      ["q_b", { profileName: "B", waId: "6281100002222", createdAt: minutesAgo(5) }],
    ]);
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_b", approved: true }, ctx({ openQueries: two, ownerText: "BISA" }))).isError).toBe(true);
  });

  it("prompt: jawaban tanpa reply sesaat setelah satu pertanyaan baru masuk dianggap untuk pertanyaan itu", () => {
    expect(buildOwnerSystemPrompt("YukDesain")).toContain("baru masuk (10 menit terakhir)");
  });
});

// Produksi 13 Nov 21:26: owner bertanya "2701 itu pesan berapa desain?", bot menjawab soal 2701, lalu owner menulis
// "BISA, namun ada tambahan biaya 50%" dan bot tetap meminta owner menyebut "Alfa Press (2701)".
describe("jawaban owner yang mengikuti obrolan tentang satu klien", () => {
  const open = new Map<string, OpenClient>([
    ["q_alfa", { profileName: "Alfa Press", waId: "6287100002701", createdAt: minutesAgo(310) }],
    ["q_gian", { profileName: "Gian Sanjaya", waId: "6287100001996", createdAt: minutesAgo(617) }],
    ["q_eric", { profileName: "Eric Felix", waId: "6287100007776", createdAt: minutesAgo(151) }],
  ]);

  it("owner baru saja menyebut satu klien (≤30 menit) → jawaban tanpa nama dicatat untuk klien itu", async () => {
    const c = ctx({ openQueries: open, ownerText: "BISA, namun ada tambahan biaya 50% dari harga total", recentOwnerTexts: ["2701 itu pesan berapa desain?"] });
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_alfa", approved: true }, c)).isError).toBe(false);
  });

  it("tetap ditolak untuk klien lain yang tidak disebut", async () => {
    const c = ctx({ openQueries: open, ownerText: "BISA", recentOwnerTexts: ["2701 itu pesan berapa desain?"] });
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_gian", approved: true }, c)).isError).toBe(true);
  });

  it("owner baru menyebut dua klien → tetap ditanyakan yang mana", async () => {
    const c = ctx({ openQueries: open, ownerText: "BISA", recentOwnerTexts: ["2701 itu pesan berapa desain?", "kalau 7776 gimana?"] });
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_alfa", approved: true }, c)).isError).toBe(true);
  });

  it("klien yang disebut punya dua pertanyaan terbuka → tetap ditanyakan yang mana", async () => {
    const twoFromAlfa = new Map(open).set("q_alfa2", { profileName: "Alfa Press", waId: "6287100002701", createdAt: minutesAgo(20) });
    const c = ctx({ openQueries: twoFromAlfa, ownerText: "BISA", recentOwnerTexts: ["2701 itu pesan berapa desain?"] });
    expect((await executeOwnerTool("answer_client_query", { query_id: "q_alfa", approved: true }, c)).isError).toBe(true);
  });
});

describe("calculate_order_total (owner)", () => {
  it("menghitung dari katalog: 5 desain banner + express 50%", async () => {
    db.service.findFirst.mockResolvedValue({
      code: "SVC-04",
      name: "Banner UMKM",
      priceMode: "FIXED",
      startingPrice: 135000,
      packages: null,
      unitPricing: null,
    });
    const out = await executeOwnerTool("calculate_order_total", { service: "Banner UMKM", quantity: 5, surcharge_percent: 50 }, ctx());
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.content)).toMatchObject({ total: 1012500, lines: expect.arrayContaining(["Total: Rp1.012.500"]) });
    expect(db.service.findFirst.mock.calls[0][0].where).toMatchObject({ isActive: true });
  });

  it("layanan tidak dikenal → error", async () => {
    db.service.findFirst.mockResolvedValue(null);
    expect((await executeOwnerTool("calculate_order_total", { service: "Jasa Joki", quantity: 1 }, ctx())).isError).toBe(true);
  });

  it("prompt: owner boleh minta hitungan total; harga ke klien tetap lewat invoice", () => {
    const prompt = buildOwnerSystemPrompt("YukDesain");
    expect(prompt).toContain("calculate_order_total");
    expect(prompt).not.toContain("bot menghitung total di luar kalkulator");
  });
});

// Produksi 13 Nov 07:48: owner menulis "nomor berakhiran 2367 coba kamu jawab" (Mif, mode admin sejak kemarin);
// asisten owner tidak punya cara mengembalikan chat ke bot.
describe("return_chat_to_bot", () => {
  const chats = [
    { id: "c_mif", waId: "6281100002367", profileName: "Mif", mode: "HUMAN" },
    { id: "c_xn", waId: "6281100009999", profileName: "Xn", mode: "BOT" },
  ];
  beforeEach(() => {
    db.waConversation.findMany.mockResolvedValue(chats);
    db.waConversation.updateMany.mockResolvedValue({ count: 1 });
  });

  it("4 digit akhir nomor → chat kembali ke bot, tercatat di ActivityLog, dilaporkan untuk dibalas", async () => {
    const c = ctx();
    const out = await executeOwnerTool("return_chat_to_bot", { client: "2367" }, c);
    expect(out.isError).toBe(false);
    expect(db.waConversation.updateMany).toHaveBeenCalledWith({ where: { id: "c_mif", mode: "HUMAN" }, data: { mode: "BOT" } });
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ entityType: "WaConversation", entityId: "c_mif", action: "WA_CHAT_RETURNED_TO_BOT", actorId: "u_owner" }),
    });
    expect(c.result.returnedChats).toEqual([{ conversationId: "c_mif", label: "Mif (6281****2367)" }]);
    expect(db.waConversation.findMany.mock.calls[0][0].where).toMatchObject({ isSandbox: false, blockedAt: null });
  });

  it("nama klien juga bisa", async () => {
    const c = ctx();
    expect((await executeOwnerTool("return_chat_to_bot", { client: "Mif" }, c)).isError).toBe(false);
    expect(c.result.returnedChats.map((r) => r.conversationId)).toEqual(["c_mif"]);
  });

  it("tidak ketemu atau lebih dari satu → error ke model, tidak ada yang diubah", async () => {
    expect((await executeOwnerTool("return_chat_to_bot", { client: "Budi" }, ctx())).isError).toBe(true);
    db.waConversation.findMany.mockResolvedValue([...chats, { id: "c_mif2", waId: "6281100005555", profileName: "Mif Dua", mode: "HUMAN" }]);
    const out = await executeOwnerTool("return_chat_to_bot", { client: "Mif" }, ctx());
    expect(out.isError).toBe(true);
    expect(out.content).toContain("Mif Dua");
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
  });

  it("chat yang sudah dilayani bot: tidak diubah, tetapi pesan yang tertinggal tetap dicek", async () => {
    const c = ctx();
    expect((await executeOwnerTool("return_chat_to_bot", { client: "9999" }, c)).isError).toBe(false);
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
    expect(c.result.returnedChats.map((r) => r.conversationId)).toEqual(["c_xn"]);
  });

  it("prompt: perintah owner untuk membalas chat klien memakai return_chat_to_bot", () => {
    expect(buildOwnerSystemPrompt("YukDesain")).toContain("return_chat_to_bot");
  });
});

// Daftar pertanyaan terbuka dibatasi 10. Dulu yang diambil 10 TERLAMA, sehingga pada hari ramai pertanyaan yang baru
// masuk (yang paling mungkin sedang dijawab owner) tidak ada di STATE.
describe("loadOpenQueries", () => {
  it("mengambil 10 pertanyaan terbaru, ditampilkan urut dari yang terlama", async () => {
    db.waOwnerQuery.findMany.mockResolvedValue([{ id: "q_new" }, { id: "q_mid" }, { id: "q_old" }]);
    const rows = await loadOpenQueries(owner);
    expect(db.waOwnerQuery.findMany.mock.calls[0][0]).toMatchObject({ orderBy: { createdAt: "desc" }, take: 10 });
    expect(rows.map((r) => r.id)).toEqual(["q_old", "q_mid", "q_new"]);
  });
});
