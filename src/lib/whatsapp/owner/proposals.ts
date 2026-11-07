import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { WA_OWNER } from "@/lib/constants";
import {
  GuideConflictError,
  botGuideSchema,
  describeRuleValue,
  publishGuideFromWhatsApp,
  saveDraftGuide,
  sameGuide,
  type BotGuide,
} from "../ai/bot-guide";
import type { OwnerContext } from "./identity";

// Usulan perubahan panduan dari chat owner (docs/WHATSAPP_OWNER_COMMANDS.md §4). AI hanya
// membuat usulan; YA/BATAL diperiksa di sini (server), lalu panduan terbit atau masuk draft.

export type ConfirmKeyword = "YES" | "CANCEL";

const YES = new Set(["ya", "iya", "yes", "y", "ya terapkan", "iya terapkan"]);
const CANCEL = new Set(["batal", "cancel", "gak jadi", "ga jadi", "nggak jadi", "tidak jadi", "batalkan"]);

export function parseConfirmKeyword(text: string): ConfirmKeyword | null {
  const t = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (YES.has(t)) return "YES";
  if (CANCEL.has(t)) return "CANCEL";
  return null;
}

export type Proposal = {
  id: string;
  guide: BotGuide;
  base: BotGuide;
  summary: string;
  baseVersion: number | null;
  target: OwnerContext["target"];
};

/** Usulan baru menggantikan usulan lama yang belum dijawab di percakapan yang sama. */
export async function createProposal(p: {
  owner: OwnerContext;
  conversationId: string;
  guide: BotGuide;
  summary: string;
  baseVersion: number | null;
}): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.waOwnerProposal.updateMany({
      where: { conversationId: p.conversationId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    return tx.waOwnerProposal.create({
      data: {
        ownerId: p.owner.user.id,
        conversationId: p.conversationId,
        guide: p.guide as unknown as Prisma.InputJsonValue,
        summary: p.summary,
        baseVersion: p.baseVersion,
        target: p.owner.target,
        expiresAt: new Date(Date.now() + WA_OWNER.proposalTtlHours * 3_600_000),
      },
      select: { id: true },
    });
  });
}

export async function findPendingProposal(conversationId: string, now = new Date()) {
  await prisma.waOwnerProposal.updateMany({
    where: { conversationId, status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  const row = await prisma.waOwnerProposal.findFirst({
    where: { conversationId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, guide: true, summary: true, baseVersion: true, target: true },
  });
  if (!row) return null;
  const guide = botGuideSchema.safeParse(row.guide);
  if (!guide.success) return null;
  return { id: row.id, guide: guide.data, summary: row.summary, baseVersion: row.baseVersion, target: row.target === "DRAFT" ? "DRAFT" : "PUBLISH" } as const;
}

/** Klaim usulan sekali saja (balasan YA ganda tidak menerbitkan dua kali). */
async function claim(id: string, status: "APPLIED" | "CANCELLED"): Promise<boolean> {
  const { count } = await prisma.waOwnerProposal.updateMany({ where: { id, status: "PENDING" }, data: { status } });
  return count === 1;
}

export const OWNER_REPLIES = {
  cancelled: "Oke, usulan dibatalkan. Panduan bot tidak berubah.",
  conflict: "Panduan sudah berubah sejak usulan ini dibuat (mungkin diubah dari portal). Kirim ulang instruksinya ya.",
  textOnly: "Untuk instruksi ke bot, kirim dalam bentuk teks ya.",
  notRecorded: "Maaf, usulannya belum tercatat di sistem. Kirim ulang instruksinya ya.",
  busy: "Maaf, bot sedang tidak bisa memproses instruksi. Coba lagi sebentar lagi, atau ubah panduan dari menu Bot AI di portal.",
};

export async function cancelProposal(proposal: { id: string }): Promise<string> {
  await claim(proposal.id, "CANCELLED");
  return OWNER_REPLIES.cancelled;
}

export async function applyProposal(
  proposal: { id: string; guide: BotGuide; baseVersion: number | null; target: OwnerContext["target"] },
  owner: OwnerContext,
): Promise<string> {
  if (!(await claim(proposal.id, "APPLIED"))) return OWNER_REPLIES.cancelled;

  if (proposal.target === "DRAFT") {
    await saveDraftGuide(proposal.guide);
    return "Tersimpan ke draft panduan. Coba sebagai klien di Uji bot, lalu terbitkan dari menu Bot AI › Panduan.";
  }

  try {
    const published = await publishGuideFromWhatsApp(proposal.guide, { userId: owner.user.id, baseVersion: proposal.baseVersion });
    await prisma.$transaction([
      prisma.waOwnerProposal.update({ where: { id: proposal.id }, data: { appliedVersion: published.version } }),
      prisma.activityLog.create({
        data: {
          entityType: "StudioSettings",
          entityId: "default",
          action: "WA_BOT_GUIDE_PUBLISHED",
          actorId: owner.user.id,
          newValue: { version: published.version, source: "WHATSAPP" },
        },
      }),
    ]);
    return `Siap, panduan versi ${published.version} sudah aktif untuk semua klien.`;
  } catch (error) {
    if (!(error instanceof GuideConflictError)) throw error;
    await prisma.waOwnerProposal.update({ where: { id: proposal.id }, data: { status: "CANCELLED" } });
    return OWNER_REPLIES.conflict;
  }
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Pesan konfirmasi yang dibangun server (bukan AI), supaya yang dikonfirmasi = yang diterapkan. */
export function proposalMessage(p: Proposal): string {
  const lines = ["*Usulan perubahan panduan bot*", p.summary.trim()];

  if (JSON.stringify(p.guide.pricingRules) !== JSON.stringify(p.base.pricingRules)) {
    lines.push(
      "",
      "*Aturan harga* (setelah perubahan):",
      ...(p.guide.pricingRules.length
        ? p.guide.pricingRules.map((r) => `• ${r.name}: ${describeRuleValue(r)}. Syarat: ${r.condition}`)
        : ["• (tidak ada)"]),
    );
  }
  if (p.guide.instructions !== p.base.instructions) {
    lines.push("", "*Aturan tambahan* (setelah perubahan):", p.guide.instructions ? clip(p.guide.instructions, 1200) : "(kosong)");
  }
  if (JSON.stringify(p.guide.faqs) !== JSON.stringify(p.base.faqs)) {
    lines.push(
      "",
      `*FAQ*: ${p.guide.faqs.length} pertanyaan`,
      ...p.guide.faqs.slice(0, 10).map((f) => `• ${clip(f.question, 120)}`),
    );
  }
  lines.push(
    "",
    p.target === "DRAFT"
      ? "Balas *YA* untuk menyimpan ke draft (Uji bot), atau *BATAL*."
      : "Balas *YA* untuk menerapkan ke semua klien, atau *BATAL*.",
  );
  return lines.join("\n");
}

export function isNoChange(guide: BotGuide, base: BotGuide): boolean {
  return sameGuide(guide, base);
}

// Balasan AI yang meminta YA/BATAL tanpa usulan tersimpan akan menyesatkan owner (YA-nya tidak
// menerapkan apa pun), jadi tidak dikirim.
const FAKE_CONFIRMATION = /balas\s*\*?\s*(ya|batal)\b/i;

export function looksLikeConfirmationRequest(text: string): boolean {
  return FAKE_CONFIRMATION.test(text);
}
