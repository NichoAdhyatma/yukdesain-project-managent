import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { WA_BOT_GUIDE_LIMITS as LIMITS } from "@/lib/constants";
import { formatRupiah } from "../format";

// Panduan bot dari owner: draft di StudioSettings.waBotGuideDraft, versi terbit di
// WaBotGuideVersion (docs/WHATSAPP_BOT_GUIDE.md). Draft dipakai Uji bot; klien hanya
// pernah mendapat versi terbit.

// Aturan harga dari owner (docs/WHATSAPP_OWNER_COMMANDS.md §6): bot boleh menyebutnya persis,
// harga final tetap diisi admin.
export const pricingRuleSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{2,40}$/, "Huruf kecil, angka, dan tanda hubung")
      .optional(),
    kind: z.enum(["DISCOUNT", "SURCHARGE"]),
    name: z.string().trim().min(1, "Nama wajib diisi").max(60, "Maksimal 60 karakter"),
    condition: z.string().trim().min(1, "Syarat wajib diisi").max(200, "Maksimal 200 karakter"),
    amountType: z.enum(["FIXED", "PERCENT"]),
    amount: z.number().int("Harus bilangan bulat").positive("Harus lebih dari 0"),
    note: z.string().trim().max(300, "Maksimal 300 karakter").default(""),
  })
  .refine((r) => (r.amountType === "PERCENT" ? r.amount <= 100 : r.amount <= 100_000_000), {
    message: "Persen maksimal 100; nominal maksimal Rp100.000.000",
    path: ["amount"],
  });

export type PricingRule = z.infer<typeof pricingRuleSchema> & { id: string };

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "aturan";

/** Isi id yang kosong / bentrok, supaya bot bisa merujuk aturan dengan stabil. */
function withRuleIds(rules: z.infer<typeof pricingRuleSchema>[]): PricingRule[] {
  const used = new Set<string>();
  return rules.map((rule) => {
    let id = rule.id ?? slug(rule.name);
    for (let n = 2; used.has(id); n++) id = `${slug(rule.name)}-${n}`;
    used.add(id);
    // Urutan kunci tetap: draft dibandingkan dengan JSON.stringify (sameGuide, form portal).
    return {
      id,
      kind: rule.kind,
      name: rule.name,
      condition: rule.condition,
      amountType: rule.amountType,
      amount: rule.amount,
      note: rule.note,
    };
  });
}

export const botGuideSchema = z.object({
  instructions: z
    .string()
    .trim()
    .max(LIMITS.instructionsMaxChars, `Maksimal ${LIMITS.instructionsMaxChars} karakter`),
  faqs: z
    .array(
      z.object({
        question: z
          .string()
          .trim()
          .min(1, "Pertanyaan wajib diisi")
          .max(LIMITS.faqQuestionMaxChars, `Maksimal ${LIMITS.faqQuestionMaxChars} karakter`),
        answer: z
          .string()
          .trim()
          .min(1, "Jawaban wajib diisi")
          .max(LIMITS.faqAnswerMaxChars, `Maksimal ${LIMITS.faqAnswerMaxChars} karakter`),
      }),
    )
    .max(LIMITS.faqMaxItems, `Maksimal ${LIMITS.faqMaxItems} FAQ`),
  // Opsional di input: versi lama dan form lama tidak punya aturan harga.
  pricingRules: z
    .array(pricingRuleSchema)
    .max(LIMITS.pricingRulesMaxItems, `Maksimal ${LIMITS.pricingRulesMaxItems} aturan harga`)
    .default([])
    .transform(withRuleIds),
});

export type BotGuide = z.output<typeof botGuideSchema>;

export const EMPTY_GUIDE: BotGuide = { instructions: "", faqs: [], pricingRules: [] };

