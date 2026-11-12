import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  studioSettings: { findUnique: vi.fn() },
  waConversation: { findUnique: vi.fn() },
  waMessage: { findFirst: vi.fn() },
}));
const botReply = vi.hoisted(() => ({ replyWithAi: vi.fn() }));
const media = vi.hoisted(() => ({ storeInboundMedia: vi.fn() }));
const owners = vi.hoisted(() => ({ listOwnerNumbers: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./bot-reply", () => botReply);
vi.mock("./media", () => media);
vi.mock("./owner/identity", () => owners);

import { replyPendingAfterReturn } from "./resume-after-return";

const now = new Date("2026-11-12T15:15:51Z"); // 22:15 WIB
const conv = { id: "conv_h", waId: "6282300009821", isSandbox: false, mode: "BOT", blockedAt: null, ownerActsAsClient: false };
const pending = { id: "m_q", direction: "INBOUND", type: "text", mediaStorageKey: null, createdAt: new Date("2026-11-12T14:52:27Z") };

beforeEach(() => {
  vi.resetAllMocks();
  db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: true });
  db.waConversation.findUnique.mockResolvedValue(conv);
  db.waMessage.findFirst.mockResolvedValue(pending);
  owners.listOwnerNumbers.mockResolvedValue([{ waNumber: "6289700006937" }]);
  botReply.replyWithAi.mockResolvedValue(true);
});

// Produksi 12 Nov (hastalinuwih): chat dikembalikan ke bot 22:15, pertanyaan klien 21:52 tetap tidak dijawab.
describe("replyPendingAfterReturn", () => {
  it("pesan terakhir dari klien dan belum dibalas → bot menjawabnya", async () => {
    expect(await replyPendingAfterReturn("conv_h", now)).toBe("replied");
    expect(botReply.replyWithAi).toHaveBeenCalledWith(
      { id: "conv_h", waId: "6282300009821", isSandbox: false },
      { id: "m_q", createdAt: pending.createdAt },
      { checkSuperseded: true },
    );
    expect(db.waMessage.findFirst.mock.calls[0][0]).toMatchObject({
      where: { conversationId: "conv_h", NOT: { direction: "OUTBOUND", deliveryStatus: "failed" } },
      orderBy: { createdAt: "desc" },
    });
  });

  it("pesan terakhir sudah dibalas (admin/bot) → tidak ada balasan", async () => {
    db.waMessage.findFirst.mockResolvedValue({ ...pending, direction: "OUTBOUND" });
    expect(await replyPendingAfterReturn("conv_h", now)).toBe("nothing_pending");
    expect(botReply.replyWithAi).not.toHaveBeenCalled();
  });

  it("pesan klien lebih dari 24 jam lalu → tidak dibalas otomatis", async () => {
    db.waMessage.findFirst.mockResolvedValue({ ...pending, createdAt: new Date(now.getTime() - 25 * 3_600_000) });
    expect(await replyPendingAfterReturn("conv_h", now)).toBe("nothing_pending");
  });

  it("bot nonaktif, chat diblokir, masih mode admin, atau nomor owner → tidak dibalas", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: false });
    expect(await replyPendingAfterReturn("conv_h", now)).toBe("skipped");
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: true });
    db.waConversation.findUnique.mockResolvedValue({ ...conv, blockedAt: new Date() });
    expect(await replyPendingAfterReturn("conv_h", now)).toBe("skipped");
    db.waConversation.findUnique.mockResolvedValue({ ...conv, mode: "HUMAN" });
    expect(await replyPendingAfterReturn("conv_h", now)).toBe("skipped");
    db.waConversation.findUnique.mockResolvedValue({ ...conv, waId: "6289700006937" });
    expect(await replyPendingAfterReturn("conv_h", now)).toBe("skipped");
    expect(botReply.replyWithAi).not.toHaveBeenCalled();
  });

  it("gambar klien yang masuk saat mode admin disimpan dulu supaya bisa dilihat AI", async () => {
    db.waMessage.findFirst.mockResolvedValue({ ...pending, type: "image" });
    media.storeInboundMedia.mockResolvedValue({ ok: true });
    await replyPendingAfterReturn("conv_h", now);
    expect(media.storeInboundMedia).toHaveBeenCalledWith("m_q");
    expect(botReply.replyWithAi).toHaveBeenCalled();
  });
});
