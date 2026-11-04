import { getProviderEnv, type AiProvider } from "../env";

// Daftar model untuk dropdown Settings: dari endpoint /v1/models provider, dengan cadangan
// statis jika endpoint tidak bisa dihubungi. Hanya model Claude.

const FALLBACK: Record<AiProvider, string[]> = {
  ANTHROPIC: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-sonnet-4-6", "claude-haiku-4-5"],
  GATEWAY: ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-3-5-sonnet"],
};

const TTL_MS = 10 * 60_000;
const cache = new Map<AiProvider, { at: number; models: string[] }>();

export type ModelList = { models: string[]; source: "api" | "fallback" };

/** Kandidat URL: di bawah base URL (API resmi) lalu di root host (gateway: /v1/models di root). */
export function modelListUrls(baseUrl: string): string[] {
  const urls = [`${baseUrl}/v1/models?limit=100`, `${new URL(baseUrl).origin}/v1/models?limit=100`];
  return [...new Set(urls)];
}

export function parseModelIds(body: unknown): string[] {
  const data = (body as { data?: { id?: unknown }[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => m?.id)
    .filter((id): id is string => typeof id === "string" && /^claude-[a-z0-9][a-z0-9.@-]{2,80}$/.test(id));
}

export async function listModels(provider: AiProvider, fetchImpl: typeof fetch = fetch): Promise<ModelList> {
  const cached = cache.get(provider);
  if (cached && Date.now() - cached.at < TTL_MS) return { models: cached.models, source: "api" };

  const env = getProviderEnv(provider);
  if (!env.apiKey) return { models: FALLBACK[provider], source: "fallback" };

  for (const url of modelListUrls(env.baseUrl)) {
    try {
      const res = await fetchImpl(url, {
        headers: { "x-api-key": env.apiKey, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const models = parseModelIds(await res.json());
      if (models.length) {
        cache.set(provider, { at: Date.now(), models });
        return { models, source: "api" };
      }
    } catch {
      // coba URL berikutnya, lalu cadangan
    }
  }
  return { models: FALLBACK[provider], source: "fallback" };
}

export function clearModelListCache() {
  cache.clear();
}
