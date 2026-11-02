import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAiEnv, getProviderEnv, type AiProvider } from "../env";

// Konfigurasi AI efektif: provider dan model dari Settings (DB) jika dipilih owner, selain itu
// default dari env. API key selalu dari env dan tidak pernah disimpan di DB.

export type AiConfig = {
  provider: AiProvider;
  label: string;
  model: string;
  extractionModel: string;
  baseUrl: string;
  apiKey: string;
  maxTokens: number;
};

// Hanya model Claude (keputusan owner: AI = Claude, format Anthropic Messages API).
export const aiModelSchema = z
  .string()
  .trim()
  .regex(/^claude-[a-z0-9][a-z0-9.@-]{2,80}$/, 'Harus ID model Claude, mis. "claude-haiku-5-5"');

export const aiProviderSchema = z.enum(["ANTHROPIC", "GATEWAY"]);

export class AiNotConfiguredError extends Error {
  constructor(readonly provider: AiProvider) {
    super(`API key provider ${provider} belum diisi di server`);
    this.name = "AiNotConfiguredError";
  }
}

const settingsSelect = {
  waAiProvider: true,
  waAiModel: true,
  waAiExtractionModel: true,
  waAiGatewayModel: true,
  waAiGatewayExtractionModel: true,
} as const;

export type AiSettingsRow = {
  waAiProvider: string;
  waAiModel: string | null;
  waAiExtractionModel: string | null;
  waAiGatewayModel: string | null;
  waAiGatewayExtractionModel: string | null;
};

export function providerOf(row: Pick<AiSettingsRow, "waAiProvider"> | null): AiProvider {
  return row?.waAiProvider === "GATEWAY" ? "GATEWAY" : "ANTHROPIC";
}

/** Model pilihan owner untuk provider tertentu (null = default env). */
export function modelOverrides(row: AiSettingsRow | null, provider: AiProvider) {
  return provider === "GATEWAY"
    ? { model: row?.waAiGatewayModel ?? null, extractionModel: row?.waAiGatewayExtractionModel ?? null }
    : { model: row?.waAiModel ?? null, extractionModel: row?.waAiExtractionModel ?? null };
}

export async function getAiSettingsRow(): Promise<AiSettingsRow | null> {
  // Dibaca tanpa cache: perubahan dari Settings langsung berlaku.
  return prisma.studioSettings.findUnique({ where: { id: "default" }, select: settingsSelect });
}

/** Melempar AiNotConfiguredError jika key provider aktif belum ada di env. */
export async function getAiConfig(): Promise<AiConfig> {
  const row = await getAiSettingsRow();
  const provider = providerOf(row);
  const env = getProviderEnv(provider);
  if (!env.apiKey) throw new AiNotConfiguredError(provider);
  const overrides = modelOverrides(row, provider);
  return {
    provider,
    label: env.label,
    model: overrides.model || env.defaultModel,
    extractionModel: overrides.extractionModel || env.defaultExtractionModel,
    baseUrl: env.baseUrl,
    apiKey: env.apiKey,
    maxTokens: getAiEnv().WA_AI_MAX_TOKENS,
  };
}

/** Provider aktif punya key: Uji bot / Uji koneksi bisa jalan. */
export async function isAiReady(): Promise<boolean> {
  try {
    await getAiConfig();
    return true;
  } catch {
    return false;
  }
}

const clients = new Map<string, Anthropic>();

/** Satu klien per provider + base URL. baseURL dan key selalu eksplisit (SDK tidak membaca env sendiri). */
export function getAnthropicClient(config: Pick<AiConfig, "provider" | "baseUrl" | "apiKey">): Anthropic {
  const key = `${config.provider}:${config.baseUrl}`;
  let client = clients.get(key);
  if (!client) {
    client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl, timeout: 30_000, maxRetries: 2 });
    clients.set(key, client);
  }
  return client;
}
