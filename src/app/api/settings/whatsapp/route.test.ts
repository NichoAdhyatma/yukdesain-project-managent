import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  studioSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  activityLog: { create: vi.fn() },
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);
const keys = vi.hoisted(() => ({ ANTHROPIC: true, GATEWAY: true }));
vi.mock("@/lib/whatsapp/env", () => ({
  AI_PROVIDERS: ["ANTHROPIC", "GATEWAY"],
  isWhatsAppConfigured: () => true,
  isAiConfigured: (p: "ANTHROPIC" | "GATEWAY" = "ANTHROPIC") => keys[p],
  getProviderEnv: (p: "ANTHROPIC" | "GATEWAY") =>
    p === "GATEWAY"
      ? { provider: p, label: "Olagon gateway", baseUrl: "https://gateway.olagon.site/anthropic", apiKey: keys.GATEWAY ? "gw-secret" : null, defaultModel: "claude-sonnet-4-6", defaultExtractionModel: "claude-sonnet-4-6" }
      : { provider: p, label: "Anthropic (resmi)", baseUrl: "https://api.anthropic.com", apiKey: keys.ANTHROPIC ? "sk-ant-secret" : null, defaultModel: "claude-haiku-5-5", defaultExtractionModel: "claude-sonnet-5-5" },
}));

const channels = vi.hoisted(() => ({ META: true, FONNTE: true }));
vi.mock("@/lib/whatsapp/channel", () => ({
  WA_CHANNELS: ["META", "FONNTE"],
  isChannelConfigured: (c: "META" | "FONNTE") => channels[c],
}));

vi.mock("@/lib/whatsapp/rate-limit", () => ({
  getMonthlyUsage: async () => ({ month: "2026-11", outboundSent: 820, outboundFailed: 1, templatesSent: 2, botReplies: 800, inbound: 900, warningThreshold: 800, freeTier: 1000, nearLimit: true }),
}));

import { GET, PUT } from "./route";

const owner = { id: "u_owner", roles: ["OWNER"] };
const put = (body: unknown) =>
  PUT(new Request("http://x/api/settings/whatsapp", { method: "PUT", body: JSON.stringify(body) }));
const row = {
  waBotEnabled: false,
  waChannel: "META",
  waAiProvider: "ANTHROPIC",
  waAiModel: null,
  waAiExtractionModel: null,
  waAiGatewayModel: null,
  waAiGatewayExtractionModel: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(owner);
  db.studioSettings.findUnique.mockResolvedValue(row);
  db.studioSettings.upsert.mockImplementation(async ({ update }) => ({ ...row, ...update }));
  keys.ANTHROPIC = true;
  keys.GATEWAY = true;
  channels.META = true;
  channels.FONNTE = true;
});

describe("GET /api/settings/whatsapp", () => {
  it("tanpa login → 401, bukan owner → 403", async () => {
    session.getCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await GET()).status).toBe(403);
  });

  it("DTO berisi default env, tanpa API key", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body).toMatchObject({
      botEnabled: false,
      whatsappConfigured: true,
      aiConfigured: true,
      ai: {
        provider: "ANTHROPIC",
        effective: { label: "Anthropic (resmi)", model: "claude-haiku-5-5", baseUrlHost: "api.anthropic.com" },
        modelRecognized: true,
      },
    });
    expect(body.ai.providers.map((p: { id: string; configured: boolean }) => `${p.id}:${p.configured}`)).toEqual([
      "ANTHROPIC:true",
      "GATEWAY:true",
    ]);
    expect(JSON.stringify(body)).not.toContain("gw-secret");
    expect(JSON.stringify(body)).not.toContain("sk-ant");
    expect(body.usage).toMatchObject({ month: "2026-11", outboundSent: 820, nearLimit: true });
  });
});

