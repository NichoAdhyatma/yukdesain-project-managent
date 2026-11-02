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

  ANTHROPIC_API_KEY: nonEmpty,
  // Dinyatakan eksplisit supaya ANTHROPIC_BASE_URL yang tidak sengaja ter-set tidak
  // diam-diam mengalihkan data klien ke server lain. Default: API resmi.
  ANTHROPIC_BASE_URL: z.url({ protocol: /^https$/ }).default("https://api.anthropic.com"),
  WA_AI_MODEL: nonEmpty.default("claude-haiku-5-5"),
  WA_AI_EXTRACTION_MODEL: nonEmpty.default("claude-sonnet-5-5"),
  WA_AI_MAX_TOKENS: z.coerce.number().int().min(100).max(8000).default(800),

  STORAGE_PRIVATE_BUCKET: nonEmpty,
});

export type WhatsAppEnv = z.infer<typeof whatsAppEnvSchema>;

type EnvSource = Record<string, string | undefined>;

// String kosong dianggap tidak di-set, supaya default berlaku dan field wajib ditolak.
function normalize(source: EnvSource): EnvSource {
  const out: EnvSource = {};
  for (const key of Object.keys(whatsAppEnvSchema.shape)) {
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

const aiDefaultsSchema = whatsAppEnvSchema.pick({
  WA_AI_MODEL: true,
  WA_AI_EXTRACTION_MODEL: true,
  ANTHROPIC_BASE_URL: true,
});

/**
 * Default AI dari env, terpisah dari validasi token WhatsApp, supaya Settings tetap
 * bisa menampilkan default walau env WhatsApp belum lengkap. null jika nilainya tidak valid.
 */
export function getAiEnvDefaults(): { model: string; extractionModel: string; baseUrl: string } | null {
  const result = aiDefaultsSchema.safeParse(normalize(process.env));
  if (!result.success) return null;
  return {
    model: result.data.WA_AI_MODEL,
    extractionModel: result.data.WA_AI_EXTRACTION_MODEL,
    baseUrl: result.data.ANTHROPIC_BASE_URL,
  };
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
