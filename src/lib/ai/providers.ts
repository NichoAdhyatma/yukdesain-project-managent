import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getProviderEnv, type AiProvider as EnvProvider } from "@/lib/whatsapp/env";
import { decryptApiKey, isKeyCryptoReady } from "./key-crypto";

// Provider AI: bawaan dari env (key tetap di env) dan buatan owner di portal (key terenkripsi di DB).
// docs/AI_PROVIDERS.md. Key tidak pernah ada di ProviderSummary (yang boleh dikirim ke browser).

export type ProviderFormat = "ANTHROPIC" | "OPENAI";
export const PROVIDER_FORMATS = ["ANTHROPIC", "OPENAI"] as const;

export type ProviderSummary = {
  key: string;
  name: string;
  format: ProviderFormat;
  baseUrl: string;
  keyHint: string | null;
  builtIn: boolean;
  credentialVersion: string;
  configured: boolean;
};

export type ResolvedProvider = Omit<ProviderSummary, "keyHint" | "configured"> & { apiKey: string };

export class AiProviderUnavailableError extends Error {
  constructor(
    readonly providerKey: string,
    message: string,
  ) {
    super(message);
    this.name = "AiProviderUnavailableError";
  }
}

const ENV_PROVIDERS: EnvProvider[] = ["ANTHROPIC", "GATEWAY"];

/** Buang garis miring akhir dan path endpoint yang ikut ditempel owner. */
export function normalizeBaseUrl(url: string, format: ProviderFormat): string {
  let out = url.trim().replace(/\/+$/, "");
  const suffix = format === "OPENAI" ? /\/chat\/completions$/i : /\/v1\/messages$/i;
  out = out.replace(suffix, "").replace(/\/+$/, "");
  return out;
}

const LOCAL_HTTP = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

export const aiModelIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/@-]{1,119}$/, "ID model tidak valid (mis. claude-haiku-5-5, openai/gpt-4.1-mini)");

export const providerInputSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(60, "Maksimal 60 karakter"),
  format: z.enum(PROVIDER_FORMATS),
  baseUrl: z
    .string()
    .trim()
    .refine((u) => /^https:\/\/[^\s/]+/i.test(u) || LOCAL_HTTP.test(u), "Harus https:// (http hanya untuk localhost)"),
  // Wajib saat membuat; saat edit, kosong = key tidak diubah.
  apiKey: z.string().trim().min(8, "API key terlalu pendek").max(400, "API key terlalu panjang").optional(),
});

export function credentialVersionOf(p: { key: string; baseUrl: string; updatedAt: Date | null; keyTail?: string }): string {
  return createHash("sha256")
    .update(`${p.key}|${p.baseUrl}|${p.updatedAt?.toISOString() ?? ""}|${p.keyTail ?? ""}`)
    .digest("hex")
    .slice(0, 12);
}

function envProvider(provider: EnvProvider): { summary: ProviderSummary; apiKey: string | null } {
  const env = getProviderEnv(provider);
  const key = `env:${provider}`;
  const summary: ProviderSummary = {
    key,
    name: env.label,
    format: "ANTHROPIC",
    baseUrl: env.baseUrl,
    keyHint: env.apiKey ? `••••${env.apiKey.slice(-4)}` : null,
    builtIn: true,
    // Mengganti key env juga membatalkan hasil tes.
    credentialVersion: credentialVersionOf({ key, baseUrl: env.baseUrl, updatedAt: null, keyTail: env.apiKey?.slice(-4) }),
    configured: !!env.apiKey,
  };
  return { summary, apiKey: env.apiKey };
}

type ProviderRow = { id: string; name: string; format: string; baseUrl: string; apiKeyCiphertext: string; apiKeyLast4: string; updatedAt: Date };

function dbSummary(row: ProviderRow): ProviderSummary {
  const key = `db:${row.id}`;
  return {
    key,
    name: row.name,
    format: row.format === "OPENAI" ? "OPENAI" : "ANTHROPIC",
    baseUrl: row.baseUrl,
    keyHint: `••••${row.apiKeyLast4}`,
    builtIn: false,
    credentialVersion: credentialVersionOf({ key, baseUrl: row.baseUrl, updatedAt: row.updatedAt }),
    configured: isKeyCryptoReady(),
  };
}

function toResolved(s: ProviderSummary, apiKey: string): ResolvedProvider {
  return { key: s.key, name: s.name, format: s.format, baseUrl: s.baseUrl, builtIn: s.builtIn, credentialVersion: s.credentialVersion, apiKey };
}

/** Semua provider untuk ditampilkan; tanpa key. */
export async function listProviders(): Promise<ProviderSummary[]> {
  const rows: ProviderRow[] = await prisma.aiProvider.findMany({ orderBy: { createdAt: "asc" } });
  return [...ENV_PROVIDERS.map((p) => envProvider(p).summary), ...rows.map(dbSummary)];
}

/** Provider siap pakai (dengan key). Melempar AiProviderUnavailableError / KeyCryptoUnavailableError. */
export async function resolveProvider(key: string): Promise<ResolvedProvider> {
  if (key.startsWith("env:")) {
    const provider = key.slice(4) as EnvProvider;
    if (!ENV_PROVIDERS.includes(provider)) throw new AiProviderUnavailableError(key, "Provider tidak dikenal");
    const { summary, apiKey } = envProvider(provider);
    if (!apiKey) throw new AiProviderUnavailableError(key, `API key ${summary.name} belum diisi di server`);
    return toResolved(summary, apiKey);
  }
  const id = key.startsWith("db:") ? key.slice(3) : "";
  const row: ProviderRow | null = id ? await prisma.aiProvider.findUnique({ where: { id } }) : null;
  if (!row) throw new AiProviderUnavailableError(key, "Provider tidak ditemukan");
  return toResolved(dbSummary(row), decryptApiKey(row.apiKeyCiphertext));
}
