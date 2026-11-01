import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("./ai-config", () => ({ getAnthropicClient: () => ({ messages: { create } }) }));

import { testAiConnection } from "./connection-test";

const config = { model: "claude-sonnet-4-6", extractionModel: "x", baseUrl: "https://gw.example", maxTokens: 800 };

beforeEach(() => vi.clearAllMocks());

describe("testAiConnection", () => {
  it("dua pemeriksaan lolos", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "save_color", input: {} }] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "coklat" }] });
    const checks = await testAiConnection(config);
    expect(checks.map((c) => [c.name, c.ok])).toEqual([
      ["Tool use", true],
      ["Gambar", true],
    ]);
    // effort dikirim karena Sonnet 4.6 mendukungnya; request gambar membawa PNG base64
    expect(create.mock.calls[0][0].output_config).toEqual({ effort: "low" });
    expect(create.mock.calls[1][0].messages[0].content[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/png" },
    });
  });

  it("model tidak memanggil tool → gagal dengan keterangan", async () => {
    create
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "oke" }] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "coklat" }] });
    const [tool] = await testAiConnection(config);
    expect(tool).toEqual({ name: "Tool use", ok: false, detail: "Model tidak memanggil tool" });
  });

  it("error API: status ditampilkan, key disamarkan", async () => {
    create.mockRejectedValue(Object.assign(new Error("invalid x-api-key sk-ant-abc123-def"), { status: 401 }));
    const checks = await testAiConnection(config);
    expect(checks.every((c) => !c.ok)).toBe(true);
    expect(checks[0].detail).toBe("HTTP 401: invalid x-api-key sk-***");
  });
});
