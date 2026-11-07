import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ studioSettings: { findUnique: vi.fn() } }));
const channel = vi.hoisted(() => ({ getChannel: vi.fn() }));
const inbound = vi.hoisted(() => ({ storeInboundMessage: vi.fn() }));
const bot = vi.hoisted(() => ({ handleInboundMessage: vi.fn() }));
const afterFns = vi.hoisted(() => [] as (() => Promise<void>)[]);

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/storage", () => ({ getClient: () => ({}) }));
vi.mock("@/lib/whatsapp/channel", () => channel);
vi.mock("@/lib/whatsapp/inbound", () => inbound);
vi.mock("@/lib/whatsapp/bot", () => bot);
vi.mock("@/lib/whatsapp/owner/queries", () => ({ expireOwnerQueries: vi.fn(async () => 0) }));
vi.mock("@/lib/whatsapp/spam-guard", () => ({ waitForBurst: vi.fn(async () => undefined) }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => Promise<void>) => afterFns.push(fn),
}));

import { POST } from "./route";

const SECRET = "s".repeat(48);
const ctx = (secret = SECRET) => ({ params: Promise.resolve({ secret }) });
const req = (body: unknown, headers: Record<string, string> = { "x-kirimi-event": "message" }) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });

beforeEach(() => {
  vi.clearAllMocks();
  afterFns.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  process.env.KIRIMI_USER_CODE = "UC";
  process.env.KIRIMI_SECRET = "SC";
  process.env.KIRIMI_DEVICE_ID = "D-1";
  process.env.KIRIMI_WEBHOOK_SECRET = SECRET;
  channel.getChannel.mockResolvedValue("KIRIMI");
  db.studioSettings.findUnique.mockResolvedValue({ waKirimiWebhookSecret: null });
  inbound.storeInboundMessage.mockResolvedValue("msg_1");
});

describe("POST /api/whatsapp/kirimi/[secret]", () => {
  it("secret salah → 404", async () => {
    expect((await POST(req({}), ctx("salah"))).status).toBe(404);
  });

  it("pesan valid → disimpan, bot dijalankan setelah respons; log bentuk tanpa isi", async () => {
    const res = await POST(req({ device_id: "D-1", from: "6281234567890", message: "rahasia klien", id: "A1" }), ctx());
    expect(res.status).toBe(200);
    expect(inbound.storeInboundMessage).toHaveBeenCalledWith(expect.objectContaining({ wamid: "kirimi:in:A1", waId: "6281234567890" }));
    await afterFns[0]();
    expect(bot.handleInboundMessage).toHaveBeenCalledWith("msg_1");
    const logged = vi.mocked(console.info).mock.calls.flat().join(" ");
    expect(logged).not.toContain("rahasia");
    expect(logged).not.toContain("6281234567890");
  });

  it("saluran aktif bukan Kirimi → diabaikan, tetap dicatat bentuknya", async () => {
    channel.getChannel.mockResolvedValue("FONNTE");
    const res = await POST(req({ from: "6281234567890", message: "x" }), ctx());
    expect(await res.json()).toEqual({ ok: true, ignored: "channel" });
    expect(console.info).toHaveBeenCalled();
    expect(inbound.storeInboundMessage).not.toHaveBeenCalled();
  });

  it("device_id lain → diabaikan", async () => {
    const res = await POST(req({ device_id: "D-9", from: "6281234567890", message: "x" }), ctx());
    expect(await res.json()).toEqual({ ok: true, ignored: "device" });
  });

  it("status kirim (message.sent) tidak diproses sebagai pesan masuk", async () => {
    const res = await POST(req({ from: "6281234567890", message: "x" }, { "x-kirimi-event": "message.sent" }), ctx());
    expect(await res.json()).toEqual({ ok: true, ignored: "not_message_event" });
  });

  it("kredensial belum ada → 503", async () => {
    delete process.env.KIRIMI_SECRET;
    expect((await POST(req({}), ctx())).status).toBe(503);
  });
});
