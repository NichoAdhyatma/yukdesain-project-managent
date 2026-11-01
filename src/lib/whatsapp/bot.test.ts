import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waMessage: { findUniqueOrThrow: vi.fn(), create: vi.fn() },
  studioSettings: { findUnique: vi.fn() },
}));
const api = vi.hoisted(() => ({ sendText: vi.fn(), markAsRead: vi.fn() }));
const media = vi.hoisted(() => ({ storeInboundMedia: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./client-api", async (orig) => ({
  ...(await orig<typeof import("./client-api")>()),
  sendText: api.sendText,
  markAsRead: api.markAsRead,
}));
vi.mock("./media", () => media);

import { WhatsAppApiError } from "./client-api";
import { BOT_REPLIES, handleInboundMessage } from "./bot";

const conversation = { id: "conv_1", waId: "6281234567890", mode: "BOT" };

function givenMessage(type: string, mode = "BOT") {
  db.waMessage.findUniqueOrThrow.mockResolvedValue({
    id: "msg_1",
    wamid: "wamid.IN",
    type,
    conversation: { ...conversation, mode },
  });
}

const sentBodies = () => api.sendText.mock.calls.map(([, body]) => body);

describe("handleInboundMessage (balasan statis)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: true });
    api.sendText.mockResolvedValue("wamid.OUT");
    api.markAsRead.mockResolvedValue(undefined);
  });

  it("bot nonaktif → tidak membalas", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: false });
    givenMessage("text");
    await handleInboundMessage("msg_1");
    expect(api.sendText).not.toHaveBeenCalled();
    expect(api.markAsRead).not.toHaveBeenCalled();
  });

  it("settings belum ada → dianggap nonaktif", async () => {
    db.studioSettings.findUnique.mockResolvedValue(null);
    givenMessage("text");
    await handleInboundMessage("msg_1");
    expect(api.sendText).not.toHaveBeenCalled();
  });

  it("mode HUMAN → tidak membalas", async () => {
    givenMessage("text", "HUMAN");
    await handleInboundMessage("msg_1");
    expect(api.sendText).not.toHaveBeenCalled();
  });

  it("teks → tandai dibaca, balas, simpan OUTBOUND", async () => {
    givenMessage("text");
    await handleInboundMessage("msg_1");
    expect(api.markAsRead).toHaveBeenCalledWith("wamid.IN");
    expect(sentBodies()).toEqual([BOT_REPLIES.received]);
    expect(db.waMessage.create).toHaveBeenCalledWith({
      data: {
        conversationId: "conv_1",
        wamid: "wamid.OUT",
        direction: "OUTBOUND",
        body: BOT_REPLIES.received,
        sentByBot: true,
        deliveryStatus: "sent",
      },
    });
  });

  it("gagal tandai dibaca tidak menghentikan balasan", async () => {
    api.markAsRead.mockRejectedValue(new Error("x"));
    givenMessage("text");
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.received]);
  });

  it("tipe tidak didukung → balasan standar", async () => {
    givenMessage("unsupported");
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.unsupported]);
    expect(media.storeInboundMedia).not.toHaveBeenCalled();
  });

  it("gambar valid → disimpan lalu dibalas", async () => {
    givenMessage("image");
    media.storeInboundMedia.mockResolvedValue({ ok: true, media: {} });
    await handleInboundMessage("msg_1");
    expect(media.storeInboundMedia).toHaveBeenCalledWith("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.received]);
  });

  it.each(["MEDIA_TOO_LARGE", "MEDIA_TYPE_NOT_ALLOWED"] as const)("gambar ditolak (%s) → alasan", async (reason) => {
    givenMessage("image");
    media.storeInboundMedia.mockResolvedValue({ ok: false, reason });
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES[reason]]);
  });

  it("gagal kirim → OUTBOUND tersimpan dengan errorCode, log tanpa nomor utuh", async () => {
    givenMessage("text");
    api.sendText.mockRejectedValue(new WhatsAppApiError(400, "131047"));
    await handleInboundMessage("msg_1");
    const data = db.waMessage.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ direction: "OUTBOUND", deliveryStatus: "failed", errorCode: "131047" });
    expect(data.wamid).toBeUndefined();
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("6281234567890");
    expect(logged).toContain("6281****7890");
  });
});
