import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const d = {
    studioSettings: { findUnique: vi.fn(), update: vi.fn() },
    waConversation: { findMany: vi.fn(), updateMany: vi.fn() },
    waMessage: { groupBy: vi.fn() },
    activityLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  d.$transaction.mockImplementation(async (fn: (tx: typeof d) => unknown) => fn(d));
  return d;
});
const channel = vi.hoisted(() => ({ getChannel: vi.fn() }));
const kirimi = vi.hoisted(() => ({ kirimiDeviceStatus: vi.fn() }));
const guide = vi.hoisted(() => ({ getPublishedGuide: vi.fn(), getDraftGuide: vi.fn(), sameGuide: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./channel", () => channel);
vi.mock("./kirimi", () => kirimi);
vi.mock("./env", () => ({ isKirimiConfigured: () => true }));
vi.mock("./ai/bot-guide", () => guide);

import { getResponderStatus, switchResponder } from "./responder";

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  channel.getChannel.mockResolvedValue("KIRIMI");
  kirimi.kirimiDeviceStatus.mockResolvedValue({ aiEnabled: false });
  db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: false });
  db.waConversation.updateMany.mockResolvedValue({ count: 2 });
  guide.getPublishedGuide.mockResolvedValue({ version: 25, guide: {} });
  guide.getDraftGuide.mockResolvedValue({});
  guide.sameGuide.mockReturnValue(false);
});

describe("getResponderStatus", () => {
  it("status penjawab, AI Kirimi, Panduan, dan chat mode admin dengan tanda balasan HP saja", async () => {
    db.waConversation.findMany.mockResolvedValue([
      { id: "c1", waId: "6281234567890", profileName: "Sari", client: null, lastInboundAt: new Date("2026-11-10T00:00:00Z"), messages: [{ body: "kak harga logo?", direction: "INBOUND", createdAt: new Date("2026-11-10T00:00:00Z") }] },
      { id: "c2", waId: "6289876543210", profileName: null, client: { name: "Budi" }, lastInboundAt: null, messages: [] },
      { id: "c3", waId: "6281111222233", profileName: "Ani", client: null, lastInboundAt: null, messages: [] },
    ]);
    db.waMessage.groupBy
      .mockResolvedValueOnce([{ conversationId: "c1", _count: { _all: 3 } }, { conversationId: "c2", _count: { _all: 1 } }]) // balasan dari HP
      .mockResolvedValueOnce([{ conversationId: "c2", _count: { _all: 1 } }]); // balasan admin dari portal

    const s = await getResponderStatus();
    expect(s).toMatchObject({ botEnabled: false, channel: "KIRIMI", kirimiAi: "off", publishedVersion: 25, draftDiffers: true });
    expect(db.waConversation.findMany.mock.calls[0][0].where).toEqual({ mode: "HUMAN", isSandbox: false, blockedAt: null });
    expect(s.humanChats).toEqual([
      expect.objectContaining({ id: "c1", name: "Sari", phone: "6281****7890", preview: "kak harga logo?", onlyPhoneReplies: true }),
      expect.objectContaining({ id: "c2", name: "Budi", onlyPhoneReplies: false }),
      expect.objectContaining({ id: "c3", name: "Ani", onlyPhoneReplies: false }),
    ]);
    expect(JSON.stringify(s)).not.toContain("6281234567890");
  });

  it("status AI Kirimi: aktif / tidak terbaca / bukan saluran Kirimi", async () => {
    db.waConversation.findMany.mockResolvedValue([]);
    db.waMessage.groupBy.mockResolvedValue([]);
    kirimi.kirimiDeviceStatus.mockResolvedValue({ aiEnabled: true });
    expect((await getResponderStatus()).kirimiAi).toBe("on");
    kirimi.kirimiDeviceStatus.mockRejectedValue(new Error("timeout"));
    expect((await getResponderStatus()).kirimiAi).toBe("unknown");
    channel.getChannel.mockResolvedValue("META");
    expect((await getResponderStatus()).kirimiAi).toBe("not_kirimi");
  });
});

describe("switchResponder", () => {
  it("ke bot portal ditolak selama AI Kirimi aktif; tidak ada yang diubah", async () => {
    kirimi.kirimiDeviceStatus.mockResolvedValue({ aiEnabled: true });
    expect(await switchResponder({ to: "PORTAL", returnConversationIds: ["c1"] }, "u_owner")).toEqual({ ok: false, error: "KIRIMI_AI_ON" });
    expect(db.studioSettings.update).not.toHaveBeenCalled();
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
  });

  it("status AI Kirimi tidak terbaca: wajib konfirmasi manual", async () => {
    kirimi.kirimiDeviceStatus.mockRejectedValue(new Error("timeout"));
    expect(await switchResponder({ to: "PORTAL", returnConversationIds: [] }, "u_owner")).toEqual({ ok: false, error: "KIRIMI_UNCONFIRMED" });
    expect(await switchResponder({ to: "PORTAL", returnConversationIds: [], kirimiOffConfirmed: true }, "u_owner")).toMatchObject({ ok: true });
  });

  it("ke bot portal: hanya chat terpilih yang masih mode admin kembali ke bot, balas otomatis menyala, tercatat", async () => {
    db.waConversation.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    const r = await switchResponder({ to: "PORTAL", returnConversationIds: ["c1", "c2"] }, "u_owner");
    expect(r).toEqual({ ok: true, botEnabled: true, returned: 2 });
    expect(db.waConversation.findMany).toHaveBeenCalled();
    expect(db.waConversation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["c1", "c2"] }, mode: "HUMAN", isSandbox: false },
      data: { mode: "BOT" },
    });
    expect(db.studioSettings.update).toHaveBeenCalledWith({ where: { id: "default" }, data: { waBotEnabled: true } });
    const actions = db.activityLog.create.mock.calls.map((c) => c[0].data.action);
    expect(actions).toContain("WA_RESPONDER_SWITCHED");
    expect(actions.filter((a) => a === "WA_CHAT_RETURNED_TO_BOT")).toHaveLength(2);
  });

  it("ke Agen Kirimi: balas otomatis portal dimatikan, chat tidak diubah", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: true });
    const r = await switchResponder({ to: "KIRIMI" }, "u_owner");
    expect(r).toEqual({ ok: true, botEnabled: false, returned: 0 });
    expect(db.studioSettings.update).toHaveBeenCalledWith({ where: { id: "default" }, data: { waBotEnabled: false } });
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
    expect(kirimi.kirimiDeviceStatus).not.toHaveBeenCalled();
  });
});
