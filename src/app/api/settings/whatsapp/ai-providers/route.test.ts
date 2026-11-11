import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  aiProvider: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  aiModelTest: { findMany: vi.fn(), deleteMany: vi.fn() },
  studioSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  activityLog: { create: vi.fn() },
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);
const tests = vi.hoisted(() => ({ assertUsable: vi.fn(), runModelTest: vi.fn() }));
vi.mock("@/lib/ai/model-tests", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/model-tests")>()), ...tests }));

import { GET, POST } from "./route";
import { DELETE, PUT as PUT_PROVIDER } from "./[id]/route";
import { PUT as PUT_USAGE } from "./usage/route";
import { ModelNotTestedError } from "@/lib/ai/model-tests";

const owner = { id: "u_owner", roles: ["OWNER"] };
const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });
const original = { ...process.env };
const SECRET_KEY = "sk-or-v1-super-secret-9876";

beforeEach(() => {
  vi.resetAllMocks();
  session.getCurrentUser.mockResolvedValue(owner);
  process.env.AI_KEYS_SECRET = randomBytes(32).toString("base64");
  process.env.ANTHROPIC_API_KEY = "sk-ant-env-1234";
  db.aiProvider.findMany.mockResolvedValue([]);
  db.aiModelTest.findMany.mockResolvedValue([]);
  db.studioSettings.findUnique.mockResolvedValue({ aiChatProviderKey: "db:p1", aiChatModel: "m1", aiProofProviderKey: null, aiProofModel: null, aiFallbackProviderKey: null, aiFallbackModel: null });
  db.aiProvider.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p9", ...data, createdAt: new Date(), updatedAt: new Date() }));
});
afterEach(() => {
  process.env = { ...original };
});

describe("akses", () => {
  it("bukan owner → 403 di semua route", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "u_d", roles: ["DESIGNER"] });
    expect((await GET()).status).toBe(403);
    expect((await POST(new Request("http://x", json({})))).status).toBe(403);
    expect((await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "p1" }) })).status).toBe(403);
    expect((await PUT_USAGE(new Request("http://x", { method: "PUT", body: "{}" }))).status).toBe(403);
  });
});

describe("POST provider", () => {
  const body = { name: "OpenRouter", format: "OPENAI", baseUrl: "https://openrouter.ai/api/v1/chat/completions", apiKey: SECRET_KEY };

  it("menyimpan key terenkripsi; respons tanpa key", async () => {
    const res = await POST(new Request("http://x", json(body)));
    expect(res.status).toBe(201);
    const data = db.aiProvider.create.mock.calls[0][0].data;
    expect(data.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(data.apiKeyLast4).toBe("9876");
    expect(data.apiKeyCiphertext).not.toContain("secret");
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(SECRET_KEY);
    expect(text).not.toContain("apiKeyCiphertext");
    expect(JSON.stringify(db.activityLog.create.mock.calls)).not.toContain(SECRET_KEY);
  });

  it("tanpa AI_KEYS_SECRET → 400 dengan pesan jelas", async () => {
    delete process.env.AI_KEYS_SECRET;
    const res = await POST(new Request("http://x", json(body)));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe("Kunci enkripsi AI_KEYS_SECRET belum diatur di server");
  });

  it("API key wajib saat membuat", async () => {
    const res = await POST(new Request("http://x", json({ ...body, apiKey: undefined })));
    expect(res.status).toBe(400);
    expect((await res.json()).fields.apiKey).toBeTruthy();
  });
});

describe("GET", () => {
  it("daftar provider + pemakaian + status kunci, tanpa key", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.cryptoReady).toBe(true);
    expect(body.providers.map((p: { key: string }) => p.key)).toEqual(["env:ANTHROPIC", "env:GATEWAY"]);
    expect(body.usage.chat).toEqual({ providerKey: "db:p1", model: "m1" });
    expect(body.effective.chat).toEqual({ providerKey: "db:p1", model: "m1" });
    // Label "Bawaan server" memakai provider env lama, bukan provider pilihan (review Minor 7).
    expect(body.defaults.chat.providerKey).toBe("env:ANTHROPIC");
    expect(JSON.stringify(body)).not.toContain("sk-ant-env-1234");
  });
});

