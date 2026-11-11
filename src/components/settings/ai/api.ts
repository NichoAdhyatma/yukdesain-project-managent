// Klien API halaman Bot AI › Model (docs/AI_PROVIDERS.md). Key tidak pernah dikirim balik oleh server.

export type ProviderFormat = "ANTHROPIC" | "OPENAI";
export type AiUsage = "chat" | "proof" | "fallback";
export type AiTarget = { providerKey: string; model: string };

export type Provider = {
  key: string;
  name: string;
  format: ProviderFormat;
  baseUrl: string;
  keyHint: string | null;
  builtIn: boolean;
  credentialVersion: string;
  configured: boolean;
};

export type Check = { name: string; ok: boolean; detail: string };

export type ModelTest = {
  model: string;
  connectionOk: boolean;
  toolsOk: boolean;
  imageOk: boolean;
  details: Check[] | null;
  testedAt: string;
  stale: boolean;
  usages: AiUsage[];
};

export type AiProvidersData = {
  providers: Provider[];
  tests: Record<string, ModelTest[]>;
  usage: Record<AiUsage, AiTarget | null>;
  effective: { chat: AiTarget; proof: AiTarget; fallback: AiTarget | null };
  defaults: { chat: AiTarget; proof: AiTarget };
  cryptoReady: boolean;
};

export const AI_PROVIDERS_KEY = ["ai-providers"] as const;

export const USAGE_LABELS: Record<AiUsage, string> = { chat: "Chat", proof: "Baca bukti transfer", fallback: "Cadangan" };
export const FORMAT_LABELS: Record<ProviderFormat, string> = { ANTHROPIC: "Anthropic Messages", OPENAI: "OpenAI Chat Completions" };

export class AiApiError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new AiApiError(body.message ?? "Permintaan gagal. Coba lagi.", body.fields ?? {});
  return body as T;
}

export const fetchAiProviders = () => call<AiProvidersData>("/api/settings/whatsapp/ai-providers");

export type ProviderInput = { name: string; format: ProviderFormat; baseUrl: string; apiKey?: string };

export const createProvider = (input: ProviderInput) =>
  call<{ provider: Provider }>("/api/settings/whatsapp/ai-providers", { method: "POST", body: JSON.stringify(input) });

export const updateProvider = (id: string, input: ProviderInput) =>
  call<{ ok: true }>(`/api/settings/whatsapp/ai-providers/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) });

export const deleteProvider = (id: string) =>
  call<{ ok: true }>(`/api/settings/whatsapp/ai-providers/${encodeURIComponent(id)}`, { method: "DELETE" });

export const testModel = (providerKey: string, model: string) =>
  call<{ ok: boolean; checks: Check[] }>("/api/settings/whatsapp/ai-providers/test", {
    method: "POST",
    body: JSON.stringify({ providerKey, model }),
  });

export const fetchModels = (providerKey: string) =>
  call<{ models: string[]; source: "api" | "fallback" }>(`/api/settings/whatsapp/models?providerKey=${encodeURIComponent(providerKey)}`);

export const saveUsage = (usage: Partial<Record<AiUsage, AiTarget | null>>) =>
  call<{ ok: true }>("/api/settings/whatsapp/ai-providers/usage", { method: "PUT", body: JSON.stringify(usage) });

/** "db:abc" → "abc" untuk route [id]. */
export const dbId = (providerKey: string) => providerKey.replace(/^db:/, "");
