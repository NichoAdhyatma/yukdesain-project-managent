import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearModelListCache, fallbackModels, listModels, modelListUrls, parseModelIds } from "./model-list";

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const provider = (over: object = {}) => ({
  key: "env:GATEWAY",
  name: "Olagon",
  format: "ANTHROPIC" as const,
  baseUrl: "https://gateway.example/anthropic",
  builtIn: true,
  credentialVersion: "v1",
  apiKey: "k",
  ...over,
});

beforeEach(() => clearModelListCache());

describe("model list (docs/AI_PROVIDERS.md)", () => {
  it("URL Anthropic: di bawah base URL lalu root host; tanpa duplikat untuk API resmi", () => {
    expect(modelListUrls("https://gateway.example/anthropic")).toEqual([
      "https://gateway.example/anthropic/v1/models?limit=100",
      "https://gateway.example/v1/models?limit=100",
    ]);
    expect(modelListUrls("https://api.anthropic.com")).toEqual(["https://api.anthropic.com/v1/models?limit=100"]);
  });

  it("semua ID model valid diambil (bukan hanya Claude)", () => {
    expect(parseModelIds({ data: [{ id: "claude-sonnet-4-6" }, { id: "openai/gpt-4.1-mini" }, { id: 3 }, { id: "a b" }] })).toEqual([
      "claude-sonnet-4-6",
      "openai/gpt-4.1-mini",
    ]);
    expect(parseModelIds(null)).toEqual([]);
  });

  it("Anthropic: URL pertama 405 → coba root, header x-api-key", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 405 } as Response)
      .mockResolvedValueOnce(ok({ data: [{ id: "claude-opus-4-8" }] }));
    expect(await listModels(provider(), fetchImpl)).toEqual({ models: ["claude-opus-4-8"], source: "api" });
    expect(fetchImpl.mock.calls[1][1].headers["x-api-key"]).toBe("k");
  });

  it("OpenAI: GET {baseUrl}/models dengan Bearer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ data: [{ id: "openai/gpt-4.1-mini" }] }));
    const p = provider({ key: "db:p1", format: "OPENAI", baseUrl: "https://openrouter.ai/api/v1", apiKey: "sk-or" });
    expect(await listModels(p, fetchImpl)).toEqual({ models: ["openai/gpt-4.1-mini"], source: "api" });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/models");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-or");
  });

  it("endpoint gagal → daftar cadangan (provider env) atau kosong (provider portal)", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("timeout"));
    const env = await listModels(provider(), failing);
    expect(env.source).toBe("fallback");
    expect(env.models).toContain("claude-sonnet-4-6");
    expect(await listModels(provider({ key: "db:p1", format: "OPENAI" }), failing)).toEqual({ models: [], source: "fallback" });
    expect(fallbackModels("env:ANTHROPIC")).toContain("claude-haiku-5-5");
  });
});