describe("PUT / DELETE provider", () => {
  it("hapus provider yang dipakai Chat → 409 (Review Focus 5)", async () => {
    db.aiProvider.findUnique.mockResolvedValue({ id: "p1" });
    const res = await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "p1" }) });
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("Provider sedang dipakai untuk Chat");
    expect(db.aiProvider.delete).not.toHaveBeenCalled();
  });

  it("hapus provider yang tidak dipakai → hasil tesnya ikut dihapus (review Minor 6)", async () => {
    db.aiProvider.findUnique.mockResolvedValue({ id: "p2" });
    const res = await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "p2" }) });
    expect(res.status).toBe(200);
    expect(db.aiModelTest.deleteMany).toHaveBeenCalledWith({ where: { providerKey: "db:p2" } });
  });

  it("provider bawaan server tidak bisa diubah / dihapus", async () => {
    expect((await DELETE(new Request("http://x"), { params: Promise.resolve({ id: "env:GATEWAY" }) })).status).toBe(403);
    expect((await PUT_PROVIDER(new Request("http://x", { method: "PUT", body: "{}" }), { params: Promise.resolve({ id: "env:ANTHROPIC" }) })).status).toBe(403);
  });

  it("edit tanpa key → key lama tetap", async () => {
    db.aiProvider.findUnique.mockResolvedValue({ id: "p1", name: "A", format: "OPENAI", baseUrl: "https://a.test/v1", apiKeyLast4: "1111" });
    db.aiProvider.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", name: "A", format: "OPENAI", apiKeyLast4: "1111", updatedAt: new Date(), ...data }));
    const res = await PUT_PROVIDER(
      new Request("http://x", { method: "PUT", body: JSON.stringify({ name: "A", format: "OPENAI", baseUrl: "https://b.test/v1/" }) }),
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(200);
    const data = db.aiProvider.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("apiKeyCiphertext");
    expect(data.baseUrl).toBe("https://b.test/v1");
  });
});

describe("PUT pemakaian", () => {
  it("model belum lulus tes → 400 per field", async () => {
    tests.assertUsable.mockRejectedValue(new ModelNotTestedError("chat", ["tools"]));
    const res = await PUT_USAGE(new Request("http://x", { method: "PUT", body: JSON.stringify({ chat: { providerKey: "db:p1", model: "m2" } }) }));
    expect(res.status).toBe(400);
    expect((await res.json()).fields.chat).toBe("Model belum lulus tes: tool");
    expect(db.studioSettings.upsert).not.toHaveBeenCalled();
  });

  it("pilihan yang tidak berubah tidak dicek ulang (Chat basi tidak memblokir ubah Cadangan; review Important 3)", async () => {
    tests.assertUsable.mockImplementation(async (usage: string) => {
      if (usage === "chat") throw new ModelNotTestedError("chat", ["tools"]);
    });
    const res = await PUT_USAGE(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ chat: { providerKey: "db:p1", model: "m1" }, fallback: { providerKey: "env:ANTHROPIC", model: "claude-haiku-5-5" } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(tests.assertUsable).not.toHaveBeenCalledWith("chat", expect.anything(), expect.anything());
  });

  it("model lulus → disimpan; cadangan bisa dikosongkan", async () => {
    tests.assertUsable.mockResolvedValue(undefined);
    db.studioSettings.findUnique.mockResolvedValue({
      aiChatProviderKey: "db:p1",
      aiChatModel: "m1",
      aiProofProviderKey: null,
      aiProofModel: null,
      aiFallbackProviderKey: "env:ANTHROPIC",
      aiFallbackModel: "claude-haiku-5-5",
    });
    const res = await PUT_USAGE(new Request("http://x", { method: "PUT", body: JSON.stringify({ chat: { providerKey: "db:p1", model: "m2" }, fallback: null }) }));
    expect(res.status).toBe(200);
    expect(db.studioSettings.upsert.mock.calls[0][0].update).toEqual({ aiChatProviderKey: "db:p1", aiChatModel: "m2", aiFallbackProviderKey: null, aiFallbackModel: null });
  });
});
