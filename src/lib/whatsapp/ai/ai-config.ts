import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAiEnv, getProviderEnv, type AiProvider } from "../env";
import { aiModelIdSchema, resolveProvider } from "@/lib/ai/providers";
import type { AiTarget } from "@/lib/ai/fallback";

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

// Semua model yang lulus tes (keputusan owner 2026-11-11, docs/AI_PROVIDERS.md); sebelumnya hanya claude-….
export const aiModelSchema = aiModelIdSchema;

export const aiProviderSchema = z.enum(["ANTHROPIC", "GATEWAY"]);

export class AiNotConfiguredError extends Error {
  constructor(readonly provider: AiProvider) {
    super(`API key provider ${provider} belum diisi di server`);
    this.name = "AiNotConfiguredError";
  }
}

const settingsSelect = {
  aiChatProviderKey: true,
  aiChatModel: true,
  aiProofProviderKey: true,
  aiProofModel: true,
  aiFallbackProviderKey: true,
  aiFallbackModel: true,
  waAiProvider: true,
  waAiModel: true,
  waAiExtractionModel: true,
  waAiGatewayModel: true,
  waAiGatewayExtractionModel: true,
} as const;

export type AiSettingsRow = {
  aiChatProviderKey?: string | null;
  aiChatModel?: string | null;
  aiProofProviderKey?: string | null;
  aiProofModel?: string | null;
  aiFallbackProviderKey?: string | null;
  aiFallbackModel?: string | null;
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

/**
 * Target AI per pemakaian (docs/AI_PROVIDERS.md). Kolom pemakaian kosong = jalur lama: provider env pilihan
 * (waAiProvider) dengan model pilihan owner atau default env. Provider baru dibuka saat dipanggil (fallback.ts).
 */
/** Bawaan server (jalur lama) untuk Chat dan Bukti transfer: provider env pilihan + model pilihan / default env. */
export function defaultTargets(row: AiSettingsRow | null): { chat: AiTarget; proof: AiTarget } {
  const legacyProvider = providerOf(row);
  const env = getProviderEnv(legacyProvider);
  const overrides = modelOverrides(row, legacyProvider);
  const providerKey = `env:${legacyProvider}`;
  return {
    chat: { providerKey, model: overrides.model || env.defaultModel },
    proof: { providerKey, model: overrides.extractionModel || env.defaultExtractionModel },
  };
}

export async function getAiTargets(): Promise<{ chat: AiTarget; proof: AiTarget; fallback: AiTarget | null; maxTokens: number }> {
  const row = await getAiSettingsRow();
  const defaults = defaultTargets(row);
  const pick = (key: string | null | undefined, model: string | null | undefined): AiTarget | null =>
    key && model ? { providerKey: key, model } : null;
  return {
    chat: pick(row?.aiChatProviderKey, row?.aiChatModel) ?? defaults.chat,
    proof: pick(row?.aiProofProviderKey, row?.aiProofModel) ?? defaults.proof,
    fallback: pick(row?.aiFallbackProviderKey, row?.aiFallbackModel),
    maxTokens: getAiEnv().WA_AI_MAX_TOKENS,
  };
}

/** Provider Chat bisa dipakai (key ada / bisa dibuka): Uji bot bisa jalan. */
export async function isAiReady(): Promise<boolean> {
  try {
    await resolveProvider((await getAiTargets()).chat.providerKey);
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
