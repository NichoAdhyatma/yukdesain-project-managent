import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, type AiConfig } from "./ai-config";
import { modelRequestOptions } from "./model-profile";

// Uji koneksi dari Settings: pastikan base URL + key + model mendukung yang dipakai bot
// (system prompt, tool use, gambar) dan model ekstraksi tersedia. Request kecil, tanpa data klien.

export type ConnectionCheck = { name: string; ok: boolean; detail: string };

// PNG 16x16 coklat, cukup untuk memastikan endpoint menerima gambar.
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR42mOMsVJkIAUwMZAIRjWMahg6GgBjawDXUckCVQAAAABJRU5ErkJggg==";

const PING_TOOL: Anthropic.Tool = {
  name: "save_color",
  description: "Simpan warna favorit pengguna",
  input_schema: {
    type: "object",
    properties: { color: { type: "string" } },
    required: ["color"],
    additionalProperties: false,
  },
};

function describeError(error: unknown): string {
  const e = error as { status?: number; message?: string };
  const message = String(e.message ?? "Error").replace(/sk-[\w-]+/g, "sk-***").slice(0, 200);
  return e.status ? `HTTP ${e.status}: ${message}` : message;
}

export async function testAiConnection(config: AiConfig): Promise<ConnectionCheck[]> {
  const client = getAnthropicClient(config.baseUrl);
  const base = { model: config.model, max_tokens: 300, ...modelRequestOptions(config.model) };
  const checks: ConnectionCheck[] = [];

  const run = async (name: string, request: Anthropic.MessageCreateParamsNonStreaming, verify: (r: Anthropic.Message) => string | null) => {
    try {
      const response = await client.messages.create(request);
      const problem = verify(response);
      checks.push({ name, ok: !problem, detail: problem ?? `OK (${response.stop_reason})` });
    } catch (error) {
      checks.push({ name, ok: false, detail: describeError(error) });
    }
  };

  await run(
    "Tool use",
    {
      ...base,
      system: "Kamu asisten uji koneksi. Gunakan tool save_color untuk menyimpan warna yang disebut pengguna.",
      tools: [PING_TOOL],
      messages: [{ role: "user", content: "Warna favorit saya coklat." }],
    },
    (r) => (r.content.some((b) => b.type === "tool_use" && b.name === "save_color") ? null : "Model tidak memanggil tool"),
  );

  await run(
    "Gambar",
    {
      ...base,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: TINY_PNG } },
            { type: "text", text: "Sebutkan warna gambar ini dalam satu kata." },
          ],
        },
      ],
    },
    (r) => (r.content.some((b) => b.type === "text" && b.text.trim()) ? null : "Tidak ada jawaban teks"),
  );

  // Bukti transfer dibaca model ekstraksi; pastikan model itu juga tersedia di endpoint ini.
  if (config.extractionModel !== config.model) {
    await run(
      "Model ekstraksi",
      {
        model: config.extractionModel,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: TINY_PNG } },
              { type: "text", text: "Sebutkan warna gambar ini dalam satu kata." },
            ],
          },
        ],
      },
      (r) => (r.content.some((b) => b.type === "text" && b.text.trim()) ? null : "Tidak ada jawaban teks"),
    );
  }

  return checks;
}
