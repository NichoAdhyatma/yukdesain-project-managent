import Anthropic from "@anthropic-ai/sdk";
import { KeyCryptoUnavailableError, maskSecrets } from "./key-crypto";
import { fromOpenAiResponse, toOpenAiRequest } from "./openai-format";
import { AiProviderUnavailableError, type ResolvedProvider } from "./providers";

// Satu antarmuka untuk semua provider (spec 2026-11-11 §5.1): masuk dan keluar dalam format Anthropic Messages.

export interface AiClient {
  create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
}

const TIMEOUT_MS = 30_000;

/** Error dari provider; pesan sudah disamarkan. status null = jaringan/timeout. */
export class AiProviderError extends Error {
  readonly retriable: boolean;
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "AiProviderError";
    this.retriable = isTechnicalStatus(status);
  }
}

const isTechnicalStatus = (status: number | null) => status === null || status >= 500 || [401, 403, 429].includes(status);

/** Kegagalan teknis = boleh pindah ke provider cadangan (spec §5.5). Jawaban jelek bukan kegagalan teknis. */
export function isTechnicalFailure(error: unknown): boolean {
  if (error instanceof AiProviderError) return isTechnicalStatus(error.status);
  if (error instanceof AiProviderUnavailableError || error instanceof KeyCryptoUnavailableError) return true;
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (error instanceof Anthropic.APIError) return isTechnicalStatus(error.status ?? null);
  return false;
}

const anthropicClients = new Map<string, Anthropic>();

function anthropicClient(provider: ResolvedProvider): AiClient {
  const cacheKey = `${provider.key}|${provider.baseUrl}|${provider.credentialVersion}`;
  let client = anthropicClients.get(cacheKey);
  if (!client) {
    client = new Anthropic({ apiKey: provider.apiKey, baseURL: provider.baseUrl, timeout: TIMEOUT_MS, maxRetries: 2 });
    anthropicClients.set(cacheKey, client);
  }
  const sdk = client;
  return {
    async create(params) {
      try {
        return await sdk.messages.create(params);
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          throw new AiProviderError(maskSecrets(`HTTP ${error.status ?? "?"}: ${error.message}`, [provider.apiKey]).slice(0, 300), error.status ?? null);
        }
        throw error;
      }
    },
  };
}

function openAiClient(provider: ResolvedProvider): AiClient {
  return {
    async create(params) {
      let res: Response;
      try {
        res = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
          body: JSON.stringify(toOpenAiRequest(params)),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        throw new AiProviderError(maskSecrets(`Koneksi gagal: ${(error as Error).message}`, [provider.apiKey]), null);
      }
      let text: string;
      try {
        // Timeout bisa terjadi setelah header (mis. OpenRouter mengirim header lebih dulu): tetap kegagalan teknis.
        text = await res.text();
      } catch (error) {
        throw new AiProviderError(maskSecrets(`Jawaban terputus: ${(error as Error).message}`, [provider.apiKey]), null);
      }
      if (!res.ok) throw new AiProviderError(maskSecrets(`HTTP ${res.status}: ${text}`, [provider.apiKey]).slice(0, 300), res.status);
      // HTTP 200 tanpa jawaban yang sah (error dari upstream gateway, choices kosong, bukan JSON) diperlakukan seperti
      // 502: kegagalan teknis, supaya cadangan dipakai.
      const upstream = (detail: string) => new AiProviderError(maskSecrets(`Jawaban provider tidak sah: ${detail}`, [provider.apiKey]).slice(0, 300), 502);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw upstream(text.slice(0, 120));
      }
      const parsed = body as { error?: unknown; choices?: unknown[] };
      if (parsed?.error || !Array.isArray(parsed?.choices) || parsed.choices.length === 0) throw upstream(JSON.stringify(parsed?.error ?? "tanpa choices"));
      return fromOpenAiResponse(body, params.model);
    },
  };
}

export function getAiClient(provider: ResolvedProvider): AiClient {
  return provider.format === "OPENAI" ? openAiClient(provider) : anthropicClient(provider);
}
