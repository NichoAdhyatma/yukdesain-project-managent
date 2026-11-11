import type Anthropic from "@anthropic-ai/sdk";

// Penerjemah murni format Anthropic Messages <-> OpenAI Chat Completions (spec 2026-11-11 §5.3).
// Format internal bot tetap Anthropic; provider berformat OPENAI memakai terjemahan ini. Tanpa I/O.

export type OpenAiChatRequest = {
  model: string;
  messages: unknown[];
  max_tokens: number;
  tools?: unknown[];
  tool_choice?: "auto" | "none";
};

type Block = Anthropic.ContentBlockParam;

function systemText(system: Anthropic.MessageCreateParamsNonStreaming["system"]): string | null {
  if (!system) return null;
  if (typeof system === "string") return system;
  return system.map((b) => b.text).join("\n\n");
}

function toolResultText(content: Anthropic.ToolResultBlockParam["content"]): string {
  if (content === undefined) return "";
  if (typeof content === "string") return content;
  return content.map((b) => (b.type === "text" ? b.text : `[${b.type}]`)).join("\n");
}

function imagePart(block: Anthropic.ImageBlockParam) {
  const src = block.source;
  const url = src.type === "base64" ? `data:${src.media_type};base64,${src.data}` : src.type === "url" ? src.url : "";
  return { type: "image_url", image_url: { url } };
}

function convertMessage(message: Anthropic.MessageParam): unknown[] {
  const blocks: Block[] = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;

  if (message.role === "assistant") {
    const text = blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    const toolCalls = blocks.flatMap((b) =>
      b.type === "tool_use" ? [{ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }] : [],
    );
    return [{ role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }];
  }

  // User: hasil tool harus tepat setelah tool_calls assistant, lalu sisa konten sebagai pesan user terpisah.
  const out: unknown[] = [];
  for (const b of blocks) {
    if (b.type === "tool_result") {
      const text = toolResultText(b.content);
      out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.is_error ? `Error: ${text}` : text });
    }
  }
  type Part = { type: "text"; text: string } | ReturnType<typeof imagePart>;
  const parts = blocks.flatMap((b): Part[] => (b.type === "text" ? [{ type: "text", text: b.text }] : b.type === "image" ? [imagePart(b)] : []));
  const [only] = parts;
  if (parts.length === 1 && only.type === "text" && "text" in only) out.push({ role: "user", content: only.text });
  else if (parts.length) out.push({ role: "user", content: parts });
  return out;
}

export function toOpenAiRequest(params: Anthropic.MessageCreateParamsNonStreaming): OpenAiChatRequest {
  const system = systemText(params.system);
  const request: OpenAiChatRequest = {
    model: params.model,
    max_tokens: params.max_tokens,
    messages: [...(system ? [{ role: "system", content: system }] : []), ...params.messages.flatMap(convertMessage)],
  };
  const tools = (params.tools ?? []).flatMap((t) =>
    "input_schema" in t ? [{ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }] : [],
  );
  if (tools.length) request.tools = tools;
  if (params.tool_choice) request.tool_choice = params.tool_choice.type === "none" ? "none" : "auto";
  return request;
}

const STOP_REASONS: Record<string, Anthropic.StopReason> = {
  tool_calls: "tool_use",
  function_call: "tool_use",
  length: "max_tokens",
  stop: "end_turn",
  content_filter: "refusal",
};

type OpenAiResponse = {
  id?: string;
  choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments?: string } }[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function fromOpenAiResponse(body: unknown, model: string): Anthropic.Message {
  const res = body as OpenAiResponse;
  const choice = res?.choices?.[0];
  if (!choice?.message) throw new Error("OPENAI_BAD_RESPONSE");
  const content: Anthropic.ContentBlock[] = [];
  if (choice.message.content) content.push({ type: "text", text: choice.message.content } as Anthropic.TextBlock);
  for (const call of choice.message.tool_calls ?? []) {
    content.push({ type: "tool_use", id: call.id, name: call.function.name, input: parseArgs(call.function.arguments) } as Anthropic.ToolUseBlock);
  }
  return {
    id: res.id ?? "openai",
    type: "message",
    role: "assistant",
    model,
    content,
    // Beberapa backend kompatibel OpenAI mengirim finish_reason "stop" bersama tool_calls; tool_calls yang menentukan.
    stop_reason: choice.message.tool_calls?.length ? "tool_use" : (STOP_REASONS[choice.finish_reason ?? "stop"] ?? "end_turn"),
    stop_sequence: null,
    usage: { input_tokens: res.usage?.prompt_tokens ?? 0, output_tokens: res.usage?.completion_tokens ?? 0 },
  } as Anthropic.Message;
}
