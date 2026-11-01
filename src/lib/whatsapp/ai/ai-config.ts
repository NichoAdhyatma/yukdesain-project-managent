import Anthropic from "@anthropic-ai/sdk";
import { isIP } from "node:net";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getWhatsAppEnv } from "../env";

// Konfigurasi AI efektif: nilai dari Settings (DB) jika diisi owner, selain itu
// default dari env. API key selalu dari env dan tidak pernah disimpan di DB.

export type AiConfig = {
  model: string;
  extractionModel: string;
  baseUrl: string;
  maxTokens: number;
};

// Hanya model Claude (keputusan owner: AI = Claude, format Anthropic Messages API).
export const aiModelSchema = z
  .string()
  .trim()
  .regex(/^claude-[a-z0-9][a-z0-9.@-]{2,80}$/, 'Harus ID model Claude, mis. "claude-haiku-5-5"');

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return true;
  }
  const v = isIP(host);
  if (v === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (v === 6) return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  return false;
}

// Base URL dari Settings: https, bukan alamat internal (server yang memanggilnya).
export const aiBaseUrlSchema = z
  .url({ protocol: /^https$/, error: "Harus URL https" })
  // zod v4 tetap menjalankan refine walau format URL gagal → jangan sampai melempar.
  .refine((u) => URL.canParse(u) && !isPrivateHost(new URL(u).hostname), "Alamat internal/lokal tidak diizinkan")
  .transform((u) => u.replace(/\/+$/, ""));

export async function getAiConfig(): Promise<AiConfig> {
  const env = getWhatsAppEnv();
  // Dibaca tanpa cache: perubahan dari Settings langsung berlaku.
  const settings = await prisma.studioSettings.findUnique({
    where: { id: "default" },
    select: { waAiModel: true, waAiExtractionModel: true, waAiBaseUrl: true },
  });
  return {
    model: settings?.waAiModel || env.WA_AI_MODEL,
    extractionModel: settings?.waAiExtractionModel || env.WA_AI_EXTRACTION_MODEL,
    baseUrl: settings?.waAiBaseUrl || env.ANTHROPIC_BASE_URL,
    maxTokens: env.WA_AI_MAX_TOKENS,
  };
}

const clients = new Map<string, Anthropic>();

/** Satu klien per base URL. baseURL selalu eksplisit (SDK tidak membaca env sendiri). */
export function getAnthropicClient(baseUrl: string): Anthropic {
  let client = clients.get(baseUrl);
  if (!client) {
    client = new Anthropic({ apiKey: getWhatsAppEnv().ANTHROPIC_API_KEY, baseURL: baseUrl, timeout: 30_000, maxRetries: 2 });
    clients.set(baseUrl, client);
  }
  return client;
}
