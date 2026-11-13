import { beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { OPERATIONS_DEFAULTS } from "@/lib/studio-operations";

const create = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  waMessage: { findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
  waIntake: { findFirst: vi.fn() },
  waConversation: { findUniqueOrThrow: vi.fn() },
  waOwnerQuery: { findMany: vi.fn(async () => []) },
  paymentAccount: { findMany: vi.fn() },
  service: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
}));
const guides = vi.hoisted(() => ({ getDraftGuide: vi.fn(), getPublishedGuide: vi.fn() }));
const tools = vi.hoisted(() => ({ executeTool: vi.fn(), findActiveIntake: vi.fn() }));
const media = vi.hoisted(() => ({ readPrivateMedia: vi.fn(), mimeFromStorageKey: vi.fn(() => "image/jpeg") }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/studio", () => ({ getStudioSettings: async () => ({ name: "YukDesain Studio" }) }));
vi.mock("@/lib/studio-operations", async (orig) => {
  const actual = await orig<typeof import("@/lib/studio-operations")>();
  return { ...actual, getStudioOperations: async () => actual.OPERATIONS_DEFAULTS };
});
const aiConfig = vi.hoisted(() => ({
  model: "claude-haiku-5-5",
  extractionModel: "claude-sonnet-5-5",
  baseUrl: "https://api.anthropic.com",
  maxTokens: 800,
}));
vi.mock("./ai-config", () => ({
  getAiTargets: async () => ({
    chat: { providerKey: "env:ANTHROPIC", model: aiConfig.model },
    proof: { providerKey: "env:ANTHROPIC", model: aiConfig.extractionModel },
    fallback: null,
    maxTokens: aiConfig.maxTokens,
  }),
}));
// Jalur adapter asli (createChatWithFallback + opsi Claude), dengan provider dan client tiruan.
vi.mock("@/lib/ai/providers", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/providers")>()),
  resolveProvider: async () => ({ key: "env:ANTHROPIC", name: "Anthropic", format: "ANTHROPIC", baseUrl: aiConfig.baseUrl, builtIn: true, credentialVersion: "v", apiKey: "k" }),
}));
vi.mock("@/lib/ai/client", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/client")>()), getAiClient: () => ({ create }) }));
vi.mock("../media", () => media);
vi.mock("./bot-guide", async (orig) => ({ ...(await orig<typeof import("./bot-guide")>()), ...guides }));
vi.mock("./tools", async (orig) => ({ ...(await orig<typeof import("./tools")>()), ...tools }));

import { TEAM_MESSAGE_LABEL, runAiTurn } from "./conversation";

type Row = { id: string; direction: "INBOUND" | "OUTBOUND"; type: string; body: string; mediaStorageKey: string | null; sentByBot: boolean };
const inbound = (id: string, body: string, extra: Partial<Row> = {}): Row => ({
  id, direction: "INBOUND", type: "text", body, mediaStorageKey: null, sentByBot: false, ...extra,
});
const outbound = (id: string, body: string): Row => ({ id, direction: "OUTBOUND", type: "text", body, mediaStorageKey: null, sentByBot: true });
// Pesan keluar yang bukan tulisan AI: invoice/verifikasi DP dari portal, balasan admin dari portal atau HP.
const teamOutbound = (id: string, body: string): Row => ({ ...outbound(id, body), sentByBot: false });

function givenHistory(rows: Row[]) {
  // findMany dipanggil desc lalu di-reverse oleh kode
  db.waMessage.findMany.mockResolvedValue([...rows].reverse());
}

const textResponse = (text: string, stop: Anthropic.StopReason = "end_turn") => ({
  stop_reason: stop,
  content: [{ type: "text", text }],
});
const toolResponse = (name: string, input: unknown, id = "tu_1") => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name, input }],
});

const params = { conversationId: "conv_1", messageId: "m_last" };
const sentMessages = (call = 0) => create.mock.calls[call][0].messages as Anthropic.MessageParam[];
const stateOf = (call = 0) => (create.mock.calls[call][0].system as Anthropic.TextBlockParam[])[1].text;
const rulesOf = (call = 0) => (create.mock.calls[call][0].system as Anthropic.TextBlockParam[])[0].text;

