import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { getAiEnvDefaults, isAiConfigured, isWhatsAppConfigured, parseWhatsAppEnv } from "./env";

const valid = {
  WHATSAPP_ACCESS_TOKEN: "EAAG-test-token",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_APP_SECRET: "app-secret",
  WHATSAPP_VERIFY_TOKEN: "verify-token-yang-panjang",
  ANTHROPIC_API_KEY: "sk-ant-test",
  STORAGE_PRIVATE_BUCKET: "yukdesain-private",
};

describe("parseWhatsAppEnv", () => {
  it("mengisi default untuk variabel opsional", () => {
    const env = parseWhatsAppEnv(valid);
    expect(env.WHATSAPP_GRAPH_VERSION).toBe("v23.0");
    expect(env.WHATSAPP_TEMPLATE_LANG).toBe("id");
    expect(env.WHATSAPP_GRAPH_BASE_URL).toBe("https://graph.facebook.com");
    expect(env.ANTHROPIC_BASE_URL).toBe("https://api.anthropic.com");
    expect(env.WA_AI_MODEL).toBe("claude-haiku-5-5");
    expect(env.WA_AI_EXTRACTION_MODEL).toBe("claude-sonnet-5-5");
    expect(env.WA_AI_MAX_TOKENS).toBe(800);
  });

  it("mengubah WA_AI_MAX_TOKENS menjadi angka", () => {
    expect(parseWhatsAppEnv({ ...valid, WA_AI_MAX_TOKENS: "1200" }).WA_AI_MAX_TOKENS).toBe(1200);
  });

  it("menganggap string kosong sebagai tidak di-set", () => {
    const env = parseWhatsAppEnv({ ...valid, WA_AI_MODEL: "  " });
    expect(env.WA_AI_MODEL).toBe("claude-haiku-5-5");
    expect(() => parseWhatsAppEnv({ ...valid, WHATSAPP_APP_SECRET: "" })).toThrow(
      /WHATSAPP_APP_SECRET/,
    );
  });

  it("ANTHROPIC_BASE_URL wajib https", () => {
    expect(parseWhatsAppEnv({ ...valid, ANTHROPIC_BASE_URL: "https://gateway.example/anthropic" }).ANTHROPIC_BASE_URL).toBe(
      "https://gateway.example/anthropic",
    );
    expect(() => parseWhatsAppEnv({ ...valid, ANTHROPIC_BASE_URL: "http://gateway.example" })).toThrow(/ANTHROPIC_BASE_URL/);
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

describe("getAiEnvDefaults", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("tetap tersedia walau token WhatsApp belum diisi", () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    vi.stubEnv("WA_AI_MODEL", "");
    expect(getAiEnvDefaults()).toEqual({
      model: "claude-haiku-5-5",
      extractionModel: "claude-sonnet-5-5",
      baseUrl: "https://api.anthropic.com",
    });
  });

  it("mengikuti env jika diisi", () => {
    vi.stubEnv("WA_AI_MODEL", "claude-sonnet-4-6");
    expect(getAiEnvDefaults()?.model).toBe("claude-sonnet-4-6");
  });
});

describe("isAiConfigured", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("cukup ANTHROPIC_API_KEY: Uji bot jalan sebelum token WhatsApp & bucket privat diisi", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    vi.stubEnv("STORAGE_PRIVATE_BUCKET", "");
    expect(isAiConfigured()).toBe(true);
    expect(isWhatsAppConfigured()).toBe(false);
  });

  it("tanpa ANTHROPIC_API_KEY → belum siap", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(isAiConfigured()).toBe(false);
  });
});
