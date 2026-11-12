import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { getAiEnv, getProviderEnv, isAiConfigured, isWhatsAppConfigured, parseWhatsAppEnv } from "./env";

const valid = {
  WHATSAPP_ACCESS_TOKEN: "EAAG-test-token",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_APP_SECRET: "app-secret",
  WHATSAPP_VERIFY_TOKEN: "verify-token-yang-panjang",
  STORAGE_PRIVATE_BUCKET: "yukdesain-private",
};

describe("parseWhatsAppEnv", () => {
  it("mengisi default untuk variabel opsional", () => {
    const env = parseWhatsAppEnv(valid);
    expect(env.WHATSAPP_GRAPH_VERSION).toBe("v23.0");
    expect(env.WHATSAPP_TEMPLATE_LANG).toBe("id");
    expect(env.WHATSAPP_GRAPH_BASE_URL).toBe("https://graph.facebook.com");
  });

  it("menganggap string kosong sebagai tidak di-set", () => {
    expect(() => parseWhatsAppEnv({ ...valid, WHATSAPP_APP_SECRET: "" })).toThrow(/WHATSAPP_APP_SECRET/);
  });

  it("menolak format yang salah", () => {
    expect(() => parseWhatsAppEnv({ ...valid, WHATSAPP_PHONE_NUMBER_ID: "+62 812" })).toThrow(
      /WHATSAPP_PHONE_NUMBER_ID/,
    );
    expect(() => parseWhatsAppEnv({ ...valid, WHATSAPP_GRAPH_VERSION: "23" })).toThrow(
      /WHATSAPP_GRAPH_VERSION/,
    );
    expect(() => parseWhatsAppEnv({ ...valid, WHATSAPP_VERIFY_TOKEN: "pendek" })).toThrow(
      /WHATSAPP_VERIFY_TOKEN/,
    );
  });

  it("tidak membocorkan nilai rahasia di pesan error", () => {
    const secret = "sk-ant-sangat-rahasia";
    try {
      parseWhatsAppEnv({ ...valid, ANTHROPIC_API_KEY: secret, WHATSAPP_PHONE_NUMBER_ID: "abc" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).not.toContain("abc");
    }
  });
});

describe("provider AI", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("Anthropic resmi: default model & base URL, key dari ANTHROPIC_API_KEY", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("WA_AI_MODEL", "");
    expect(getProviderEnv("ANTHROPIC")).toEqual({
      provider: "ANTHROPIC",
      label: "Anthropic (resmi)",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test",
      defaultModel: "claude-haiku-5-5",
      defaultExtractionModel: "claude-sonnet-5-5",
    });
  });

  it("gateway: key & base URL sendiri, default olagon", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "gw-key");
    expect(getProviderEnv("GATEWAY")).toMatchObject({
      label: "Olagon gateway",
      baseUrl: "https://gateway.olagon.site/anthropic",
      apiKey: "gw-key",
      defaultModel: "claude-sonnet-4-6",
    });
  });

  it("base URL harus https", () => {
    vi.stubEnv("AI_GATEWAY_BASE_URL", "http://gateway.example");
    expect(() => getProviderEnv("GATEWAY")).toThrow(/AI_GATEWAY_BASE_URL/);
  });

  it("isAiConfigured per provider; token WhatsApp tidak diperlukan", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "gw-key");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    expect(isAiConfigured("ANTHROPIC")).toBe(false);
    expect(isAiConfigured("GATEWAY")).toBe(true);
    expect(isWhatsAppConfigured()).toBe(false);
  });
});

describe("WA_AI_MAX_TOKENS (review produksi 2026-11-11)", () => {
  it("default 2000: balasan yang menyimpan banyak item menu sekaligus tidak terpotong jadi kosong", () => {
    const before = process.env.WA_AI_MAX_TOKENS;
    delete process.env.WA_AI_MAX_TOKENS;
    try {
      expect(getAiEnv().WA_AI_MAX_TOKENS).toBe(2000);
    } finally {
      if (before !== undefined) process.env.WA_AI_MAX_TOKENS = before;
    }
  });
});
