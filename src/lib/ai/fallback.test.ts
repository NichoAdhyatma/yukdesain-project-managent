import { beforeEach, describe, expect, it, vi } from "vitest";

const providers = vi.hoisted(() => ({ resolveProvider: vi.fn() }));
vi.mock("./providers", async (orig) => ({ ...(await orig<typeof import("./providers")>()), ...providers }));
const clients = vi.hoisted(() => ({ primary: { create: vi.fn() }, backup: { create: vi.fn() } }));
vi.mock("./client", async (orig) => ({
  ...(await orig<typeof import("./client")>()),
  getAiClient: (p: { key: string }) => (p.key === "db:backup" ? clients.backup : clients.primary),
}));
const push = vi.hoisted(() => ({ notifyOwnersPush: vi.fn() }));
vi.mock("@/lib/notifications/push", () => push);

import { AiProviderError } from "./client";
import { createChatSession, createChatWithFallback, resetFallbackNotifyThrottle } from "./fallback";
import { KeyCryptoUnavailableError } from "./key-crypto";

const resolved = (key: string, format = "ANTHROPIC") => ({ key, name: key === "db:backup" ? "Cadangan" : "Utama", format, baseUrl: "https://x", builtIn: false, credentialVersion: "v", apiKey: "k" });
const targets = { chat: { providerKey: "db:main", model: "claude-haiku-5-5" }, fallback: { providerKey: "db:backup", model: "openai/gpt-4.1-mini" } };
const params = { max_tokens: 100, messages: [{ role: "user" as const, content: "halo" }] };
const message = { id: "m", content: [{ type: "text", text: "hai" }] };
const t0 = new Date("2026-11-11T05:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  resetFallbackNotifyThrottle();
  providers.resolveProvider.mockImplementation(async (key: string) => resolved(key, key === "db:backup" ? "OPENAI" : "ANTHROPIC"));
  clients.backup.create.mockResolvedValue(message);
});

describe("createChatWithFallback (spec §5.5)", () => {
  it("utama berhasil → cadangan tidak dipanggil", async () => {
    clients.primary.create.mockResolvedValue(message);
    const r = await createChatWithFallback(targets, params, t0);
    expect(r).toEqual({ message, usedFallback: false });
    expect(clients.primary.create.mock.calls[0][0]).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "low" } });
    expect(clients.backup.create).not.toHaveBeenCalled();
  });

  it("utama 503 → request yang sama ke cadangan (tanpa opsi Claude untuk OPENAI) + notifikasi", async () => {
    clients.primary.create.mockRejectedValue(new AiProviderError("HTTP 503", 503));
    const r = await createChatWithFallback(targets, params, t0);
    expect(r.usedFallback).toBe(true);
    expect(clients.backup.create.mock.calls[0][0]).toMatchObject({ model: "openai/gpt-4.1-mini", messages: params.messages, max_tokens: 100 });
    expect(clients.backup.create.mock.calls[0][0]).not.toHaveProperty("output_config");
    expect(push.notifyOwnersPush).toHaveBeenCalledWith("NEEDS_ADMIN", expect.objectContaining({ title: "Provider utama gagal, memakai cadangan" }));
  });

  it("utama 400 (bukan teknis) → error diteruskan, cadangan tidak dipakai", async () => {
    clients.primary.create.mockRejectedValue(new AiProviderError("HTTP 400", 400));
    await expect(createChatWithFallback(targets, params, t0)).rejects.toThrow("HTTP 400");
    expect(clients.backup.create).not.toHaveBeenCalled();
  });

  it("key utama tidak bisa dibuka → cadangan (Review Focus 2)", async () => {
    providers.resolveProvider.mockImplementation(async (key: string) => {
      if (key === "db:main") throw new KeyCryptoUnavailableError();
      return resolved(key, "OPENAI");
    });
    expect((await createChatWithFallback(targets, params, t0)).usedFallback).toBe(true);
  });

  it("notifikasi paling banyak sekali per jam", async () => {
    clients.primary.create.mockRejectedValue(new AiProviderError("HTTP 503", 503));
    await createChatWithFallback(targets, params, t0);
    await createChatWithFallback(targets, params, new Date(t0.getTime() + 59 * 60_000));
    expect(push.notifyOwnersPush).toHaveBeenCalledTimes(1);
    await createChatWithFallback(targets, params, new Date(t0.getTime() + 60 * 60_000));
    expect(push.notifyOwnersPush).toHaveBeenCalledTimes(2);
  });

  it("tanpa cadangan → error utama diteruskan", async () => {
    clients.primary.create.mockRejectedValue(new AiProviderError("HTTP 503", 503));
    await expect(createChatWithFallback({ ...targets, fallback: null }, params, t0)).rejects.toThrow("HTTP 503");
  });
});

describe("createChatSession: cadangan menempel untuk sisa giliran (review Important 1)", () => {
  it("setelah utama gagal sekali, putaran berikutnya langsung ke cadangan", async () => {
    clients.primary.create.mockRejectedValue(new AiProviderError("timeout", null));
    const session = createChatSession(targets, t0);
    await session.create(params);
    await session.create(params);
    expect(clients.primary.create).toHaveBeenCalledTimes(1);
    expect(clients.backup.create).toHaveBeenCalledTimes(2);
    expect(session.usedFallback).toBe(true);
    expect(push.notifyOwnersPush).toHaveBeenCalledTimes(1);
  });

  it("utama sehat → semua putaran ke utama", async () => {
    clients.primary.create.mockResolvedValue(message);
    const session = createChatSession(targets, t0);
    await session.create(params);
    await session.create(params);
    expect(clients.primary.create).toHaveBeenCalledTimes(2);
    expect(session.usedFallback).toBe(false);
  });
});

