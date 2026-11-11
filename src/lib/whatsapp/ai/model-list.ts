import { aiModelIdSchema, type ResolvedProvider } from "@/lib/ai/providers";

// Daftar model untuk Bot AI › Model: dari endpoint daftar model provider, dengan cadangan statis untuk provider
// bawaan env bila endpoint tidak bisa dihubungi (docs/AI_PROVIDERS.md).

const FALLBACK: Record<string, string[]> = {
  "env:ANTHROPIC": ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-sonnet-4-6", "claude-haiku-4-5"],
  "env:GATEWAY": ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-3-5-sonnet"],
};

export const fallbackModels = (providerKey: string): string[] => FALLBACK[providerKey] ?? [];

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; models: string[] }>();

export type ModelList = { models: string[]; source: "api" | "fallback" };

/** Kandidat URL format Anthropic: di bawah base URL (API resmi) lalu di root host (gateway: /v1/models di root). */
export function modelListUrls(baseUrl: string): string[] {
  const urls = [`${baseUrl}/v1/models?limit=100`, `${new URL(baseUrl).origin}/v1/models?limit=100`];
  return [...new Set(urls)];
}

export function parseModelIds(body: unknown): string[] {
  const data = (body as { data?: { id?: unknown }[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data.map((m) => m?.id).filter((id): id is string => typeof id === "string" && aiModelIdSchema.safeParse(id).success);
}

export async function listModels(provider: ResolvedProvider, fetchImpl: typeof fetch = fetch): Promise<ModelList> {
  const cacheKey = `${provider.key}|${provider.credentialVersion}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) return { models: cached.models, source: "api" };

  const requests: [string, Record<string, string>][] =
    provider.format === "OPENAI"
      ? [[`${provider.baseUrl}/models`, { Authorization: `Bearer ${provider.apiKey}` }]]
      : modelListUrls(provider.baseUrl).map((url) => [url, { "x-api-key": provider.apiKey, "anthropic-version": "2023-06-01" }]);

  for (const [url, headers] of requests) {
    try {
      const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const models = parseModelIds(await res.json());
      if (models.length) {
        cache.set(cacheKey, { at: Date.now(), models });
        return { models, source: "api" };
      }
    } catch {
      // coba URL berikutnya, lalu cadangan
    }
  }
  return { models: fallbackModels(provider.key), source: "fallback" };
}

export function clearModelListCache() {
  cache.clear();
}