beforeEach(() => {
  vi.clearAllMocks();
  db.waMessage.findUniqueOrThrow.mockResolvedValue({ createdAt: new Date() });
  db.waIntake.findFirst.mockResolvedValue(null);
  db.paymentAccount.findMany.mockResolvedValue([]);
  db.waConversation.findUniqueOrThrow.mockResolvedValue({ isSandbox: false });
  guides.getPublishedGuide.mockResolvedValue(null);
  guides.getDraftGuide.mockResolvedValue({ instructions: "", faqs: [], pricingRules: [], knowledgeFiles: [] });
  tools.findActiveIntake.mockResolvedValue(null);
  tools.executeTool.mockResolvedValue({ content: '{"ok":true}', isError: false });
});

describe("runAiTurn", () => {
  it("history → pesan user/assistant, STATE sebagai blok system kedua", async () => {
    givenHistory([outbound("o0", "pesan bot lama"), inbound("m1", "halo"), outbound("o1", "Halo kak!"), inbound("m_last", "mau logo")]);
    create.mockResolvedValue(textResponse("Siap kak"));

    const result = await runAiTurn(params);

    expect(result.reply).toBe("Siap kak");
    const messages = sentMessages();
    // pesan pertama wajib user: balasan bot di awal jendela dibuang
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[2].content).toBe("mau logo");
    expect(stateOf()).toContain("STATE");
    expect(stateOf()).toContain("Belum ada order aktif");
  });

  it("pesan terakhir dari bot (meneruskan jawaban owner) → ditutup catatan user, bukan prefill assistant", async () => {
    // Produksi 2026-11-11/12: semua penerusan jawaban owner ditolak provider (400) karena pesan berakhir di assistant.
    givenHistory([inbound("m1", "mau template rekap"), outbound("m_last", "Sudah kami teruskan ke tim ya kak")]);
    create.mockResolvedValue(textResponse("Kak, templatenya tersedia"));

    await runAiTurn(params);

    const messages = sentMessages();
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[2].content).toMatch(/Belum ada pesan baru dari klien/);
  });

  // Produksi 12 Nov (Nicho 15:55, ayubbb 14:03): pesan portal/admin terbaca sebagai tulisan AI, lalu AI meralatnya
  // ("abaikan info kode project tadi") padahal benar.
  it("pesan tim (portal/admin) diberi label di riwayat; balasan AI tidak", async () => {
    givenHistory([
      inbound("m1", "sudah transfer"),
      outbound("o1", "Bukti sudah kami terima, sedang dicek tim kami ya kak"),
      teamOutbound("o2", "Halo kak, pembayaran DP sudah kami verifikasi. Kode project PRJ-20261112-4XMQG1."),
      inbound("m_last", "klo bikin spanduk brp ya"),
    ]);
    create.mockResolvedValue(textResponse("Banner UMKM Rp135.000 kak"));

    await runAiTurn(params);

    const messages = sentMessages();
    expect(messages[1].content).toBe("Bukti sudah kami terima, sedang dicek tim kami ya kak");
    expect(messages[2].content).toBe(`${TEAM_MESSAGE_LABEL} Halo kak, pembayaran DP sudah kami verifikasi. Kode project PRJ-20261112-4XMQG1.`);
  });

  it("mengembalikan pesan keluar terakhir (terbaru dulu, maks 5) untuk penjaga kalimat berulang", async () => {
    givenHistory([
      ...["a", "b", "c", "d", "e", "f"].map((x) => outbound(`o_${x}`, `bot ${x}`)),
      teamOutbound("o_team", "invoice"),
      inbound("m_last", "oke kak"),
    ]);
    create.mockResolvedValue(textResponse("Siap kak"));
    const result = await runAiTurn(params);
    expect(result.recentOutbound).toEqual(["invoice", "bot f", "bot e", "bot d", "bot c"]);
  });

  // Produksi 13 Nov (Mif): foto ditolak batas gambar, bot tetap bilang "gambarnya tetap kami terima".
  it("gambar yang tidak tersimpan diberi tahu jelas ke AI: jangan bilang sudah diterima", async () => {
    givenHistory([inbound("m_img", "Ini logonya", { type: "image" }), inbound("m_last", "sudah kak")]);
    create.mockResolvedValue(textResponse("Oke kak"));
    await runAiTurn(params);
    expect(sentMessages()[0].content).toContain("TIDAK tersimpan");
    expect(sentMessages()[0].content).toContain("Jangan bilang gambar ini sudah diterima");
  });

  it("jendela riwayat hanya berisi pesan bot → tetap ada satu pesan user", async () => {
    givenHistory([outbound("o1", "Sudah kami teruskan"), outbound("m_last", "Maaf kak, sistem kami sedang sibuk")]);
    create.mockResolvedValue(textResponse("Kak, templatenya tersedia"));

    await runAiTurn(params);

    expect(sentMessages().map((m) => m.role)).toEqual(["user"]);
  });

  it("system prompt di-cache, model & batas dari config, effort sesuai model, tools tersedia", async () => {
    givenHistory([inbound("m_last", "halo")]);
    create.mockResolvedValue(textResponse("ok"));
    await runAiTurn(params);
    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-haiku-5-5");
    expect(req.max_tokens).toBe(800);
    expect(req.output_config).toEqual({ effort: "low" });
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0].text).toContain("YukDesain Studio");
    expect(req.system[1].cache_control).toBeUndefined();
    expect(req.tools.length).toBeGreaterThan(0);
    expect(req.tool_choice).toEqual({ type: "auto" });
  });

  it("gambar yang belum ditanggapi dikirim sebagai gambar, gambar lama cukup teks", async () => {
    givenHistory([
      inbound("img_old", "", { type: "image", mediaStorageKey: "wa-media/c/old.jpg" }),
      outbound("o1", "Gambar sudah diterima"),
      inbound("img_new", "ini referensi", { type: "image", mediaStorageKey: "wa-media/c/new.jpg" }),
      inbound("m_last", "yang ini ya"),
    ]);
    media.readPrivateMedia.mockResolvedValue(Buffer.from("IMG"));
    create.mockResolvedValue(textResponse("ok"));

    await runAiTurn(params);

    expect(media.readPrivateMedia).toHaveBeenCalledTimes(1);
    expect(media.readPrivateMedia).toHaveBeenCalledWith("wa-media/c/new.jpg");
    const messages = sentMessages();
    expect(messages[0].content).toBe("[Gambar dari klien, messageId=img_old]");
    const imgTurn = messages[2].content as Anthropic.ContentBlockParam[];
    expect(imgTurn[0]).toMatchObject({ type: "image", source: { type: "base64", data: Buffer.from("IMG").toString("base64") } });
    expect(imgTurn[1]).toMatchObject({ type: "text", text: "[Gambar dari klien, messageId=img_new] Keterangan klien: ini referensi" });
    expect(stateOf()).toContain("messageId: img_new");
  });

  it("menjalankan tool dengan konteks percakapan dari server lalu melanjutkan", async () => {
    givenHistory([inbound("m_last", "mau logo")]);
    create
      .mockResolvedValueOnce(toolResponse("start_intake", { service_code: "SVC-01" }))
      .mockResolvedValueOnce(textResponse("Siap kak, nama brandnya apa?"));
    tools.findActiveIntake.mockResolvedValue({ status: "COLLECTING", briefDraft: { brand_name: "A" } });

    const result = await runAiTurn(params);

    expect(tools.executeTool).toHaveBeenCalledWith("start_intake", { service_code: "SVC-01" }, expect.objectContaining({ conversationId: "conv_1", isSandbox: false }));
    expect(result).toMatchObject({
      reply: "Siap kak, nama brandnya apa?",
      intakeStatus: "COLLECTING",
      briefText: '{"brand_name":"A"}',
      toolsCalled: ["start_intake"],
    });
    const second = sentMessages(1);
    expect(second.at(-2)).toMatchObject({ role: "assistant" });
    expect(second.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "tu_1", content: '{"ok":true}', is_error: false }],
    });
  });

  it("error tool dikirim balik ke model dengan is_error", async () => {
    givenHistory([inbound("m_last", "x")]);
    tools.executeTool.mockResolvedValue({ content: '{"error":"x"}', isError: true });
    create.mockResolvedValueOnce(toolResponse("confirm_brief", { summary: "s" })).mockResolvedValueOnce(textResponse("ok"));
    await runAiTurn(params);
    expect((sentMessages(1).at(-1)!.content as Anthropic.ToolResultBlockParam[])[0].is_error).toBe(true);
  });

  it("maksimal 4 putaran tool, lalu dipaksa menjawab tanpa tool", async () => {
    givenHistory([inbound("m_last", "x")]);
    create.mockImplementation(async (req: { tool_choice: { type: string } }) =>
      req.tool_choice.type === "none" ? textResponse("selesai") : toolResponse("list_services", {}),
    );
    const result = await runAiTurn(params);
    expect(create).toHaveBeenCalledTimes(5);
    expect(create.mock.calls[4][0].tool_choice).toEqual({ type: "none" });
    expect(tools.executeTool).toHaveBeenCalledTimes(4);
    expect(result.reply).toBe("selesai");
  });

  it("model tanpa dukungan effort → parameter effort tidak dikirim", async () => {
    givenHistory([inbound("m_last", "halo")]);
    create.mockResolvedValue(textResponse("ok"));
    aiConfig.model = "claude-haiku-4-5";
    try {
      await runAiTurn(params);
    } finally {
      aiConfig.model = "claude-haiku-5-5";
    }
    expect(create.mock.calls[0][0].model).toBe("claude-haiku-4-5");
    expect(create.mock.calls[0][0]).not.toHaveProperty("output_config");
  });

  it("refusal → error (pemanggil yang fallback)", async () => {
    givenHistory([inbound("m_last", "x")]);
    create.mockResolvedValue({ stop_reason: "refusal", content: [] });
    await expect(runAiTurn(params)).rejects.toThrow("AI_REFUSAL");
  });

  it("tanpa teks (mis. max_tokens) → reply null", async () => {
    givenHistory([inbound("m_last", "x")]);
    create.mockResolvedValue({ stop_reason: "max_tokens", content: [{ type: "thinking", thinking: "" }] });
    expect((await runAiTurn(params)).reply).toBeNull();
  });

  it("QUOTED: STATE memuat harga, DP, deadline, dan rekening aktif", async () => {
    givenHistory([inbound("m_last", "berapa?")]);
    db.waIntake.findFirst.mockResolvedValue({
      status: "QUOTED",
      clientName: "Budi",
      clientEmail: null,
      briefDraft: {},
      agreedPrice: 2500000,
      dpAmount: 1250000,
      deadline: new Date("2026-12-01T00:00:00Z"),
      invoiceNumber: "INV-WA-20261111-AB12",
      service: { code: "SVC-01", name: "Logo Minimalis" },
    });
    db.paymentAccount.findMany.mockResolvedValue([{ name: "BCA", accountNumber: "123", accountHolder: "YukDesain" }]);
    create.mockResolvedValue(textResponse("ok"));
    await runAiTurn(params);
    const state = stateOf();
    expect(state).toContain("Rp2.500.000");
    expect(state).toContain("1 Desember 2026");
    expect(state).toContain("INV-WA-20261111-AB12");
    // Bot tidak menyebut DP dan tidak mengirim rekening: invoice dikirim tim (spec 2026-11-11 §5).
    expect(state).not.toContain("Rp1.250.000");
    expect(state).not.toContain("BCA 123");
    expect(db.paymentAccount.findMany).not.toHaveBeenCalled();
  });

  it("COLLECTING: STATE tidak memuat harga walau kolom terisi", async () => {
    givenHistory([inbound("m_last", "x")]);
    db.waIntake.findFirst.mockResolvedValue({
      status: "COLLECTING",
      clientName: null,
      clientEmail: null,
      briefDraft: { brand_name: "Kopi" },
      agreedPrice: 999999,
      dpAmount: 500000,
      deadline: new Date(),
      service: { code: "SVC-01", name: "Logo Minimalis" },
    });
    create.mockResolvedValue(textResponse("ok"));
    await runAiTurn(params);
    const state = stateOf();
    expect(state).not.toContain("999");
    expect(state).toContain("business_desc");
    expect(db.paymentAccount.findMany).not.toHaveBeenCalled();
  });

  it("jawaban tim yang sudah disampaikan (7 hari) ikut di STATE sebagai sudah dijawab (kasus Day)", async () => {
    givenHistory([inbound("m_last", "gmna klo mau order?")]);
    db.waOwnerQuery.findMany.mockResolvedValue([
      { question: "Minta ide konsep banner", status: "ANSWERED", approved: true, note: "Minta nama brand", relayedAt: new Date() },
    ] as never);
    create.mockResolvedValue(textResponse("ok"));
    await runAiTurn(params);
    const where = (db.waOwnerQuery.findMany.mock.calls[0] as unknown as [{ where: { OR: unknown[] } }])[0].where;
    expect(where.OR).toContainEqual({ status: "ANSWERED", relayedAt: { not: null }, answeredAt: { gt: expect.any(Date) } });
    expect(stateOf()).toContain("Sudah dijawab tim dan sudah disampaikan ke klien");
  });

  describe("gambar klien yang belum masuk brief (kasus Yeni 2026-11-12)", () => {
    const collecting = (briefDraft: Record<string, unknown>, status = "COLLECTING") => ({
      status,
      clientName: null,
      clientEmail: null,
      briefDraft,
      agreedPrice: null,
      dpAmount: null,
      deadline: null,
      service: { code: "SVC-02", name: "Logo Ilustrasi" },
    });
    const history = [
      inbound("img_logo", "ini design logo lama", { type: "image", mediaStorageKey: "wa/img_logo.jpg" }),
      outbound("o1", "Siap kak, pakai Logo Ilustrasi ya"),
      inbound("img_rusak", "", { type: "image", mediaStorageKey: null }),
      inbound("m_last", "warnanya merah"),
    ];

    it("gambar yang dikirim sebelum order dibuat tetap didaftar untuk dimasukkan", async () => {
      givenHistory(history);
      db.waIntake.findFirst.mockResolvedValue(collecting({}));
      create.mockResolvedValue(textResponse("ok"));
      await runAiTurn(params);
      expect(stateOf()).toContain("Gambar klien yang belum masuk brief (masukkan dengan attach_image_to_brief): messageId=img_logo");
      // Gambar yang gagal disimpan tidak bisa dimasukkan.
      expect(stateOf()).not.toContain("messageId=img_rusak,");
      expect(stateOf()).not.toMatch(/belum masuk brief[^\n]*img_rusak/);
    });

    it("gambar yang sudah masuk brief tidak didaftar lagi", async () => {
      givenHistory(history);
      db.waIntake.findFirst.mockResolvedValue(
        collecting({ reference_items_json: [{ id: "wa-img_logo", type: "image", url: "https://cdn/wa-intake/i1/img_logo.jpg", caption: "logo lama" }] }),
      );
      create.mockResolvedValue(textResponse("ok"));
      await runAiTurn(params);
      expect(stateOf()).not.toContain("Gambar klien yang belum masuk brief");
    });

    it("setelah brief dikonfirmasi tidak didaftar (bisa saja bukti transfer)", async () => {
      givenHistory(history);
      db.waIntake.findFirst.mockResolvedValue(collecting({}, "BRIEF_CONFIRMED"));
      create.mockResolvedValue(textResponse("ok"));
      await runAiTurn(params);
      expect(stateOf()).not.toContain("Gambar klien yang belum masuk brief");
    });
  });

  it("katalog Layanan: daftar di system prompt, detail layanan order di STATE, angka untuk penjaga", async () => {
    givenHistory([inbound("m_last", "mau logo")]);
    db.service.findMany.mockResolvedValue([
      { code: "SVC-01", name: "Logo Minimalis", description: null, outputFormat: "AI, PNG", startingPrice: 150000, priceNote: "termasuk 3 konsep", suitableFor: "brand modern", botNotes: "tanya media pemakaian" },
    ]);
    db.waIntake.findFirst.mockResolvedValue({
      status: "COLLECTING",
      clientName: null,
      clientEmail: null,
      briefDraft: {},
      agreedPrice: null,
      dpAmount: null,
      deadline: null,
      service: { code: "SVC-01", name: "Logo Minimalis" },
    });
    tools.findActiveIntake.mockResolvedValue(null);
    create.mockResolvedValue(textResponse("ok"));
    const result = await runAiTurn(params);
    const system = create.mock.calls[0][0].system as { text: string }[];
    expect(system[0].text).toContain("- Logo Minimalis (SVC-01): mulai Rp150.000 (termasuk 3 konsep)");
    expect(system[0].text).not.toContain("tanya media pemakaian");
    expect(stateOf()).toContain("Catatan internal untuk kamu (jangan dikutip ke klien): tanya media pemakaian");
    expect(result.guardExtras.catalogGroups).toEqual([["150000", "termasuk 3 konsep"]]);
    expect(result.guardExtras.policyNumbers).toContain(OPERATIONS_DEFAULTS.revisionNotice);
  });

  it("penjaga: harga pasti, estimasi katalog, dan total calculate_price giliran itu", async () => {
    givenHistory([inbound("m_last", "poster menu 40 item berapa?")]);
    db.service.findMany.mockResolvedValue([
      {
        code: "SVC-08", name: "Poster Menu", description: null, outputFormat: null, startingPrice: 135000, priceNote: null, suitableFor: null, botNotes: null,
        priceMode: "FIXED", packages: null, unitPricing: { unitLabel: "item", includedUnits: 35, extraUnitPrice: 5000, minUnits: null }, estimate: "3 hari",
      },
      {
        code: "SVC-01", name: "Logo Minimalis", description: null, outputFormat: null, startingPrice: 150000, priceNote: null, suitableFor: null, botNotes: null,
        priceMode: "STARTING", packages: null, unitPricing: null, estimate: "5-7 hari",
      },
    ]);
    db.waIntake.findFirst.mockResolvedValue(null);
    tools.findActiveIntake.mockResolvedValue(null);
    tools.executeTool.mockImplementation(async (_name: string, _input: unknown, ctx: { calculatedTotals?: number[] }) => {
      ctx.calculatedTotals?.push(160000);
      return { content: JSON.stringify({ total: 160000, breakdown: "Rp135.000 (sampai 35 item) + 5 item × Rp5.000 = Rp160.000" }), isError: false };
    });
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_1", name: "calculate_price", input: { service_code: "SVC-08", units: 40 } }] })
      .mockResolvedValueOnce(textResponse("Totalnya Rp160.000 ya kak"));
    const result = await runAiTurn(params);
    expect(result.guardExtras.fixedGroups).toEqual([["135000", "5000"]]);
    expect(result.guardExtras.calculatedTotals).toEqual(["160000"]);
    expect(result.guardExtras.estimateGroups).toEqual([["3"], ["5", "7"]]);
  });

  it("penjaga: estimasi dibatasi ke layanan order aktif", async () => {
    givenHistory([inbound("m_last", "berapa lama?")]);
    db.service.findMany.mockResolvedValue([
      { code: "SVC-08", name: "Poster Menu", description: null, outputFormat: null, startingPrice: 135000, priceNote: null, suitableFor: null, botNotes: null, priceMode: "FIXED", packages: null, unitPricing: null, estimate: "3 hari" },
      { code: "SVC-01", name: "Logo Minimalis", description: null, outputFormat: null, startingPrice: 150000, priceNote: null, suitableFor: null, botNotes: null, priceMode: "STARTING", packages: null, unitPricing: null, estimate: "5-7 hari" },
    ]);
    db.waIntake.findFirst.mockResolvedValue(null);
    tools.findActiveIntake.mockResolvedValue({ id: "in_1", status: "COLLECTING", briefDraft: {}, service: { id: "s", code: "SVC-01" } });
    create.mockResolvedValue(textResponse("ok"));
    const result = await runAiTurn(params);
    expect(result.guardExtras.estimateGroups).toEqual([["5", "7"]]);
  });
});

