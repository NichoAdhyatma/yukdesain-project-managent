import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ aiModelTest: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
const providers = vi.hoisted(() => ({ resolveProvider: vi.fn(), listProviders: vi.fn() }));
vi.mock("./providers", async (orig) => ({ ...(await orig<typeof import("./providers")>()), ...providers }));
const client = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./client", async (orig) => ({ ...(await orig<typeof import("./client")>()), getAiClient: () => client }));

import { ModelNotTestedError, assertUsable, passedTestsFor, runModelTest } from "./model-tests";

const provider = { key: "db:p1", name: "OR", format: "OPENAI", baseUrl: "https://x.test/v1", builtIn: false, credentialVersion: "v1", apiKey: "sk-or-secret-123" };
const test = (over: object) => ({ model: "m1", connectionOk: true, toolsOk: true, imageOk: true, testedAt: new Date("2026-11-11T01:00:00Z"), credentialVersion: "v1", ...over });

beforeEach(() => {
  vi.resetAllMocks();
  providers.resolveProvider.mockResolvedValue(provider);
  providers.listProviders.mockResolvedValue([{ ...provider, keyHint: "••••-123", configured: true }]);
});

describe("runModelTest", () => {
  it("menyimpan hasil per langkah tanpa key provider di detail", async () => {
    client.create
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] })
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "save_color", input: {} }] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "disimpan" }] })
      .mockRejectedValueOnce(new Error("image not supported for key sk-or-secret-123"));
    const { test: saved, checks } = await runModelTest("db:p1", "m1");
    expect(checks.map((c) => [c.name, c.ok])).toEqual([
      ["Koneksi", true],
      ["Tool use", true],
      ["Gambar", false],
    ]);
    expect(saved).toMatchObject({ connectionOk: true, toolsOk: true, imageOk: false });
    const data = db.aiModelTest.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ providerKey: "db:p1", model: "m1", credentialVersion: "v1" });
    expect(JSON.stringify(data.details)).not.toContain("sk-or-secret-123");
  });
});

describe("assertUsable / passedTestsFor (spec §4.3)", () => {
  it("tool lulus, gambar gagal → boleh Chat dan Cadangan, tidak boleh Bukti transfer", async () => {
    db.aiModelTest.findFirst.mockResolvedValue(test({ imageOk: false }));
    await expect(assertUsable("chat", "db:p1", "m1")).resolves.toBeUndefined();
    await expect(assertUsable("fallback", "db:p1", "m1")).resolves.toBeUndefined();
    const err = await assertUsable("proof", "db:p1", "m1").catch((e) => e);
    expect(err).toBeInstanceOf(ModelNotTestedError);
    expect(err.missing).toEqual(["image"]);
    expect(db.aiModelTest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerKey: "db:p1", model: "m1", credentialVersion: "v1" } }),
    );
  });

  it("belum pernah dites (atau tes dari kredensial lama) → ditolak (Review Focus 1)", async () => {
    db.aiModelTest.findFirst.mockResolvedValue(null);
    const err = await assertUsable("chat", "db:p1", "m1").catch((e) => e);
    expect(err).toBeInstanceOf(ModelNotTestedError);
    expect(err.missing).toEqual(["connection", "tools"]);
  });

  it("passedTestsFor: tes terbaru per model, beserta pemakaian yang lolos", async () => {
    db.aiModelTest.findMany.mockResolvedValue([
      test({ model: "m1", imageOk: false, testedAt: new Date("2026-11-11T02:00:00Z") }),
      test({ model: "m1", imageOk: true, testedAt: new Date("2026-11-11T01:00:00Z") }),
      test({ model: "m2", toolsOk: false }),
    ]);
    const passed = await passedTestsFor("db:p1", "v1");
    expect(passed).toEqual([{ model: "m1", usages: ["chat", "fallback"], testedAt: new Date("2026-11-11T02:00:00Z") }]);
  });
});
