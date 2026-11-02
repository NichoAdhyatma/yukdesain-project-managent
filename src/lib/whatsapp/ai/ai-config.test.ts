import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ studioSettings: { findUnique: vi.fn() } }));
const env = vi.hoisted(() => ({
  ANTHROPIC_API_KEY: "sk-ant" as string | undefined,
  AI_GATEWAY_API_KEY: "gw-key" as string | undefined,
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("../env", () => ({
  getAiEnv: () => ({ WA_AI_MAX_TOKENS: 800 }),
  getProviderEnv: (provider: "ANTHROPIC" | "GATEWAY") =>
    provider === "GATEWAY"
      ? { provider, label: "Olagon gateway", baseUrl: "https://gateway.example/anthropic", apiKey: env.AI_GATEWAY_API_KEY ?? null, defaultModel: "claude-sonnet-4-6", defaultExtractionModel: "claude-sonnet-4-6" }
      : { provider, label: "Anthropic (resmi)", baseUrl: "https://api.anthropic.com", apiKey: env.ANTHROPIC_API_KEY ?? null, defaultModel: "claude-haiku-5-5", defaultExtractionModel: "claude-sonnet-5-5" },
}));

import { AiNotConfiguredError, aiModelSchema, getAiConfig, getAnthropicClient, isAiReady } from "./ai-config";

const row = (over: Record<string, unknown> = {}) => ({
  waAiProvider: "ANTHROPIC",
  waAiModel: null,
  waAiExtractionModel: null,
  waAiGatewayModel: null,
  waAiGatewayExtractionModel: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  env.ANTHROPIC_API_KEY = "sk-ant";
  env.AI_GATEWAY_API_KEY = "gw-key";
});

describe("getAiConfig", () => {
  it("tanpa settings → Anthropic resmi dengan default env", async () => {
    db.studioSettings.findUnique.mockResolvedValue(null);
    expect(await getAiConfig()).toEqual({
      provider: "ANTHROPIC",
      label: "Anthropic (resmi)",
      model: "claude-haiku-5-5",
      extractionModel: "claude-sonnet-5-5",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant",
      maxTokens: 800,
    });
  });

  it("provider GATEWAY: base URL, key, dan model gateway; model Anthropic tidak terbawa", async () => {
    db.studioSettings.findUnique.mockResolvedValue(row({ waAiProvider: "GATEWAY", waAiModel: "claude-opus-5-5", waAiGatewayModel: "claude-opus-4-8" }));
    expect(await getAiConfig()).toMatchObject({
      provider: "GATEWAY",
      baseUrl: "https://gateway.example/anthropic",
      apiKey: "gw-key",
      model: "claude-opus-4-8",
      extractionModel: "claude-sonnet-4-6",
    });
  });

  it("model pilihan owner untuk Anthropic menang atas default", async () => {
    db.studioSettings.findUnique.mockResolvedValue(row({ waAiModel: "claude-sonnet-5-5" }));
    expect((await getAiConfig()).model).toBe("claude-sonnet-5-5");
  });

  it("key provider aktif belum ada → AiNotConfiguredError, isAiReady false", async () => {
    env.AI_GATEWAY_API_KEY = undefined;
    db.studioSettings.findUnique.mockResolvedValue(row({ waAiProvider: "GATEWAY" }));
    await expect(getAiConfig()).rejects.toBeInstanceOf(AiNotConfiguredError);
    expect(await isAiReady()).toBe(false);
  });
});

describe("getAnthropicClient", () => {
  it("satu klien per provider + base URL; key dan base URL eksplisit", () => {
    const official = { provider: "ANTHROPIC" as const, baseUrl: "https://api.anthropic.com", apiKey: "sk-ant" };
    const a = getAnthropicClient(official);
    expect(getAnthropicClient(official)).toBe(a);
    const b = getAnthropicClient({ provider: "GATEWAY", baseUrl: "https://gateway.example/anthropic", apiKey: "gw-key" });
    expect(b).not.toBe(a);
    expect(b.baseURL).toBe("https://gateway.example/anthropic");
    expect(b.apiKey).toBe("gw-key");
  });
});

describe("validasi model", () => {
  it.each(["claude-haiku-5-5", "claude-sonnet-4-6", "claude-3-5-sonnet-20241022", "claude-opus-4-5@20251101"])(
    "model valid: %s",
    (m) => expect(aiModelSchema.safeParse(m).success).toBe(true),
  );

  it.each(["gpt-5.5", "gemini-3.5-flash", "claude", "CLAUDE-HAIKU", "claude-haiku 5", ""])("model ditolak: %j", (m) => {
    expect(aiModelSchema.safeParse(m).success).toBe(false);
  });
});
