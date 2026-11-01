import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waMessage: { findUniqueOrThrow: vi.fn(), create: vi.fn(), count: vi.fn() },
  waConversation: { update: vi.fn() },
  studioSettings: { findUnique: vi.fn() },
}));
const api = vi.hoisted(() => ({ sendText: vi.fn(), markAsRead: vi.fn() }));
const media = vi.hoisted(() => ({ storeInboundMedia: vi.fn() }));
const ai = vi.hoisted(() => ({ runAiTurn: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./client-api", async (orig) => ({
  ...(await orig<typeof import("./client-api")>()),
  sendText: api.sendText,
  markAsRead: api.markAsRead,
}));
vi.mock("./media", () => media);
vi.mock("./ai/conversation", () => ai);

import { WhatsAppApiError } from "./client-api";
import { BOT_REPLIES, handleInboundMessage } from "./bot";
import { PRICE_PLACEHOLDER } from "./ai/reply-guard";

function givenMessage(type: string, body = "halo", mode = "BOT") {
  db.waMessage.findUniqueOrThrow.mockResolvedValue({
    id: "msg_1",
    wamid: "wamid.IN",
    type,
    body,
    createdAt: new Date("2026-11-01T10:00:00Z"),
    conversation: { id: "conv_1", waId: "6281234567890", mode },
  });
}

const aiReply = (reply: string | null, intakeStatus: string | null = "COLLECTING", briefText = "{}") =>
  ai.runAiTurn.mockResolvedValue({ reply, intakeStatus, briefText, toolsCalled: [] });

const sentBodies = () => api.sendText.mock.calls.map(([, body]) => body);
const humanModeSet = () =>
  db.waConversation.update.mock.calls.some(([arg]) => arg.data?.mode === "HUMAN");

describe("handleInboundMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: true });
    db.waMessage.count.mockResolvedValue(0);
    api.sendText.mockResolvedValue("wamid.OUT");
    api.markAsRead.mockResolvedValue(undefined);
    aiReply("Halo kak, mau desain apa?");
  });

  it("bot nonaktif → tidak membalas, AI tidak dipanggil", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: false });
    givenMessage("text");
    await handleInboundMessage("msg_1");
    expect(api.sendText).not.toHaveBeenCalled();
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("settings belum ada → dianggap nonaktif", async () => {
    db.studioSettings.findUnique.mockResolvedValue(null);
    givenMessage("text");
    await handleInboundMessage("msg_1");
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("mode HUMAN → tidak membalas", async () => {
    givenMessage("text", "halo", "HUMAN");
    await handleInboundMessage("msg_1");
    expect(api.sendText).not.toHaveBeenCalled();
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("teks → tandai dibaca, balasan AI dikirim dan disimpan", async () => {
    givenMessage("text");
    await handleInboundMessage("msg_1");
    expect(api.markAsRead).toHaveBeenCalledWith("wamid.IN");
    expect(ai.runAiTurn).toHaveBeenCalledWith({ conversationId: "conv_1", messageId: "msg_1" });
    expect(sentBodies()).toEqual(["Halo kak, mau desain apa?"]);
    expect(db.waMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ direction: "OUTBOUND", wamid: "wamid.OUT", sentByBot: true }),
    });
  });

  it.each(["admin", " ADMIN ", "cs", "Cs"])("kata kunci %j → mode HUMAN tanpa AI", async (body) => {
    givenMessage("text", body);
    await handleInboundMessage("msg_1");
    expect(humanModeSet()).toBe(true);
    expect(sentBodies()).toEqual([BOT_REPLIES.handoff]);
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("kalimat yang memuat kata admin tetap ke AI", async () => {
    givenMessage("text", "admin nya ada?");
    await handleInboundMessage("msg_1");
    expect(ai.runAiTurn).toHaveBeenCalled();
  });

  it("tipe tidak didukung → balasan standar tanpa AI", async () => {
    givenMessage("unsupported", "");
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.unsupported]);
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("gambar valid → disimpan lalu AI", async () => {
    givenMessage("image", "");
    media.storeInboundMedia.mockResolvedValue({ ok: true, media: {} });
    await handleInboundMessage("msg_1");
    expect(media.storeInboundMedia).toHaveBeenCalledWith("msg_1");
    expect(ai.runAiTurn).toHaveBeenCalled();
  });

  it.each(["MEDIA_TOO_LARGE", "MEDIA_TYPE_NOT_ALLOWED"] as const)("gambar ditolak (%s) → alasan, tanpa AI", async (reason) => {
    givenMessage("image", "");
    media.storeInboundMedia.mockResolvedValue({ ok: false, reason });
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES[reason]]);
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("sudah ada pesan masuk yang lebih baru → dilewati (gambar tetap disimpan)", async () => {
    givenMessage("image", "");
    media.storeInboundMedia.mockResolvedValue({ ok: true, media: {} });
    db.waMessage.count.mockResolvedValue(1);
    await handleInboundMessage("msg_1");
    expect(media.storeInboundMedia).toHaveBeenCalled();
    expect(ai.runAiTurn).not.toHaveBeenCalled();
    expect(api.sendText).not.toHaveBeenCalled();
  });

  it("pesan baru masuk selama AI berpikir → balasan tidak dikirim", async () => {
    givenMessage("text");
    db.waMessage.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await handleInboundMessage("msg_1");
    expect(ai.runAiTurn).toHaveBeenCalled();
    expect(api.sendText).not.toHaveBeenCalled();
  });

  it("AI error → balasan sibuk + mode HUMAN, log tanpa nomor utuh", async () => {
    givenMessage("text");
    ai.runAiTurn.mockRejectedValue(new Error("boom: isi chat rahasia"));
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.busy]);
    expect(humanModeSet()).toBe(true);
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("6281234567890");
    expect(logged).not.toContain("rahasia");
  });

  it("balasan AI kosong → balasan sibuk + mode HUMAN", async () => {
    givenMessage("text");
    aiReply(null);
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.busy]);
    expect(humanModeSet()).toBe(true);
  });

  it("sebelum ada harga: kalimat yang menyebut harga dibuang", async () => {
    givenMessage("text");
    aiReply("Siap kak. Harga logo biasanya Rp500.000 ya. Boleh tahu nama brandnya?", "COLLECTING");
    await handleInboundMessage("msg_1");
    const [sent] = sentBodies();
    expect(sent).not.toMatch(/500/);
    expect(sent).toContain("Boleh tahu nama brandnya?");
    expect(sent).toContain(PRICE_PLACEHOLDER);
  });

  it("belum ada order sama sekali juga dijaga", async () => {
    givenMessage("text");
    aiReply("Pengerjaan logo selesai dalam 3 hari kak.", null);
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([PRICE_PLACEHOLDER]);
  });

  it("setelah QUOTED: angka dari STATE boleh disebut", async () => {
    givenMessage("text");
    const reply = "Harga Rp2.500.000, DP Rp1.250.000 ya kak.";
    aiReply(reply, "QUOTED");
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([reply]);
  });

  it("gagal kirim → OUTBOUND failed dengan errorCode", async () => {
    givenMessage("text");
    api.sendText.mockRejectedValue(new WhatsAppApiError(400, "131047"));
    await handleInboundMessage("msg_1");
    const data = db.waMessage.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ direction: "OUTBOUND", deliveryStatus: "failed", errorCode: "131047" });
    expect(data.wamid).toBeUndefined();
  });
});
