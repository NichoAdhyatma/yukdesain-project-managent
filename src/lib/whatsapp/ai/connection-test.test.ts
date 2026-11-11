import { beforeEach, describe, expect, it, vi } from "vitest";
import { testAiConnection } from "./connection-test";

const create = vi.fn();
const client = { create };
const ok = (text: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });

beforeEach(() => vi.clearAllMocks());

describe("testAiConnection", () => {
  it("tiga pemeriksaan lolos; opsi Claude hanya bila diminta", async () => {
    create
      .mockResolvedValueOnce(ok("siap"))
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "save_color", input: { color: "coklat" } }] })
      .mockResolvedValueOnce(ok("Siap, coklat disimpan"))
      .mockResolvedValueOnce(ok("coklat"));
    const checks = await testAiConnection(client as never, "claude-sonnet-4-6", { claudeOptions: true });
    expect(checks.map((c) => [c.name, c.ok])).toEqual([
      ["Koneksi", true],
      ["Tool use", true],
      ["Gambar", true],
    ]);
    expect(create.mock.calls[1][0].output_config).toEqual({ effort: "low" });
    // Tool use bolak-balik: hasil tool dikirim balik, model harus menjawab teks (review Important 2).
    const roundTrip = create.mock.calls[2][0].messages;
    expect(roundTrip[1]).toMatchObject({ role: "assistant", content: [{ type: "tool_use", id: "tu1" }] });
    expect(roundTrip[2]).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "tu1" }] });
    expect(create.mock.calls[3][0].messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
  });

  it("tool_use tanpa stop_reason tool_use, atau tidak ada jawaban setelah hasil tool → Tool use gagal", async () => {
    create
      .mockResolvedValueOnce(ok("siap"))
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "tool_use", id: "tu1", name: "save_color", input: {} }] })
      .mockResolvedValueOnce(ok("coklat"));
    const [, tool] = await testAiConnection(client as never, "m", { claudeOptions: false });
    expect(tool.ok).toBe(false);

    create.mockReset();
    create
      .mockResolvedValueOnce(ok("siap"))
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "save_color", input: {} }] })
      .mockRejectedValueOnce(Object.assign(new Error("invalid tool message"), { status: 400 }))
      .mockResolvedValueOnce(ok("coklat"));
    const [, tool2] = await testAiConnection(client as never, "m", { claudeOptions: false });
    expect(tool2.ok).toBe(false);
    expect(tool2.detail).toContain("invalid tool message");
  });

  it("model non-Claude: tanpa opsi Claude", async () => {
    create.mockResolvedValue(ok("x"));
    await testAiConnection(client as never, "openai/gpt-4.1-mini", { claudeOptions: false });
    expect(create.mock.calls[0][0]).not.toHaveProperty("output_config");
  });

  it("model tidak memanggil tool → gagal di Tool use", async () => {
    create.mockResolvedValue(ok("oke"));
    const [, tool] = await testAiConnection(client as never, "m", { claudeOptions: false });
    expect(tool).toEqual({ name: "Tool use", ok: false, detail: "Model tidak memanggil tool" });
  });

  it("error API: status ditampilkan, key disamarkan", async () => {
    create.mockRejectedValue(Object.assign(new Error("invalid x-api-key sk-ant-abc123-def"), { status: 401 }));
    const checks = await testAiConnection(client as never, "m", { claudeOptions: false });
    expect(checks.every((c) => !c.ok)).toBe(true);
    expect(checks[0].detail).toBe("HTTP 401: invalid x-api-key sk-***");
  });
});
