import { z } from "zod";
import { SERVICE_BRIEF_CONFIGS, type BriefResponses } from "@/components/forms/brief/types";

// Validasi briefDraft per layanan, diturunkan dari SERVICE_BRIEF_CONFIGS.
// Bentuk item JSON mengikuti persis yang ditulis ServiceBriefForm, supaya
// BriefReader menampilkan brief WA dan brief form secara identik (§10.6).

export type BriefKey = keyof BriefResponses;
export type BriefDraft = Partial<Record<BriefKey, unknown>>;

const text = z.string().trim().min(1).max(2000);
const id = z.string().trim().min(1).max(100);
const shortText = z.string().trim().max(500);
const httpsUrl = z.url({ protocol: /^https$/ }).max(2000);

const referenceItem = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("image"), url: httpsUrl, caption: shortText.optional() }),
  z.object({ id, type: z.literal("url"), url: httpsUrl, caption: shortText.optional() }),
]);
const logoItem = z.object({ url: httpsUrl, caption: shortText });
const menuItem = z.object({
  id,
  name: z.string().trim().min(1).max(200),
  price: shortText.optional(),
  image: httpsUrl.optional(),
  caption: shortText.optional(),
});
const boxReference = z.object({ id, description: shortText, imageUrl: httpsUrl.optional() });
const cartReference = z.object({ id, imageUrl: httpsUrl.optional(), description: shortText.optional() });
const cartSide = z.object({
  sideName: z.string().trim().min(1).max(100),
  dimensions: shortText,
  textBrief: z.string().trim().min(1).max(2000),
  imageBrief: shortText.optional(),
});

const list = <T extends z.ZodType>(item: T) => z.array(item).max(50);

export const BRIEF_FIELD_SCHEMAS: Record<BriefKey, z.ZodType> = {
  brand_name: text,
  tagline: text,
  business_desc: text,
  colors: text,
  main_text: text,
  size: text,
  style: text,
  dimensions: text,
  mandatory_info: text,
  color_concept: text,
  sticker_shape: text,
  sticker_media: text,
  sticker_text: text,
  photobooth_size: text,
  vendor_name: text,
  event_theme: text,
  vendor_logo_url: httpsUrl,
  sosmed_platform: text,
  sosmed_vibe: text,
  brand_logo_url: httpsUrl,
  menu_items_json: list(menuItem),
  box_references_json: list(boxReference),
  cart_references_json: list(cartReference),
  cart_sides_json: list(cartSide),
  kopi_menu_items_json: list(menuItem),
  reference_items_json: list(referenceItem),
  logos_json: list(logoItem),
};

// Field yang memuat URL gambar hanya diisi server (attach_image_to_brief menyalin
// media WA ke storage) atau admin. AI tidak boleh menulis URL bebas: teks/gambar
// dari klien bisa berisi prompt injection yang menyisipkan link luar (§16).
export const IMAGE_FIELDS = [
  "reference_items_json",
  "logos_json",
  "vendor_logo_url",
  "brand_logo_url",
  "box_references_json",
  "cart_references_json",
] as const satisfies readonly BriefKey[];

// Item menu boleh diisi AI, tapi tanpa gambar.
const AI_STRIPPED_ITEM_KEYS: Partial<Record<BriefKey, string>> = {
  menu_items_json: "image",
  kopi_menu_items_json: "image",
};

export function getBriefConfig(serviceCode: string) {
  return SERVICE_BRIEF_CONFIGS.find((c) => c.code === serviceCode) ?? null;
}

export function allowedBriefFields(serviceCode: string): BriefKey[] {
  const config = getBriefConfig(serviceCode);
  return config ? [...config.requiredFields, ...config.optionalFields] : [];
}

/** Field yang boleh diisi AI lewat update_brief_draft untuk layanan ini. */
export function aiWritableBriefFields(serviceCode: string): BriefKey[] {
  return allowedBriefFields(serviceCode).filter((k) => !(IMAGE_FIELDS as readonly string[]).includes(k));
}

/** Target gambar yang valid untuk layanan ini (attach_image_to_brief). */
export function imageTargetFields(serviceCode: string): BriefKey[] {
  return allowedBriefFields(serviceCode).filter((k) => (IMAGE_FIELDS as readonly string[]).includes(k));
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function missingRequiredFields(serviceCode: string, draft: BriefDraft): BriefKey[] {
  const config = getBriefConfig(serviceCode);
  if (!config) return [];
  return config.requiredFields.filter((k) => isEmpty(draft[k]));
}

export type BriefValidation =
  | { ok: true; data: BriefDraft }
  | { ok: false; error: string; invalidKeys: string[] };

/**
 * Validasi patch brief. Kunci di luar config layanan ditolak; AI juga tidak boleh
 * menulis field gambar. Nilai null = hapus field.
 */
// AI: teks/item tanpa gambar. AI_ATTACHMENT: hanya field gambar, dengan URL yang
// dibuat server dari media WA (attach_image_to_brief). ADMIN: semua field layanan.
export type BriefFieldSource = "AI" | "AI_ATTACHMENT" | "ADMIN";

function writableFields(serviceCode: string, source: BriefFieldSource): BriefKey[] {
  if (source === "AI") return aiWritableBriefFields(serviceCode);
  if (source === "AI_ATTACHMENT") return imageTargetFields(serviceCode);
  return allowedBriefFields(serviceCode);
}

export function validateBriefFields(
  serviceCode: string,
  input: unknown,
  source: BriefFieldSource,
): BriefValidation {
  if (!getBriefConfig(serviceCode)) {
    return { ok: false, error: `Layanan ${serviceCode} tidak dikenal`, invalidKeys: [] };
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "fields harus berupa objek", invalidKeys: [] };
  }

  const allowed = new Set<string>(writableFields(serviceCode, source));
  const entries = Object.entries(input);
  const notAllowed = entries.map(([k]) => k).filter((k) => !allowed.has(k));
  if (notAllowed.length) {
    return { ok: false, error: "Field tidak berlaku untuk layanan ini", invalidKeys: notAllowed };
  }

  const data: BriefDraft = {};
  const invalid: string[] = [];
  for (const [key, raw] of entries) {
    const k = key as BriefKey;
    if (raw === null) {
      data[k] = null;
      continue;
    }
    let value = raw;
    const strip = source === "AI" ? AI_STRIPPED_ITEM_KEYS[k] : undefined;
    if (strip && Array.isArray(value)) {
      value = value.map((item) =>
        item && typeof item === "object" ? Object.fromEntries(Object.entries(item).filter(([ik]) => ik !== strip)) : item,
      );
    }
    const parsed = BRIEF_FIELD_SCHEMAS[k].safeParse(value);
    if (parsed.success) data[k] = parsed.data;
    else invalid.push(key);
  }
  if (invalid.length) return { ok: false, error: "Format field tidak valid", invalidKeys: invalid };
  return { ok: true, data };
}

/** Merge per kunci; null menghapus kunci. Draft lama tidak diubah. */
export function mergeBriefDraft(draft: BriefDraft, patch: BriefDraft): BriefDraft {
  const next: BriefDraft = { ...draft };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key as BriefKey];
    else next[key as BriefKey] = value;
  }
  return next;
}