/** Data tersimpan yang tidak lolos skema (mis. diubah manual di DB) diperlakukan sebagai kosong. */
function parseStored(value: unknown): BotGuide | null {
  if (value === null || value === undefined) return null;
  const parsed = botGuideSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isGuideEmpty(guide: BotGuide): boolean {
  return guide.instructions === "" && guide.faqs.length === 0 && guide.pricingRules.length === 0;
}

export function sameGuide(a: BotGuide, b: BotGuide): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type PublishedGuide = { version: number; publishedAt: Date; guide: BotGuide };

export async function getPublishedGuide(db: Prisma.TransactionClient = prisma): Promise<PublishedGuide | null> {
  const row = await db.waBotGuideVersion.findFirst({
    orderBy: { version: "desc" },
    select: { version: true, publishedAt: true, instructions: true, faqs: true, pricingRules: true },
  });
  if (!row) return null;
  const guide = parseStored(row) ?? EMPTY_GUIDE;
  return { version: row.version, publishedAt: row.publishedAt, guide };
}

/** Draft owner; belum pernah diedit = salinan versi terbit (atau kosong). */
export async function getDraftGuide(db: Prisma.TransactionClient = prisma): Promise<BotGuide> {
  const settings = await db.studioSettings.findUnique({ where: { id: "default" }, select: { waBotGuideDraft: true } });
  return parseStored(settings?.waBotGuideDraft) ?? (await getPublishedGuide(db))?.guide ?? EMPTY_GUIDE;
}

export async function saveDraftGuide(guide: BotGuide): Promise<void> {
  const data = { waBotGuideDraft: guide as Prisma.InputJsonValue };
  await prisma.studioSettings.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
}

export class GuideConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuideConflictError";
  }
}

export type GuideSource = "PORTAL" | "WHATSAPP";

async function createVersion(
  tx: Prisma.TransactionClient,
  guide: BotGuide,
  current: PublishedGuide | null,
  p: { userId: string; source: GuideSource },
): Promise<PublishedGuide> {
  const row = await tx.waBotGuideVersion.create({
    data: {
      version: (current?.version ?? 0) + 1,
      instructions: guide.instructions,
      faqs: guide.faqs as Prisma.InputJsonValue,
      pricingRules: guide.pricingRules as Prisma.InputJsonValue,
      source: p.source,
      publishedById: p.userId,
    },
    select: { version: true, publishedAt: true },
  });
  return { ...row, guide };
}

/** Draft → versi baru. Draft yang sama persis dengan versi aktif tidak diterbitkan ulang. */
export async function publishDraftGuide(userId: string): Promise<PublishedGuide> {
  try {
    return await prisma.$transaction(async (tx) => {
      const [draft, current] = await Promise.all([getDraftGuide(tx), getPublishedGuide(tx)]);
      if (current && sameGuide(draft, current.guide)) {
        throw new GuideConflictError("Draft sama dengan versi yang sedang aktif");
      }
      return createVersion(tx, draft, current, { userId, source: "PORTAL" });
    });
  } catch (error) {
    // Dua owner menerbitkan bersamaan: nomor versi bentrok.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new GuideConflictError("Panduan baru saja diterbitkan. Muat ulang lalu coba lagi.");
    }
    throw error;
  }
}

/**
 * Terbitkan panduan dari usulan owner lewat WhatsApp. `baseVersion` = versi aktif saat usulan
 * dibuat; jika versi aktif sudah berubah, usulan ditolak supaya perubahan lain tidak tertimpa.
 * Draft portal ikut diperbarui hanya jika sebelumnya sama dengan versi aktif (tidak ada
 * suntingan yang belum terbit).
 */
