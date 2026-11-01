import { beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

const create = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  waMessage: { findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
  waIntake: { findFirst: vi.fn() },
  paymentAccount: { findMany: vi.fn() },
}));
const tools = vi.hoisted(() => ({ executeTool: vi.fn(), findActiveIntake: vi.fn() }));
const media = vi.hoisted(() => ({ readPrivateMedia: vi.fn(), mimeFromStorageKey: vi.fn(() => "image/jpeg") }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/studio", () => ({ getStudioSettings: async () => ({ name: "YukDesain Studio" }) }));
vi.mock("../env", () => ({
  getWhatsAppEnv: () => ({ ANTHROPIC_API_KEY: "k", WA_AI_MODEL: "claude-haiku-5-5", WA_AI_MAX_TOKENS: 800 }),
}));
vi.mock("../media", () => media);
vi.mock("./tools", async (orig) => ({ ...(await orig<typeof import("./tools")>()), ...tools }));

import { runAiTurn } from "./conversation";

type Row = { id: string; direction: "INBOUND" | "OUTBOUND"; type: string; body: string; mediaStorageKey: string | null };
const inbound = (id: string, body: string, extra: Partial<Row> = {}): Row => ({
  id, direction: "INBOUND", type: "text", body, mediaStorageKey: null, ...extra,
});
const outbound = (id: string, body: string): Row => ({ id, direction: "OUTBOUND", type: "text", body, mediaStorageKey: null });

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

beforeEach(() => {
  vi.clearAllMocks();
  db.waMessage.findUniqueOrThrow.mockResolvedValue({ createdAt: new Date() });
  db.waIntake.findFirst.mockResolvedValue(null);
  db.paymentAccount.findMany.mockResolvedValue([]);
  tools.findActiveIntake.mockResolvedValue(null);
  tools.executeTool.mockResolvedValue({ content: '{"ok":true}', isError: false });
});

describe("runAiTurn", () => {
  it("history → pesan user/assistant, STATE sebagai pesan system terakhir", async () => {
    givenHistory([outbound("o0", "pesan bot lama"), inbound("m1", "halo"), outbound("o1", "Halo kak!"), inbound("m_last", "mau logo")]);
    create.mockResolvedValue(textResponse("Siap kak"));

    const result = await runAiTurn(params);

    expect(result.reply).toBe("Siap kak");
    const messages = sentMessages();
    // pesan pertama wajib user: balasan bot di awal jendela dibuang
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "system"]);
    expect(messages[2].content).toBe("mau logo");
    expect(String(messages[3].content)).toContain("STATE");
    expect(String(messages[3].content)).toContain("Belum ada order aktif");
  });

  it("system prompt di-cache, model & batas dari env, effort low, tools tersedia", async () => {
    givenHistory([inbound("m_last", "halo")]);
    create.mockResolvedValue(textResponse("ok"));
    await runAiTurn(params);
    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-haiku-5-5");
    expect(req.max_tokens).toBe(800);
    expect(req.output_config).toEqual({ effort: "low" });
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0].text).toContain("YukDesain Studio");
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
    expect(String(messages.at(-1)!.content)).toContain("messageId: img_new");
  });

  it("menjalankan tool dengan konteks percakapan dari server lalu melanjutkan", async () => {
    givenHistory([inbound("m_last", "mau logo")]);
    create
      .mockResolvedValueOnce(toolResponse("start_intake", { service_code: "SVC-01" }))
      .mockResolvedValueOnce(textResponse("Siap kak, nama brandnya apa?"));
    tools.findActiveIntake.mockResolvedValue({ status: "COLLECTING", briefDraft: { brand_name: "A" } });

    const result = await runAiTurn(params);

    expect(tools.executeTool).toHaveBeenCalledWith("start_intake", { service_code: "SVC-01" }, { conversationId: "conv_1" });
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
      service: { code: "SVC-01", name: "Logo Minimalis" },
    });
    db.paymentAccount.findMany.mockResolvedValue([{ name: "BCA", accountNumber: "123", accountHolder: "YukDesain" }]);
    create.mockResolvedValue(textResponse("ok"));
    await runAiTurn(params);
    const state = String(sentMessages().at(-1)!.content);
    expect(state).toContain("Rp2.500.000");
    expect(state).toContain("Rp1.250.000");
    expect(state).toContain("1 Desember 2026");
    expect(state).toContain("BCA 123 a.n. YukDesain");
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
    const state = String(sentMessages().at(-1)!.content);
    expect(state).not.toContain("999");
    expect(state).toContain("business_desc");
    expect(db.paymentAccount.findMany).not.toHaveBeenCalled();
  });
});
