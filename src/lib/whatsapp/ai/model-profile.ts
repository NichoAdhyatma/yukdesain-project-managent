// Adapter kemampuan per model Claude. Bot hanya memakai fitur yang didukung semua
// model Claude (system prompt, tools, gambar, tool_choice auto/none); fitur yang
// berbeda antar-model diputuskan di sini supaya model bisa diganti lewat Settings.

export type ClaudeFamily = "opus" | "sonnet" | "haiku" | "fable" | "mythos";

export type ModelProfile = {
  family: ClaudeFamily | null;
  version: number | null; // mis. 4.6, 5.5; null jika tidak dikenali
  // output_config.effort: ditolak oleh Haiku 4.5 / Sonnet 4.5 / model lama
  supportsEffort: boolean;
};

const FAMILY_FIRST = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:[-@]|$)/;
const VERSION_FIRST = /^claude-(\d+)(?:-(\d{1,2}))?-(opus|sonnet|haiku)(?:[-@]|$)/; // claude-3-5-sonnet

export function parseClaudeModel(model: string): { family: ClaudeFamily; version: number } | null {
  const id = model.trim().toLowerCase();
  const a = id.match(FAMILY_FIRST);
  if (a) return { family: a[1] as ClaudeFamily, version: Number(`${a[2]}.${a[3] ?? 0}`) };
  const b = id.match(VERSION_FIRST);
  if (b) return { family: b[3] as ClaudeFamily, version: Number(`${b[1]}.${b[2] ?? 0}`) };
  return null;
}

function effortSupported(family: ClaudeFamily, version: number): boolean {
  if (family === "fable" || family === "mythos") return true;
  if (version >= 5) return true;
  if (family === "opus") return version >= 4.5;
  if (family === "sonnet") return version >= 4.6;
  return false; // haiku 4.x dan lebih lama
}

/** Model tak dikenal → profil paling aman (tanpa parameter opsional). */
export function getModelProfile(model: string): ModelProfile {
  const parsed = parseClaudeModel(model);
  if (!parsed) return { family: null, version: null, supportsEffort: false };
  return { ...parsed, supportsEffort: effortSupported(parsed.family, parsed.version) };
}

/** Parameter tambahan untuk messages.create sesuai kemampuan model. */
export function modelRequestOptions(model: string): { output_config?: { effort: "low" } } {
  return getModelProfile(model).supportsEffort ? { output_config: { effort: "low" } } : {};
}
