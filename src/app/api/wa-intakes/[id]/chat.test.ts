import { beforeEach, describe, expect, it, vi } from "vitest";

// Balasan manual admin + ambil alih / kembalikan ke bot.
const db = vi.hoisted(() => {
  const d = {
    waIntake: { findUnique: vi.fn() },
    waConversation: { updateMany: vi.fn() },
    activityLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return d;
});
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const outbound = vi.hoisted(() => ({ sendManualReply: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/whatsapp/outbound", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/outbound")>()),
  sendManualReply: outbound.sendManualReply,
}));
vi.mock("@/lib/whatsapp/intake-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/intake-api")>()),
  findIntakeForDetail: async () => null,
}));

import { POST as sendMessage } from "./messages/route";
import { POST as setMode } from "./mode/route";

const owner = { id: "u_owner", roles: ["OWNER"] };
const ctx = { params: Promise.resolve({ id: "in_1" }) };
const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const HOUR = 60 * 60 * 1000;

function conversation(mode: "BOT" | "HUMAN", hoursSinceInbound: number | null = 1) {
  db.waIntake.findUnique.mockResolvedValue({
    conversationId: "conv_1",
    conversation: {
      id: "conv_1",
      waId: "6281234567890",
      mode,
      lastInboundAt: hoursSinceInbound === null ? null : new Date(Date.now() - hoursSinceInbound * HOUR),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(owner);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.waConversation.updateMany.mockResolvedValue({ count: 1 });
  outbound.sendManualReply.mockResolvedValue({ ok: true, via: "text", messageId: "out_1" });
});

describe("POST messages", () => {
  it("bukan owner → 403, tidak mengirim", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await sendMessage(req({ text: "Halo" }), ctx)).status).toBe(403);
    expect(db.waIntake.findUnique).not.toHaveBeenCalled();
    expect(outbound.sendManualReply).not.toHaveBeenCalled();
  });

  it("tanpa sesi → 401", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    expect((await sendMessage(req({ text: "Halo" }), ctx)).status).toBe(401);
  });

  it.each([[{ text: "   " }], [{ text: "a".repeat(4097) }], [{}]])("input %j → 400", async (body) => {
    conversation("HUMAN");
    const res = await sendMessage(req(body), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("VALIDATION_ERROR");
    expect(outbound.sendManualReply).not.toHaveBeenCalled();
  });

  it("order tidak ada → 404", async () => {
    db.waIntake.findUnique.mockResolvedValue(null);
    expect((await sendMessage(req({ text: "Halo" }), ctx)).status).toBe(404);
  });

  it("mode BOT → 409, bot dan admin tidak membalas bersamaan", async () => {
    conversation("BOT");
    const res = await sendMessage(req({ text: "Halo" }), ctx);
    expect(res.status).toBe(409);
    expect(outbound.sendManualReply).not.toHaveBeenCalled();
  });

  it.each([[25], [null]])("di luar 24 jam (%s jam) → 422, tidak mengirim", async (hours) => {
    conversation("HUMAN", hours);
    const res = await sendMessage(req({ text: "Halo" }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("UNPROCESSABLE_ENTITY");
    expect(outbound.sendManualReply).not.toHaveBeenCalled();
  });

  it("mode HUMAN dalam 24 jam → teks (di-trim) terkirim atas nama admin + ActivityLog tanpa isi pesan", async () => {
    conversation("HUMAN");
    const res = await sendMessage(req({ text: "  Halo kak, harga final Rp500.000 ya  " }), ctx);
    expect(res.status).toBe(200);
    expect(outbound.sendManualReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conv_1", waId: "6281234567890" }),
      "Halo kak, harga final Rp500.000 ya",
      "u_owner",
    );
    const log = db.activityLog.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ entityType: "WaIntake", entityId: "in_1", action: "WA_MANUAL_REPLY", actorId: "u_owner" });
    expect(JSON.stringify(log)).not.toContain("Halo");
    expect(await res.json()).toMatchObject({ delivery: { ok: true } });
  });

  it("gagal terkirim → 200 dengan delivery.ok false (pesan gagal tersimpan, tampil di chat)", async () => {
    conversation("HUMAN");
    outbound.sendManualReply.mockResolvedValue({ ok: false, via: "text", errorCode: "131047", messageId: "out_2" });
    const res = await sendMessage(req({ text: "Halo" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ delivery: { ok: false, errorCode: "131047" } });
    expect(db.activityLog.create.mock.calls[0][0].data.newValue).toEqual({ messageId: "out_2", ok: false, errorCode: "131047" });
  });
});

describe("POST mode", () => {
  it("bukan owner → 403", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await setMode(req({ mode: "BOT" }), ctx)).status).toBe(403);
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
  });

  it("mode tidak dikenal → 400", async () => {
    conversation("HUMAN");
    expect((await setMode(req({ mode: "AUTO" }), ctx)).status).toBe(400);
  });

  it("kembalikan ke bot: where memakai mode lama, tercatat di ActivityLog", async () => {
    conversation("HUMAN");
    const res = await setMode(req({ mode: "BOT" }), ctx);
    expect(res.status).toBe(200);
    expect(db.waConversation.updateMany).toHaveBeenCalledWith({ where: { id: "conv_1", mode: "HUMAN" }, data: { mode: "BOT" } });
    expect(db.activityLog.create.mock.calls[0][0].data).toMatchObject({
      entityType: "WaIntake",
      action: "WA_CHAT_RETURNED_TO_BOT",
      previousValue: { mode: "HUMAN" },
      newValue: { mode: "BOT" },
    });
  });

  it("ambil alih: BOT → HUMAN", async () => {
    conversation("BOT");
    expect((await setMode(req({ mode: "HUMAN" }), ctx)).status).toBe(200);
    expect(db.waConversation.updateMany).toHaveBeenCalledWith({ where: { id: "conv_1", mode: "BOT" }, data: { mode: "HUMAN" } });
    expect(db.activityLog.create.mock.calls[0][0].data.action).toBe("WA_CHAT_TAKEN_OVER");
  });

  it("mode sudah berubah (klik ganda) → 409, tidak ada log", async () => {
    conversation("BOT");
    db.waConversation.updateMany.mockResolvedValue({ count: 0 });
    expect((await setMode(req({ mode: "BOT" }), ctx)).status).toBe(409);
    expect(db.activityLog.create).not.toHaveBeenCalled();
  });

  it("order tidak ada → 404", async () => {
    db.waIntake.findUnique.mockResolvedValue(null);
    expect((await setMode(req({ mode: "BOT" }), ctx)).status).toBe(404);
  });
});
