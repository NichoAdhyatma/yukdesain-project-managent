import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KeyCryptoUnavailableError, decryptApiKey, encryptApiKey, isKeyCryptoReady, maskSecrets } from "./key-crypto";

const original = process.env.AI_KEYS_SECRET;
beforeEach(() => {
  process.env.AI_KEYS_SECRET = randomBytes(32).toString("base64");
});
afterEach(() => {
  process.env.AI_KEYS_SECRET = original;
});

describe("enkripsi API key provider (docs/superpowers/specs/2026-11-11-ai-provider-adapter-design.md §5.6)", () => {
  it("bolak-balik dan 4 karakter terakhir", () => {
    const { ciphertext, last4 } = encryptApiKey("sk-or-v1-abcdef123456");
    expect(decryptApiKey(ciphertext)).toBe("sk-or-v1-abcdef123456");
    expect(last4).toBe("3456");
    expect(ciphertext).not.toContain("abcdef");
  });

  it("IV acak: dua kali enkripsi berbeda", () => {
    expect(encryptApiKey("rahasia-123").ciphertext).not.toBe(encryptApiKey("rahasia-123").ciphertext);
  });

  it("kunci server berganti → dekripsi gagal dengan error yang jelas", () => {
    const { ciphertext } = encryptApiKey("rahasia-123");
    process.env.AI_KEYS_SECRET = randomBytes(32).toString("base64");
    expect(() => decryptApiKey(ciphertext)).toThrow(KeyCryptoUnavailableError);
  });

  it("tanpa AI_KEYS_SECRET (atau bukan 32 byte) → tidak siap", () => {
    delete process.env.AI_KEYS_SECRET;
    expect(isKeyCryptoReady()).toBe(false);
    expect(() => encryptApiKey("rahasia-123")).toThrow(KeyCryptoUnavailableError);
    process.env.AI_KEYS_SECRET = Buffer.from("pendek").toString("base64");
    expect(isKeyCryptoReady()).toBe(false);
  });
});

describe("maskSecrets", () => {
  it("menyamarkan sk-…, Bearer …, dan key provider", () => {
    const out = maskSecrets("401: invalid key sk-or-v1-abc Bearer xyz123 mykey123", ["mykey123"]);
    expect(out).not.toContain("sk-or-v1-abc");
    expect(out).not.toContain("xyz123");
    expect(out).not.toContain("mykey123");
    expect(out).toContain("401: invalid key");
  });
});
