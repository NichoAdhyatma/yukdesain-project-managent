import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  studioSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  activityLog: { create: vi.fn() },
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/whatsapp/env", () => ({
  isWhatsAppConfigured: () => true,
  getAiEnvDefaults: () => ({
    model: "claude-haiku-5-5",
    extractionModel: "claude-sonnet-5-5",
    baseUrl: "https://api.anthropic.com",
  }),
}));

vi.mock("@/lib/whatsapp/rate-limit", () => ({
  getMonthlyUsage: async () => ({ month: "2026-11", outboundSent: 820, outboundFailed: 1, templatesSent: 2, botReplies: 800, inbound: 900, warningThreshold: 800, freeTier: 1000, nearLimit: true }),
}));

import { GET, PUT } from "./route";

const owner = { id: "u_owner", roles: ["OWNER"] };
const put = (body: unknown) =>
  PUT(new Request("http://x/api/settings/whatsapp", { method: "PUT", body: JSON.stringify(body) }));
const row = { waBotEnabled: false, waAiModel: null, waAiExtractionModel: null, waAiBaseUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(owner);
  db.studioSettings.findUnique.mockResolvedValue(row);
  db.studioSettings.upsert.mockImplementation(async ({ update }) => ({ ...row, ...update }));
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
      ai: {
        model: null,
        defaults: { model: "claude-haiku-5-5", baseUrl: "https://api.anthropic.com" },
        effective: { model: "claude-haiku-5-5" },
        modelRecognized: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain("sk-ant");
    expect(body.usage).toMatchObject({ month: "2026-11", outboundSent: 820, nearLimit: true });
  });
});

describe("PUT /api/settings/whatsapp", () => {
  it("menyimpan override dan mencatat ActivityLog", async () => {
    const res = await put({
      aiModel: "claude-sonnet-4-6",
      aiBaseUrl: "https://gateway.olagon.site/anthropic/",
    });
    expect(res.status).toBe(200);
    expect(db.studioSettings.upsert.mock.calls[0][0].update).toEqual({
      waAiModel: "claude-sonnet-4-6",
      waAiBaseUrl: "https://gateway.olagon.site/anthropic",
    });
    expect(db.activityLog.create.mock.calls[0][0].data).toMatchObject({
      entityType: "StudioSettings",
      action: "WHATSAPP_SETTINGS_UPDATED",
      actorId: "u_owner",
    });
    expect((await res.json()).ai.effective.model).toBe("claude-sonnet-4-6");
  });

  it("string kosong → kembali ke default (null)", async () => {
    await put({ aiModel: "", aiBaseUrl: "" });
    expect(db.studioSettings.upsert.mock.calls[0][0].update).toEqual({ waAiModel: null, waAiBaseUrl: null });
  });

  it("base URL http → pesan https", async () => {
    const body = await (await put({ aiBaseUrl: "http://gateway.example" })).json();
    expect(body.fields.aiBaseUrl).toBe("Harus URL https");
  });

  it("toggle bot saja", async () => {
    await put({ botEnabled: true });
    expect(db.studioSettings.upsert.mock.calls[0][0].update).toEqual({ waBotEnabled: true });
  });

  it("validasi: model non-Claude & URL internal ditolak per field", async () => {
    const res = await put({ aiModel: "gpt-5.5", aiBaseUrl: "https://127.0.0.1/anthropic" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(Object.keys(body.fields).sort()).toEqual(["aiBaseUrl", "aiModel"]);
    expect(body.fields.aiBaseUrl).toBe("Alamat internal/lokal tidak diizinkan");
    expect(body.fields.aiModel).toMatch(/model Claude/);
    expect(db.studioSettings.upsert).not.toHaveBeenCalled();
  });

  it("bukan owner → 403 tanpa menyimpan", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await put({ botEnabled: true })).status).toBe(403);
    expect(db.studioSettings.upsert).not.toHaveBeenCalled();
  });
});
