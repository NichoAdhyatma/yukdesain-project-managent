import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { WA_BOT_GUIDE_LIMITS as LIMITS } from "@/lib/constants";

// Panduan bot dari owner: draft di StudioSettings.waBotGuideDraft, versi terbit di
// WaBotGuideVersion (docs/WHATSAPP_BOT_GUIDE.md). Draft dipakai Uji bot; klien hanya
// pernah mendapat versi terbit.

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
});

export type BotGuide = z.infer<typeof botGuideSchema>;

export const EMPTY_GUIDE: BotGuide = { instructions: "", faqs: [] };

/** Data tersimpan yang tidak lolos skema (mis. diubah manual di DB) diperlakukan sebagai kosong. */
function parseStored(value: unknown): BotGuide | null {
  if (value === null || value === undefined) return null;
  const parsed = botGuideSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isGuideEmpty(guide: BotGuide): boolean {
  return guide.instructions === "" && guide.faqs.length === 0;
}

export function sameGuide(a: BotGuide, b: BotGuide): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type PublishedGuide = { version: number; publishedAt: Date; guide: BotGuide };

export async function getPublishedGuide(db: Prisma.TransactionClient = prisma): Promise<PublishedGuide | null> {
  const row = await db.waBotGuideVersion.findFirst({
    orderBy: { version: "desc" },
    select: { version: true, publishedAt: true, instructions: true, faqs: true },
  });
  if (!row) return null;
  const guide = parseStored({ instructions: row.instructions, faqs: row.faqs }) ?? EMPTY_GUIDE;
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

/** Draft → versi baru. Draft yang sama persis dengan versi aktif tidak diterbitkan ulang. */
export async function publishDraftGuide(userId: string): Promise<PublishedGuide> {
  try {
    return await prisma.$transaction(async (tx) => {
      const [draft, current] = await Promise.all([getDraftGuide(tx), getPublishedGuide(tx)]);
      if (current && sameGuide(draft, current.guide)) {
        throw new GuideConflictError("Draft sama dengan versi yang sedang aktif");
      }
      const row = await tx.waBotGuideVersion.create({
        data: {
          version: (current?.version ?? 0) + 1,
          instructions: draft.instructions,
          faqs: draft.faqs as Prisma.InputJsonValue,
          publishedById: userId,
        },
        select: { version: true, publishedAt: true },
      });
      return { ...row, guide: draft };
    });
  } catch (error) {
    // Dua owner menerbitkan bersamaan: nomor versi bentrok.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new GuideConflictError("Panduan baru saja diterbitkan. Muat ulang lalu coba lagi.");
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
      publishedBy: { select: { name: true } },
    },
  });
  return rows.map((row) => {
    const guide = parseStored({ instructions: row.instructions, faqs: row.faqs }) ?? EMPTY_GUIDE;
    return {
      version: row.version,
      publishedAt: row.publishedAt,
      publishedBy: row.publishedBy?.name ?? null,
      instructionsLength: guide.instructions.length,
      faqCount: guide.faqs.length,
    };
  });
}

/** Salin versi lama ke draft; owner menerbitkannya seperti biasa. null = versi tidak ada. */
export async function restoreGuideVersion(version: number): Promise<BotGuide | null> {
  const row = await prisma.waBotGuideVersion.findUnique({
    where: { version },
    select: { instructions: true, faqs: true },
  });
  if (!row) return null;
  const guide = parseStored({ instructions: row.instructions, faqs: row.faqs }) ?? EMPTY_GUIDE;
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
  if (guide.faqs.length) {
    const items = guide.faqs.map((f) => `- Pertanyaan: ${f.question}\n  Jawaban: ${f.answer}`).join("\n");
    parts.push(
      `## FAQ\nJika klien menanyakan hal yang sama atau mirip, jawab sesuai isi jawaban berikut. Boleh disesuaikan dengan gaya chat, tapi jangan mengubah isinya.\n${items}`,
    );
  }
  return parts.join("\n\n");
}
