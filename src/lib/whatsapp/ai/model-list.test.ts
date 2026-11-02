import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ apiKey: "k" as string | null }));
vi.mock("../env", () => ({
  getProviderEnv: (provider: string) => ({
    provider,
    label: "x",
    baseUrl: provider === "GATEWAY" ? "https://gateway.example/anthropic" : "https://api.anthropic.com",
    apiKey: env.apiKey,
    defaultModel: "m",
    defaultExtractionModel: "m",
  }),
}));

import { clearModelListCache, listModels, modelListUrls, parseModelIds } from "./model-list";

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

beforeEach(() => {
  clearModelListCache();
  env.apiKey = "k";
});

describe("model list", () => {
  it("URL: di bawah base URL lalu root host (gateway); tanpa duplikat untuk API resmi", () => {
    expect(modelListUrls("https://gateway.example/anthropic")).toEqual([
      "https://gateway.example/anthropic/v1/models?limit=100",
      "https://gateway.example/v1/models?limit=100",
    ]);
    expect(modelListUrls("https://api.anthropic.com")).toEqual(["https://api.anthropic.com/v1/models?limit=100"]);
  });

  it("hanya ID Claude yang diambil", () => {
    expect(parseModelIds({ data: [{ id: "claude-sonnet-4-6" }, { id: "gpt-5" }, { id: 3 }] })).toEqual(["claude-sonnet-4-6"]);
    expect(parseModelIds(null)).toEqual([]);
  });

  it("gateway: URL pertama 405 → coba root, dapat daftar dari API", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 405 } as Response)
      .mockResolvedValueOnce(ok({ data: [{ id: "claude-opus-4-8" }, { id: "claude-sonnet-4-6" }] }));
    expect(await listModels("GATEWAY", fetchImpl)).toEqual({ models: ["claude-opus-4-8", "claude-sonnet-4-6"], source: "api" });
    expect(fetchImpl.mock.calls[1][1].headers["x-api-key"]).toBe("k");
  });

  it("endpoint gagal atau key belum ada → daftar cadangan", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("timeout"));
    expect((await listModels("ANTHROPIC", failing)).source).toBe("fallback");
    env.apiKey = null;
    const notCalled = vi.fn();
    expect((await listModels("GATEWAY", notCalled)).models).toContain("claude-sonnet-4-6");
    expect(notCalled).not.toHaveBeenCalled();
  });
});
