import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiProviderError, getAiClient, isTechnicalFailure } from "./client";
import { AiProviderUnavailableError, type ResolvedProvider } from "./providers";
import { KeyCryptoUnavailableError } from "./key-crypto";

const provider: ResolvedProvider = {
  key: "db:p1",
  name: "OpenRouter",
  format: "OPENAI",
  baseUrl: "https://x.test/v1",
  builtIn: false,
  credentialVersion: "abc",
  apiKey: "sk-or-v1-abc",
};
const params = { model: "openai/gpt-4.1-mini", max_tokens: 50, messages: [{ role: "user" as const, content: "halo" }] };
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("getAiClient OPENAI", () => {
  it("memanggil {baseUrl}/chat/completions dengan Bearer lalu menerjemahkan jawaban", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "hai" }, finish_reason: "stop" }] }), { status: 200 }));
    const msg = await getAiClient(provider).create(params);
    expect(fetchMock.mock.calls[0][0]).toBe("https://x.test/v1/chat/completions");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer sk-or-v1-abc");
    expect(msg.content).toEqual([{ type: "text", text: "hai" }]);
  });

  it("HTTP 500 → kegagalan teknis; 400 → bukan; pesan error tanpa key", async () => {
    fetchMock.mockResolvedValueOnce(new Response("invalid key sk-or-v1-abc", { status: 500 }));
    const e500 = await getAiClient(provider).create(params).catch((e) => e);
    expect(e500).toBeInstanceOf(AiProviderError);
    expect(e500.status).toBe(500);
    expect(isTechnicalFailure(e500)).toBe(true);
    expect(e500.message).not.toContain("sk-or-v1-abc");

    fetchMock.mockResolvedValueOnce(new Response("bad request", { status: 400 }));
    expect(isTechnicalFailure(await getAiClient(provider).create(params).catch((e) => e))).toBe(false);
  });

  it("jaringan putus → status null, kegagalan teknis", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const err = await getAiClient(provider).create(params).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.status).toBeNull();
    expect(isTechnicalFailure(err)).toBe(true);
  });
});

describe("isTechnicalFailure", () => {
  it.each([429, 401, 403, 503])("HTTP %i → teknis", (status) => {
    expect(isTechnicalFailure(new AiProviderError("x", status))).toBe(true);
  });
  it("provider tidak tersedia / kunci enkripsi → teknis; error biasa → bukan", () => {
    expect(isTechnicalFailure(new AiProviderUnavailableError("db:x", "hilang"))).toBe(true);
    expect(isTechnicalFailure(new KeyCryptoUnavailableError())).toBe(true);
    expect(isTechnicalFailure(new Error("AI_REFUSAL"))).toBe(false);
  });
});
