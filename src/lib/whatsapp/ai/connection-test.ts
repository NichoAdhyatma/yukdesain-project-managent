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
    hasText,
  );

  return checks;
}