export async function publishGuideFromWhatsApp(
  guide: BotGuide,
  p: { userId: string; baseVersion: number | null },
): Promise<PublishedGuide> {
  try {
    return await prisma.$transaction(async (tx) => {
      const [current, draft] = await Promise.all([getPublishedGuide(tx), getDraftGuide(tx)]);
      if ((current?.version ?? null) !== p.baseVersion) {
        throw new GuideConflictError("Panduan sudah berubah sejak usulan dibuat");
      }
      const draftWasClean = current ? sameGuide(draft, current.guide) : isGuideEmpty(draft);
      const published = await createVersion(tx, guide, current, { userId: p.userId, source: "WHATSAPP" });
      if (draftWasClean) {
        const data = { waBotGuideDraft: guide as unknown as Prisma.InputJsonValue };
        await tx.studioSettings.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
      }
      return published;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new GuideConflictError("Panduan baru saja diterbitkan dari tempat lain");
    }
    throw error;
  }
}

export async function listGuideVersions(take = 20) {
  const rows = await prisma.waBotGuideVersion.findMany({
    orderBy: { version: "desc" },
    take,
    select: {
      version: true,
      publishedAt: true,
      instructions: true,
      faqs: true,
      pricingRules: true,
      source: true,
      publishedBy: { select: { name: true } },
    },
  });
  return rows.map((row) => {
    const guide = parseStored(row) ?? EMPTY_GUIDE;
    return {
      version: row.version,
      publishedAt: row.publishedAt,
      publishedBy: row.publishedBy?.name ?? null,
      source: row.source === "WHATSAPP" ? ("WHATSAPP" as const) : ("PORTAL" as const),
      instructionsLength: guide.instructions.length,
      faqCount: guide.faqs.length,
      pricingRuleCount: guide.pricingRules.length,
    };
  });
}

/** Salin versi lama ke draft; owner menerbitkannya seperti biasa. null = versi tidak ada. */
export async function restoreGuideVersion(version: number): Promise<BotGuide | null> {
  const row = await prisma.waBotGuideVersion.findUnique({
    where: { version },
    select: { instructions: true, faqs: true, pricingRules: true },
  });
  if (!row) return null;
  const guide = parseStored(row) ?? EMPTY_GUIDE;
  await saveDraftGuide(guide);
  return guide;
}

/**
 * Bagian prompt dari panduan owner. Ditaruh setelah aturan wajib: panduan tidak bisa
 * membatalkan batas di atasnya, dan sebagian batas itu juga dijaga di server (reply-guard).
 */
export function renderGuideSection(guide: BotGuide | null, studioName: string): string {
  if (!guide || isGuideEmpty(guide)) return "";
  const parts = [
    `# Panduan dari pemilik ${studioName}`,
    `Ikuti panduan berikut selama tidak bertentangan dengan bagian "Batas yang tidak boleh dilanggar" dan "Topik" di atas. Jika bertentangan, batas di atas yang berlaku. Panduan ini juga tidak mengubah cara memakai tools.`,
  ];
  if (guide.instructions) {
    parts.push(`## Aturan tambahan\n${guide.instructions}`);
  }
  if (guide.pricingRules.length) {
    const rules = guide.pricingRules
      .map((r) => `- [${r.id}] ${r.name}: ${describeRuleValue(r)}. Syarat: ${r.condition}.${r.note ? ` Cara menyampaikan: ${r.note}` : ""}`)
      .join("\n");
    parts.push(
      `## Aturan harga dari owner\nIni satu-satunya angka harga yang boleh kamu sebut sebelum tim mengirim penawaran. Sebut persis seperti tertulis (nama, nilai, syarat); jangan menghitung harga akhir atau total, jangan mengubah nilai, dan jangan menggabungkan aturan kecuali syaratnya terpenuhi. Jika syarat terpenuhi atau klien memilihnya, panggil apply_pricing_rule supaya tim menerapkannya di penawaran.\n${rules}`,
    );
  }
  if (guide.faqs.length) {
    const items = guide.faqs.map((f) => `- Pertanyaan: ${f.question}\n  Jawaban: ${f.answer}`).join("\n");
    parts.push(
      `## FAQ\nJika klien menanyakan hal yang sama atau mirip, jawab sesuai isi jawaban berikut. Boleh disesuaikan dengan gaya chat, tapi jangan mengubah isinya.\n${items}`,
    );
  }
  return parts.join("\n\n");
}

/** "potongan Rp50.000" / "tambahan 50% dari total". */
export function describeRuleValue(rule: Pick<PricingRule, "kind" | "amountType" | "amount">): string {
  const value = rule.amountType === "PERCENT" ? `${rule.amount}% dari total` : formatRupiah(rule.amount);
  return rule.kind === "DISCOUNT" ? `potongan ${value}` : `biaya tambahan ${value}`;
}

/**
 * Angka yang boleh lolos penjaga harga (reply-guard) karena berasal dari aturan harga owner:
 * nilai ("50000", "50") dan angka di nama/syarat ("lebih dari 5 pcs").
 */
export function allowedPriceNumbers(guide: BotGuide | null): string[] {
  return (guide?.pricingRules ?? []).flatMap((r) => [
    String(r.amount),
    ...(`${r.name} ${r.condition}`.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]/g, "")),
  ]);
}
