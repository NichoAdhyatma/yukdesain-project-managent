import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ studioSettings: { findUnique: vi.fn() } }));
const env = vi.hoisted(() => ({ getFonnteEnv: vi.fn() }));
const channel = vi.hoisted(() => ({ getChannel: vi.fn() }));
const inbound = vi.hoisted(() => ({ storeInboundMessage: vi.fn() }));
const bot = vi.hoisted(() => ({ handleInboundMessage: vi.fn() }));
const afterFns = vi.hoisted(() => [] as (() => Promise<void>)[]);

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/storage", () => ({ getClient: () => ({}) }));
vi.mock("@/lib/whatsapp/env", async (orig) => ({ ...(await orig<typeof import("@/lib/whatsapp/env")>()), ...env }));
vi.mock("@/lib/whatsapp/channel", () => channel);
vi.mock("@/lib/whatsapp/inbound", () => inbound);
vi.mock("@/lib/whatsapp/bot", () => bot);
vi.mock("@/lib/whatsapp/owner/queries", () => ({ expireOwnerQueries: vi.fn(async () => 0) }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => Promise<void>) => afterFns.push(fn),
}));

import { POST } from "./route";

const SECRET = "rahasia-webhook-fonnte-123";
const call = (secret: string, body: unknown) =>
  POST(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ secret }),
  });
const msg = { device: "6285100000000", sender: "6281234567890", message: "halo", inboxid: "1" };

beforeEach(() => {
  vi.clearAllMocks();
  afterFns.length = 0;
  env.getFonnteEnv.mockReturnValue({ FONNTE_DEVICE_TOKEN: "t", FONNTE_WEBHOOK_SECRET: SECRET });
  channel.getChannel.mockResolvedValue("FONNTE");
  db.studioSettings.findUnique.mockResolvedValue({ waFonnteDevice: "6285100000000" });
  inbound.storeInboundMessage.mockResolvedValue("m_1");
});

describe("POST /api/whatsapp/fonnte/[secret]", () => {
  it("secret salah → 404, tidak menyimpan", async () => {
    expect((await call("salah", msg)).status).toBe(404);
    expect(inbound.storeInboundMessage).not.toHaveBeenCalled();
  });

  it("env Fonnte belum ada → 503", async () => {
    env.getFonnteEnv.mockImplementation(() => {
      throw new Error("x");
    });
    expect((await call(SECRET, msg)).status).toBe(503);
  });

  it("pesan valid → disimpan, bot dijalankan setelah respons", async () => {
    const res = await call(SECRET, msg);
    expect(res.status).toBe(200);
    expect(inbound.storeInboundMessage.mock.calls[0][0]).toMatchObject({ waId: "6281234567890", type: "text", body: "halo" });
    expect(bot.handleInboundMessage).not.toHaveBeenCalled();
    for (const fn of afterFns) await fn();
    expect(bot.handleInboundMessage).toHaveBeenCalledWith("m_1");
  });

  it("saluran aktif Meta → diabaikan", async () => {
    channel.getChannel.mockResolvedValue("META");
    expect((await (await call(SECRET, msg)).json()).ignored).toBe("channel");
    expect(inbound.storeInboundMessage).not.toHaveBeenCalled();
  });

  it("perangkat lain → diabaikan; grup → diabaikan", async () => {
    expect((await (await call(SECRET, { ...msg, device: "6289999999999" })).json()).ignored).toBe("device");
    expect((await (await call(SECRET, { ...msg, sender: "1203@g.us" })).json()).ignored).toBe("group");
    expect(inbound.storeInboundMessage).not.toHaveBeenCalled();
  });

  it("kiriman ulang (sudah tersimpan) → tidak memproses ulang", async () => {
    inbound.storeInboundMessage.mockResolvedValue(null);
    await call(SECRET, msg);
    expect(afterFns).toHaveLength(0);
  });
});