describe("PUT /api/settings/whatsapp", () => {
  it("pindah ke gateway + model gateway, tercatat di ActivityLog", async () => {
    const res = await put({ aiProvider: "GATEWAY", aiGatewayModel: "claude-opus-4-8" });
    expect(res.status).toBe(200);
    expect(db.studioSettings.upsert.mock.calls[0][0].update).toEqual({ waAiProvider: "GATEWAY", waAiGatewayModel: "claude-opus-4-8" });
    expect(db.activityLog.create.mock.calls[0][0].data).toMatchObject({ action: "WHATSAPP_SETTINGS_UPDATED", actorId: "u_owner" });
    const body = await res.json();
    expect(body.ai.effective).toMatchObject({ label: "Olagon gateway", model: "claude-opus-4-8", baseUrlHost: "gateway.olagon.site" });
  });

  it("provider yang key-nya belum ada → 400, tidak disimpan", async () => {
    keys.GATEWAY = false;
    const res = await put({ aiProvider: "GATEWAY" });
    expect(res.status).toBe(400);
    expect((await res.json()).fields.aiProvider).toContain("Olagon gateway");
    expect(db.studioSettings.upsert).not.toHaveBeenCalled();
  });

  it("string kosong → kembali ke default (null)", async () => {
    await put({ aiModel: "", aiGatewayExtractionModel: "" });
    expect(db.studioSettings.upsert.mock.calls[0][0].update).toEqual({ waAiModel: null, waAiGatewayExtractionModel: null });
  });

  it("toggle bot saja", async () => {
    await put({ botEnabled: true });
    expect(db.studioSettings.upsert.mock.calls[0][0].update).toEqual({ waBotEnabled: true });
  });

  it("rem bulanan disimpan; di luar batas ditolak", async () => {
    await put({ monthlyReplyCap: 1500 });
    expect(db.studioSettings.upsert.mock.calls[0][0].update).toEqual({ waBotMonthlyReplyCap: 1500 });
    for (const bad of [10, 1.5, 200_000]) {
      db.studioSettings.upsert.mockClear();
      const res = await put({ monthlyReplyCap: bad });
      expect(res.status).toBe(400);
      expect(Object.keys((await res.json()).fields)).toEqual(["monthlyReplyCap"]);
      expect(db.studioSettings.upsert).not.toHaveBeenCalled();
    }
  });

  it("validasi: model non-Claude dan provider tidak dikenal ditolak per field", async () => {
    const res = await put({ aiModel: "gpt-5.5", aiProvider: "OPENAI" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(Object.keys(body.fields).sort()).toEqual(["aiModel", "aiProvider"]);
    expect(db.studioSettings.upsert).not.toHaveBeenCalled();
  });

  it("bukan owner → 403 tanpa menyimpan", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await put({ botEnabled: true })).status).toBe(403);
    expect(db.studioSettings.upsert).not.toHaveBeenCalled();
  });
});

describe("saluran WhatsApp (docs/WHATSAPP_CHANNEL_FONNTE.md)", () => {
  it("GET: saluran aktif dan status siap per saluran", async () => {
    channels.FONNTE = false;
    const body = await (await GET()).json();
    expect(body.channel.active).toBe("META");
    expect(body.channel.options.map((o: { id: string; configured: boolean }) => `${o.id}:${o.configured}`)).toEqual([
      "META:true",
      "FONNTE:false",
    ]);
    expect(body.whatsappConfigured).toBe(true);
  });

  it("PUT: pindah ke Fonnte disimpan", async () => {
    const res = await put({ channel: "FONNTE" });
    expect(res.status).toBe(200);
    expect(db.studioSettings.upsert.mock.calls[0][0].update).toEqual({ waChannel: "FONNTE" });
    expect((await res.json()).channel.active).toBe("FONNTE");
  });

  it("PUT: saluran yang env-nya belum lengkap ditolak", async () => {
    channels.FONNTE = false;
    const res = await put({ channel: "FONNTE" });
    expect(res.status).toBe(400);
    expect((await res.json()).fields.channel).toContain("FONNTE_DEVICE_TOKEN");
    expect(db.studioSettings.upsert).not.toHaveBeenCalled();
  });
});