describe("runAiTurn — panduan owner", () => {
  const published = { instructions: "Admin membalas jam 09.00-17.00 WIB.", faqs: [], pricingRules: [], knowledgeFiles: [] };
  const draft = { instructions: "", faqs: [{ question: "Bisa minta file mentah?", answer: "Bisa, file AI dan PDF ikut dikirim." }], pricingRules: [], knowledgeFiles: [] };

  beforeEach(() => {
    givenHistory([inbound("m_last", "halo")]);
    create.mockResolvedValue(textResponse("Halo kak"));
    guides.getPublishedGuide.mockResolvedValue({ version: 3, publishedAt: new Date(), guide: published });
    guides.getDraftGuide.mockResolvedValue(draft);
  });

  it("klien sungguhan: versi terbit, draft tidak dipakai", async () => {
    await runAiTurn(params);
    expect(rulesOf()).toContain("Admin membalas jam 09.00-17.00 WIB.");
    expect(rulesOf()).not.toContain("file mentah");
    expect(guides.getDraftGuide).not.toHaveBeenCalled();
  });

  it("Uji bot (sandbox): draft dipakai", async () => {
    db.waConversation.findUniqueOrThrow.mockResolvedValue({ isSandbox: true });
    await runAiTurn(params);
    expect(rulesOf()).toContain("Bisa minta file mentah?");
    expect(rulesOf()).not.toContain("09.00-17.00");
  });

  it("panduan ditaruh setelah aturan wajib, di blok yang di-cache", async () => {
    await runAiTurn(params);
    const rules = rulesOf();
    expect(rules.indexOf("# Batas yang tidak boleh dilanggar")).toBeLessThan(rules.indexOf("# Panduan dari pemilik"));
    expect((create.mock.calls[0][0].system as Anthropic.TextBlockParam[])[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("belum ada panduan terbit: prompt tanpa bagian panduan", async () => {
    guides.getPublishedGuide.mockResolvedValue(null);
    await runAiTurn(params);
    expect(rulesOf()).not.toContain("# Panduan dari pemilik");
  });
});
