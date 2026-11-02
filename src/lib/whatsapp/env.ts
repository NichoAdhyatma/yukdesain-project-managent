import { z } from "zod";

// Satu-satunya tempat kode WhatsApp/AI membaca process.env (docs/WHATSAPP_AI_CHATBOT.md §7).
// Divalidasi saat pertama dipakai, bukan saat import, supaya `next build` tetap jalan
// di environment yang belum mengaktifkan fitur WhatsApp.

const nonEmpty = z.string().trim().min(1);

const whatsAppEnvSchema = z.object({
  WHATSAPP_ACCESS_TOKEN: nonEmpty,
  WHATSAPP_PHONE_NUMBER_ID: z.string().trim().regex(/^\d+$/, "harus berupa angka"),
  WHATSAPP_APP_SECRET: nonEmpty,
  WHATSAPP_VERIFY_TOKEN: z.string().trim().min(16, "minimal 16 karakter"),
  WHATSAPP_GRAPH_VERSION: z
    .string()
    .trim()
    .regex(/^v\d+\.\d+$/, 'format "vNN.N"')
    .default("v23.0"),
  WHATSAPP_TEMPLATE_LANG: nonEmpty.default("id"),
  // Hanya untuk uji lokal dengan server Graph tiruan; production pakai default.
  WHATSAPP_GRAPH_BASE_URL: z.url().default("https://graph.facebook.com"),

  STORAGE_PRIVATE_BUCKET: nonEmpty,
});

export type WhatsAppEnv = z.infer<typeof whatsAppEnvSchema>;

type EnvSource = Record<string, string | undefined>;

// String kosong dianggap tidak di-set, supaya default berlaku dan field wajib ditolak.
function normalize(source: EnvSource, keys: string[] = Object.keys(whatsAppEnvSchema.shape)): EnvSource {
  const out: EnvSource = {};
  for (const key of keys) {
    const value = source[key];
    out[key] = value === undefined || value.trim() === "" ? undefined : value;
  }
  return out;
}

export function parseWhatsAppEnv(source: EnvSource): WhatsAppEnv {
  const result = whatsAppEnvSchema.safeParse(normalize(source));
  if (!result.success) {
    // Hanya nama variabel + alasan; nilai env tidak pernah ikut di pesan error.
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Konfigurasi WhatsApp tidak valid — ${issues}`);
  }
  return result.data;
}

let cached: WhatsAppEnv | null = null;

export function getWhatsAppEnv(): WhatsAppEnv {
  cached ??= parseWhatsAppEnv(process.env);
  return cached;
}

// Provider AI (docs/WHATSAPP_AI_CHATBOT.md §7): Anthropic resmi atau gateway pihak ketiga untuk
// testing. Key kedua provider di env (tidak pernah di DB); provider aktif dan model dipilih owner
// di Settings. Terpisah dari env WhatsApp, supaya Uji bot & Uji koneksi jalan sebelum Meta siap.
const httpsUrl = z.url({ protocol: /^https$/ }).transform((u) => u.replace(/\/+$/, ""));

const aiEnvSchema = z.object({
  ANTHROPIC_API_KEY: nonEmpty.optional(),
  // Dinyatakan eksplisit supaya ANTHROPIC_BASE_URL yang tidak sengaja ter-set tidak
  // diam-diam mengalihkan data klien ke server lain. Default: API resmi.
  ANTHROPIC_BASE_URL: httpsUrl.default("https://api.anthropic.com"),
  WA_AI_MODEL: nonEmpty.default("claude-haiku-5-5"),
  WA_AI_EXTRACTION_MODEL: nonEmpty.default("claude-sonnet-5-5"),
  WA_AI_MAX_TOKENS: z.coerce.number().int().min(100).max(8000).default(800),

  // Gateway untuk testing (format Anthropic Messages API). Data chat klien dikirim ke sini.
  AI_GATEWAY_API_KEY: nonEmpty.optional(),
  AI_GATEWAY_BASE_URL: httpsUrl.default("https://gateway.olagon.site/anthropic"),
  AI_GATEWAY_LABEL: nonEmpty.default("Olagon gateway"),
  AI_GATEWAY_MODEL: nonEmpty.default("claude-sonnet-4-6"),
  AI_GATEWAY_EXTRACTION_MODEL: nonEmpty.default("claude-sonnet-4-6"),
});

export type AiEnv = z.infer<typeof aiEnvSchema>;
export type AiProvider = "ANTHROPIC" | "GATEWAY";
export const AI_PROVIDERS: AiProvider[] = ["ANTHROPIC", "GATEWAY"];

export type ProviderEnv = {
  provider: AiProvider;
  label: string;
  baseUrl: string;
  apiKey: string | null;
  defaultModel: string;
  defaultExtractionModel: string;
};

/**
 * Melempar hanya jika nilai env AI salah format (mis. base URL bukan https). Tanpa cache:
 * murah, dan key yang baru diisi langsung terbaca setelah restart tanpa status basi.
 */
export function getAiEnv(): AiEnv {
  const result = aiEnvSchema.safeParse(normalize(process.env, Object.keys(aiEnvSchema.shape)));
  if (!result.success) {
    // Hanya nama variabel + alasan; nilai env tidak pernah ikut di pesan error.
    const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Konfigurasi AI tidak valid — ${issues}`);
  }
  return result.data;
}

export function getProviderEnv(provider: AiProvider): ProviderEnv {
  const env = getAiEnv();
  return provider === "GATEWAY"
    ? {
        provider,
        label: env.AI_GATEWAY_LABEL,
        baseUrl: env.AI_GATEWAY_BASE_URL,
        apiKey: env.AI_GATEWAY_API_KEY ?? null,
        defaultModel: env.AI_GATEWAY_MODEL,
        defaultExtractionModel: env.AI_GATEWAY_EXTRACTION_MODEL,
      }
    : {
        provider,
        label: "Anthropic (resmi)",
        baseUrl: env.ANTHROPIC_BASE_URL,
        apiKey: env.ANTHROPIC_API_KEY ?? null,
        defaultModel: env.WA_AI_MODEL,
        defaultExtractionModel: env.WA_AI_EXTRACTION_MODEL,
      };
}

/** Key provider ini sudah diisi di env server. */
export function isAiConfigured(provider: AiProvider = "ANTHROPIC"): boolean {
  try {
    return getProviderEnv(provider).apiKey !== null;
  } catch {
    return false;
  }
}

// URL publik portal untuk link tracking yang dikirim ke klien. Opsional; jika kosong,
// diambil dari Origin request owner (approve selalu dipicu dari portal).
const appUrlSchema = z.url({ protocol: /^https?$/ }).transform((u) => u.replace(/\/+$/, ""));

export function getAppPublicUrl(): string | null {
  const raw = process.env.APP_PUBLIC_URL?.trim();
  if (!raw) return null;
  const parsed = appUrlSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function isWhatsAppConfigured(): boolean {
  return whatsAppEnvSchema.safeParse(normalize(process.env)).success;
}
