import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ aiProvider: { findMany: vi.fn(), findUnique: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { encryptApiKey } from "./key-crypto";
import {
  AiProviderUnavailableError,
  aiModelIdSchema,
  credentialVersionOf,
  listProviders,
  normalizeBaseUrl,
  providerInputSchema,
  resolveProvider,
} from "./providers";

const original = { ...process.env };
let row: Record<string, unknown>;

beforeEach(() => {
  vi.resetAllMocks();
  process.env.AI_KEYS_SECRET = randomBytes(32).toString("base64");
  process.env.ANTHROPIC_API_KEY = "sk-ant-env-key-1234";
  delete process.env.AI_GATEWAY_API_KEY;
  const enc = encryptApiKey("sk-or-v1-abcdef123456");
  row = {
    id: "p1",
    name: "OpenRouter",
    format: "OPENAI",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyCiphertext: enc.ciphertext,
    apiKeyLast4: enc.last4,
    createdAt: new Date("2026-11-11T00:00:00Z"),
    updatedAt: new Date("2026-11-11T00:00:00Z"),
  };
  db.aiProvider.findMany.mockResolvedValue([row]);
  db.aiProvider.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "p1" ? row : null));
});
afterEach(() => {
  process.env = { ...original };
});

describe("normalizeBaseUrl (Review Focus 3)", () => {
  it("membuang garis miring dan path endpoint yang ikut ditempel", () => {
    expect(normalizeBaseUrl("https://openrouter.ai/api/v1/chat/completions/", "OPENAI")).toBe("https://openrouter.ai/api/v1");
    expect(normalizeBaseUrl("https://api.anthropic.com/v1/messages", "ANTHROPIC")).toBe("https://api.anthropic.com");
    // SDK Anthropic menambah /v1 sendiri (review Minor 3).
    expect(normalizeBaseUrl("https://api.anthropic.com/v1", "ANTHROPIC")).toBe("https://api.anthropic.com");
    expect(normalizeBaseUrl("https://openrouter.ai/api/v1", "OPENAI")).toBe("https://openrouter.ai/api/v1");
  });
});

describe("providerInputSchema", () => {
  const base = { name: "X", format: "OPENAI", apiKey: "sk-12345678" };
  it("https wajib, kecuali localhost", () => {
    expect(providerInputSchema.safeParse({ ...base, baseUrl: "http://example.com/v1" }).success).toBe(false);
    expect(providerInputSchema.safeParse({ ...base, baseUrl: "http://localhost:11434/v1" }).success).toBe(true);
    expect(providerInputSchema.safeParse({ ...base, baseUrl: "https://openrouter.ai/api/v1" }).success).toBe(true);
  });
});

describe("aiModelIdSchema", () => {
  it.each(["claude-haiku-5-5", "openai/gpt-4.1-mini", "deepseek-chat", "llama3.1:8b"])("menerima %s", (id) => {
    expect(aiModelIdSchema.safeParse(id).success).toBe(true);
  });
  it.each(["", "a b"])("menolak %j", (id) => {
    expect(aiModelIdSchema.safeParse(id).success).toBe(false);
  });
});

describe("listProviders / resolveProvider", () => {
  it("bawaan env dulu, lalu provider portal; tanpa key di hasil", async () => {
    const list = await listProviders();
    expect(list.map((p) => p.key)).toEqual(["env:ANTHROPIC", "env:GATEWAY", "db:p1"]);
    expect(list.find((p) => p.key === "env:ANTHROPIC")).toMatchObject({ builtIn: true, configured: true, format: "ANTHROPIC" });
    expect(list.find((p) => p.key === "env:GATEWAY")).toMatchObject({ builtIn: true, configured: false });
    expect(list.find((p) => p.key === "db:p1")).toMatchObject({ builtIn: false, keyHint: "••••3456", format: "OPENAI" });
    const json = JSON.stringify(list);
    expect(json).not.toContain("abcdef123456");
    expect(json).not.toContain("sk-ant-env-key");
    expect(json).not.toContain("apiKeyCiphertext");
  });

  it("resolveProvider membuka key provider portal dan env", async () => {
    expect((await resolveProvider("db:p1")).apiKey).toBe("sk-or-v1-abcdef123456");
    expect((await resolveProvider("env:ANTHROPIC")).apiKey).toBe("sk-ant-env-key-1234");
  });

  it("provider tidak ada / key env kosong → AiProviderUnavailableError", async () => {
    await expect(resolveProvider("db:missing")).rejects.toBeInstanceOf(AiProviderUnavailableError);
    await expect(resolveProvider("env:GATEWAY")).rejects.toBeInstanceOf(AiProviderUnavailableError);
  });
});

describe("credentialVersionOf (review Minor 2)", () => {
  it("berubah bila base URL, format, atau key berubah; tidak bila hanya nama yang diganti", async () => {
    const a = credentialVersionOf({ key: "db:p1", baseUrl: "https://a", format: "OPENAI", secret: "c1" });
    expect(a).toHaveLength(12);
    expect(credentialVersionOf({ key: "db:p1", baseUrl: "https://b", format: "OPENAI", secret: "c1" })).not.toBe(a);
    expect(credentialVersionOf({ key: "db:p1", baseUrl: "https://a", format: "ANTHROPIC", secret: "c1" })).not.toBe(a);
    expect(credentialVersionOf({ key: "db:p1", baseUrl: "https://a", format: "OPENAI", secret: "c2" })).not.toBe(a);

    const before = (await listProviders()).find((p) => p.key === "db:p1")!.credentialVersion;
    row.name = "Nama baru";
    row.updatedAt = new Date("2026-11-12T00:00:00Z");
    expect((await listProviders()).find((p) => p.key === "db:p1")!.credentialVersion).toBe(before);
  });
});
