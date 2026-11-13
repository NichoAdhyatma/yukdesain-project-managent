import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waOwnerQuery: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  waMessage: { findFirst: vi.fn(), count: vi.fn() },
  waConversation: { updateMany: vi.fn() },
}));
const botReply = vi.hoisted(() => ({ replyWithAi: vi.fn() }));
const handoff = vi.hoisted(() => ({ callAdmin: vi.fn() }));
vi.mock("../handoff", () => handoff);
const channel = vi.hoisted(() => ({ getChannel: vi.fn(), usesServiceWindow: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("../bot-reply", () => botReply);
vi.mock("../channel", () => channel);

import { expireOwnerQueries, relayOwnerAnswer } from "./queries";

const HOUR = 3_600_000;
const query = (over: Record<string, unknown> = {}, conv: Record<string, unknown> = {}) => ({
  status: "ANSWERED",
  relayedAt: null,
  relayFailedAt: null,
  conversation: { id: "conv_c", waId: "6288123455389", profileName: "zidan", isSandbox: false, mode: "BOT", lastInboundAt: new Date(Date.now() - HOUR), ...conv },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  channel.getChannel.mockResolvedValue("KIRIMI");
  channel.usesServiceWindow.mockReturnValue(false);
  db.waMessage.findFirst.mockResolvedValue({ id: "m_last", createdAt: new Date() });
  db.waMessage.count.mockResolvedValue(0);
  db.waConversation.updateMany.mockResolvedValue({ count: 1 });
  botReply.replyWithAi.mockResolvedValue(true);
});

describe("relayOwnerAnswer: hasil nyata untuk dilaporkan ke owner", () => {
  it("terkirim → sent, dengan label klien tersamar", async () => {
    db.waOwnerQuery.findUnique.mockResolvedValue(query());
    expect(await relayOwnerAnswer("q_1")).toEqual({ outcome: "sent", clientLabel: "zidan (6288****5389)" });
  });

  it("diteruskan tanpa pesan sibuk ke klien bila gagal (owner yang menerima laporan)", async () => {
    db.waOwnerQuery.findUnique.mockResolvedValue(query());
    await relayOwnerAnswer("q_1");
    expect(botReply.replyWithAi).toHaveBeenCalledWith(expect.anything(), expect.anything(), { checkSuperseded: false, notifyClient: false });
  });

  it("AI gagal saat meneruskan → failed, waktu gagal dicatat supaya bisa dikirim ulang", async () => {
    db.waOwnerQuery.findUnique.mockResolvedValue(query());
    botReply.replyWithAi.mockResolvedValue(false);
    expect(await relayOwnerAnswer("q_1")).toMatchObject({ outcome: "failed" });
    expect(db.waOwnerQuery.update).toHaveBeenCalledWith({ where: { id: "q_1" }, data: { relayFailedAt: expect.any(Date) } });
  });

  it("chat sedang ditangani admin → admin, tidak dikirim", async () => {
    db.waOwnerQuery.findUnique.mockResolvedValue(query({}, { mode: "HUMAN" }));
    expect(await relayOwnerAnswer("q_1")).toMatchObject({ outcome: "admin" });
    expect(botReply.replyWithAi).not.toHaveBeenCalled();
  });

  it("jendela 24 jam tutup → window_closed", async () => {
    channel.usesServiceWindow.mockReturnValue(true);
    db.waOwnerQuery.findUnique.mockResolvedValue(query({}, { lastInboundAt: new Date(Date.now() - 30 * HOUR) }));
    expect(await relayOwnerAnswer("q_1")).toMatchObject({ outcome: "window_closed" });
    // Keputusan owner 13 Nov: admin dipanggil, chat tidak dipindah ke mode admin.
    expect(handoff.callAdmin).toHaveBeenCalledWith("conv_c", "owner_timeout");
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
    expect(botReply.replyWithAi).not.toHaveBeenCalled();
  });

  it("sudah pernah terkirim → skipped", async () => {
    db.waOwnerQuery.findUnique.mockResolvedValue(query({ relayedAt: new Date() }));
    expect(await relayOwnerAnswer("q_1")).toMatchObject({ outcome: "skipped" });
  });

  describe("kirim ulang atas perintah owner (force)", () => {
    it("chat pindah ke admin karena kiriman sebelumnya gagal dan admin belum membalas → dikembalikan ke bot lalu dikirim", async () => {
      const failedAt = new Date(Date.now() - 10 * 60_000);
      db.waOwnerQuery.findUnique.mockResolvedValue(query({ relayFailedAt: failedAt }, { mode: "HUMAN" }));
      expect(await relayOwnerAnswer("q_1", { force: true })).toMatchObject({ outcome: "sent" });
      expect(db.waMessage.count.mock.calls[0][0].where).toMatchObject({ conversationId: "conv_c", direction: "OUTBOUND", createdAt: { gt: failedAt } });
      expect(db.waConversation.updateMany).toHaveBeenCalledWith({ where: { id: "conv_c", mode: "HUMAN" }, data: { mode: "BOT" } });
      expect(botReply.replyWithAi).toHaveBeenCalled();
    });

    it("admin sudah membalas sejak gagal → tetap admin, tidak dikembalikan ke bot", async () => {
      db.waOwnerQuery.findUnique.mockResolvedValue(query({ relayFailedAt: new Date(Date.now() - 60_000) }, { mode: "HUMAN" }));
      db.waMessage.count.mockResolvedValue(1);
      expect(await relayOwnerAnswer("q_1", { force: true })).toMatchObject({ outcome: "admin" });
      expect(db.waConversation.updateMany).not.toHaveBeenCalled();
    });

    it("tanpa riwayat gagal kirim, chat mode admin tidak disentuh walau force", async () => {
      db.waOwnerQuery.findUnique.mockResolvedValue(query({}, { mode: "HUMAN" }));
      expect(await relayOwnerAnswer("q_1", { force: true })).toMatchObject({ outcome: "admin" });
      expect(db.waConversation.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe("expireOwnerQueries (keputusan owner 13 Nov)", () => {
  it("pertanyaan kedaluwarsa: status EXPIRED, owner dipanggil, chat klien tidak dipindah ke admin", async () => {
    db.waOwnerQuery.findMany.mockResolvedValue([{ id: "q_old", conversationId: "conv_c", conversation: { isSandbox: false } }]);
    db.waOwnerQuery.updateMany.mockResolvedValue({ count: 1 });
    expect(await expireOwnerQueries(new Date())).toBe(1);
    expect(db.waOwnerQuery.updateMany).toHaveBeenCalledWith({ where: { id: "q_old", status: "PENDING" }, data: { status: "EXPIRED" } });
    expect(handoff.callAdmin).toHaveBeenCalledWith("conv_c", "owner_timeout");
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
  });
});
