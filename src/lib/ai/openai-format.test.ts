import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { fromOpenAiResponse, toOpenAiRequest } from "./openai-format";

const PNG = "iVBORw0KGgo=";
const TOOL: Anthropic.Tool = {
  name: "list_services",
  description: "Daftar layanan",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
};

describe("toOpenAiRequest (spec §5.3)", () => {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: "openai/gpt-4.1-mini",
    max_tokens: 800,
    system: [
      { type: "text", text: "Aturan inti", cache_control: { type: "ephemeral" } },
      { type: "text", text: "STATE: kosong" },
    ],
    tools: [TOOL],
    tool_choice: { type: "auto" },
    // Opsi khusus Claude harus dibuang.
    output_config: { effort: "low" },
    messages: [
      { role: "user", content: "halo mau logo" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Sebentar" },
          { type: "tool_use", id: "t1", name: "list_services", input: {} },
          { type: "tool_use", id: "t2", name: "list_services", input: { q: "logo" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: '{"ok":true}' },
          { type: "tool_result", tool_use_id: "t2", content: "gagal", is_error: true },
          { type: "text", text: "lanjut" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
        ],
      },
    ],
  };
  const out = toOpenAiRequest(params);

  it("system digabung jadi satu pesan, tanpa cache_control dan opsi Claude", () => {
    expect(out.messages[0]).toEqual({ role: "system", content: "Aturan inti\n\nSTATE: kosong" });
    expect(JSON.stringify(out)).not.toContain("cache_control");
    expect(out).not.toHaveProperty("output_config");
    expect(out).toMatchObject({ model: "openai/gpt-4.1-mini", max_tokens: 800, tool_choice: "auto" });
  });

  it("tools jadi function", () => {
    expect(out.tools).toEqual([
      { type: "function", function: { name: "list_services", description: "Daftar layanan", parameters: TOOL.input_schema } },
    ]);
  });

  it("assistant teks + beberapa tool_use → satu pesan dengan tool_calls (argumen string JSON)", () => {
    expect(out.messages[2]).toEqual({
      role: "assistant",
      content: "Sebentar",
      tool_calls: [
        { id: "t1", type: "function", function: { name: "list_services", arguments: "{}" } },
        { id: "t2", type: "function", function: { name: "list_services", arguments: '{"q":"logo"}' } },
      ],
    });
  });

  it("hasil tool tepat setelah tool_calls, lalu sisa konten user terpisah (Review Focus 4)", () => {
    expect(out.messages.slice(3)).toEqual([
      { role: "tool", tool_call_id: "t1", content: '{"ok":true}' },
      { role: "tool", tool_call_id: "t2", content: "Error: gagal" },
      {
        role: "user",
        content: [
          { type: "text", text: "lanjut" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } },
        ],
      },
    ]);
  });

  it("tool_choice none", () => {
    expect(toOpenAiRequest({ ...params, tool_choice: { type: "none" } }).tool_choice).toBe("none");
  });
});

describe("fromOpenAiResponse", () => {
  it("tool_calls → tool_use, alasan berhenti dan usage", () => {
    const msg = fromOpenAiResponse(
      {
        choices: [
          {
            message: { content: null, tool_calls: [{ id: "c1", function: { name: "save_color", arguments: '{"color":"coklat"}' } }] },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      "m",
    );
    expect(msg.content).toEqual([{ type: "tool_use", id: "c1", name: "save_color", input: { color: "coklat" } }]);
    expect(msg.stop_reason).toBe("tool_use");
    expect(msg.usage).toMatchObject({ input_tokens: 10, output_tokens: 5 });
    expect(msg).toMatchObject({ role: "assistant", model: "m", type: "message" });
  });

  it("argumen JSON rusak → input {}", () => {
    const msg = fromOpenAiResponse({ choices: [{ message: { tool_calls: [{ id: "c1", function: { name: "x", arguments: "{rusak" } }] }, finish_reason: "tool_calls" }] }, "m");
    expect(msg.content[0]).toMatchObject({ type: "tool_use", input: {} });
  });

  it.each([
    ["length", "max_tokens"],
    ["stop", "end_turn"],
    ["content_filter", "refusal"],
  ])("finish_reason %s → %s", (finish, stop) => {
    const msg = fromOpenAiResponse({ choices: [{ message: { content: "hai" }, finish_reason: finish }] }, "m");
    expect(msg.stop_reason).toBe(stop);
    expect(msg.content).toEqual([{ type: "text", text: "hai" }]);
  });

  it("tanpa choices → OPENAI_BAD_RESPONSE", () => {
    expect(() => fromOpenAiResponse({ error: "x" }, "m")).toThrow("OPENAI_BAD_RESPONSE");
  });
});
