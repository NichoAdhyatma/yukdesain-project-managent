import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ studioSettings: { findUnique: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("../env", () => ({
  getAiEnv: () => ({
    ANTHROPIC_API_KEY: "k",
    ANTHROPIC_BASE_URL: "https://api.anthropic.com",
    WA_AI_MODEL: "claude-haiku-5-5",
    WA_AI_EXTRACTION_MODEL: "claude-sonnet-5-5",
    WA_AI_MAX_TOKENS: 800,
  }),
}));

import { aiBaseUrlSchema, aiModelSchema, getAiConfig, getAnthropicClient } from "./ai-config";

describe("getAiConfig", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tanpa override → default env", async () => {
    db.studioSettings.findUnique.mockResolvedValue(null);
    expect(await getAiConfig()).toEqual({
      model: "claude-haiku-5-5",
      extractionModel: "claude-sonnet-5-5",
      baseUrl: "https://api.anthropic.com",
      maxTokens: 800,
    });
  });

  it("override dari Settings menang", async () => {
    db.studioSettings.findUnique.mockResolvedValue({
      waAiModel: "claude-sonnet-4-6",
      waAiExtractionModel: null,
      waAiBaseUrl: "https://gateway.example/anthropic",
    });
    expect(await getAiConfig()).toMatchObject({
      model: "claude-sonnet-4-6",
      extractionModel: "claude-sonnet-5-5",
      baseUrl: "https://gateway.example/anthropic",
    });
  });
});

describe("getAnthropicClient", () => {
  it("satu klien per base URL, base URL eksplisit", () => {
    const a = getAnthropicClient("https://api.anthropic.com");
    expect(getAnthropicClient("https://api.anthropic.com")).toBe(a);
    const b = getAnthropicClient("https://gateway.example/anthropic");
    expect(b).not.toBe(a);
    expect(b.baseURL).toBe("https://gateway.example/anthropic");
  });
});

describe("validasi Settings", () => {
  it.each(["claude-haiku-5-5", "claude-sonnet-4-6", "claude-3-5-sonnet-20241022", "claude-opus-4-5@20251101"])(
    "model valid: %s",
    (m) => expect(aiModelSchema.safeParse(m).success).toBe(true),
  );

  it.each(["gpt-5.5", "gemini-3.5-flash", "claude", "CLAUDE-HAIKU", "claude-haiku 5", ""])("model ditolak: %j", (m) => {
    expect(aiModelSchema.safeParse(m).success).toBe(false);
  });

  it("base URL https publik diterima, slash akhir dibuang", () => {
    expect(aiBaseUrlSchema.parse("https://gateway.olagon.site/anthropic/")).toBe("https://gateway.olagon.site/anthropic");
  });

  it.each([
    "http://gateway.example",
    "https://localhost:3000",
    "https://api.localhost",
    "https://127.0.0.1",
    "https://10.0.0.5",
    "https://192.168.1.10",
    "https://172.20.0.1",
    "https://169.254.169.254",
    "https://[::1]",
    "https://db.internal",
    "ftp://example.com",
    "bukan url",
  ])("base URL ditolak: %s", (u) => {
    expect(aiBaseUrlSchema.safeParse(u).success).toBe(false);
  });
});
