import type Anthropic from "@anthropic-ai/sdk";
import type { AiClient } from "@/lib/ai/client";
import { maskSecrets } from "@/lib/ai/key-crypto";
import { modelRequestOptions } from "./model-profile";

// Uji model dari Bot AI › Model: pastikan provider + model mendukung yang dipakai bot (teks, tool use, gambar).
// Request kecil, tanpa data klien.

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
  const e = error as { status?: number | null; message?: string };
  const message = maskSecrets(String(e.message ?? "Error")).slice(0, 200);
  return e.status && !message.startsWith("HTTP ") ? `HTTP ${e.status}: ${message}` : message;
}

const hasText = (r: Anthropic.Message) => (r.content.some((b) => b.type === "text" && b.text.trim()) ? null : "Tidak ada jawaban teks");

/**
 * Tes satu model di satu provider (docs/AI_PROVIDERS.md): Koneksi (teks pendek), Tool use (bot memakai tool),
 * Gambar (bukti transfer). `claudeOptions` = kirim opsi khusus Claude (hanya format Anthropic + model claude-…).
 */
export async function testAiConnection(client: AiClient, model: string, opts: { claudeOptions: boolean }): Promise<ConnectionCheck[]> {
  const base = { model, max_tokens: 300, ...(opts.claudeOptions ? modelRequestOptions(model) : {}) };
  const checks: ConnectionCheck[] = [];

  const run = async (name: string, request: Anthropic.MessageCreateParamsNonStreaming, verify: (r: Anthropic.Message) => string | null) => {
    try {
      const response = await client.create(request);
      const problem = verify(response);
      checks.push({ name, ok: !problem, detail: problem ?? `OK (${response.stop_reason})` });
    } catch (error) {
      checks.push({ name, ok: false, detail: describeError(error) });
    }
  };

  await run("Koneksi", { ...base, messages: [{ role: "user", content: "Balas dengan satu kata: siap" }] }, hasText);

  // Tool use bolak-balik seperti bot: model memanggil tool, hasil tool dikirim balik, model harus menjawab teks.
  // Menguji juga terjemahan hasil tool (format OpenAI: pesan role "tool").
  try {
    const first: Anthropic.MessageCreateParamsNonStreaming = {
      ...base,
      system: "Kamu asisten uji koneksi. Gunakan tool save_color untuk menyimpan warna yang disebut pengguna, lalu konfirmasi singkat.",
      tools: [PING_TOOL],
      messages: [{ role: "user", content: "Warna favorit saya coklat." }],
    };
    const r1 = await client.create(first);
    const use = r1.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "save_color");
    if (!use || r1.stop_reason !== "tool_use") {
      checks.push({ name: "Tool use", ok: false, detail: "Model tidak memanggil tool" });
    } else {
      const r2 = await client.create({
        ...first,
        messages: [
          ...first.messages,
          { role: "assistant", content: r1.content },
          { role: "user", content: [{ type: "tool_result", tool_use_id: use.id, content: '{"saved":true}' }] },
        ],
      });
      const problem = hasText(r2);
      checks.push({ name: "Tool use", ok: !problem, detail: problem ? "Model tidak menjawab setelah hasil tool" : "OK (tool + jawaban)" });
    }
  } catch (error) {
    checks.push({ name: "Tool use", ok: false, detail: describeError(error) });
  }

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
    hasText,
  );

  return checks;
}
