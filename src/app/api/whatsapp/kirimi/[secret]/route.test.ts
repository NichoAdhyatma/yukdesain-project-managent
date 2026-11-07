import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { createHmac } from "node:crypto";
import { GET, POST } from "./route";

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

  it("tes URL dari dashboard: body kosong dan GET dijawab 200 (secret tetap dicek)", async () => {
    const empty = await POST(new Request("http://x", { method: "POST", body: "" }), ctx());
    expect(await empty.json()).toEqual({ ok: true, ignored: "no_body" });
    expect((await GET(new Request("http://x"), ctx())).status).toBe(200);
    expect((await GET(new Request("http://x"), ctx("salah"))).status).toBe(404);
  });

  describe("signing secret tersimpan → signature wajib", () => {
    const raw = JSON.stringify({ event: "message", deviceId: "D-1", from: "6281234567890", message: "x", msgId: "M1" });
    const ts = "1793700000";
    const signed = (sig: string | null) =>
      new Request("http://x", {
        method: "POST",
        body: raw,
        headers: { "content-type": "application/json", "x-kirimi-timestamp": ts, ...(sig ? { "x-kirimi-signature": sig } : {}) },
      });
    beforeEach(() => {
      process.env.KIRIMI_SIGNING_SECRET = "dashboard-secret";
    });
    afterEach(() => {
      delete process.env.KIRIMI_SIGNING_SECRET;
    });

    it("HMAC-SHA256 hex dari timestamp.body → diproses", async () => {
      const sig = createHmac("sha256", "dashboard-secret").update(`${ts}.${raw}`).digest("hex");
      expect((await POST(signed(sig), ctx())).status).toBe(200);
      expect(inbound.storeInboundMessage).toHaveBeenCalled();
    });

    it("signature salah atau tidak ada → 401, tidak disimpan", async () => {
      expect((await POST(signed("deadbeef"), ctx())).status).toBe(401);
      expect((await POST(signed(null), ctx())).status).toBe(401);
      expect(inbound.storeInboundMessage).not.toHaveBeenCalled();
    });

    it("tes URL dashboard (webhook.test) tanpa signature tetap 200, tidak diproses", async () => {
      const res = await POST(req({ event: "webhook.test", test: true, device_id: "D-1" }, {}), ctx());
      expect(await res.json()).toEqual({ ok: true, ignored: "test" });
      expect(inbound.storeInboundMessage).not.toHaveBeenCalled();
    });
  });
});
