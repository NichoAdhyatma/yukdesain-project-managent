import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { BriefResponseEntry } from "@/lib/brief/responses";

// Tambahan brief dari klien yang tidak punya field (kapan saja selama order aktif) atau setelah brief dikunci (invoice
// terkirim / bukti DP / project berjalan), disetujui owner
// 2026-11-12 (kasus Alfa Indah: minta "harga 12k di sebelah rasa" setelah kirim bukti DP, bot mengalihkan chat ke
// admin dan tambahannya tidak masuk brief). Dicatat sebagai field `client_notes`, dibaca desainer dan owner di brief.

export const CLIENT_NOTES_KEY = "client_notes";

export type BriefNoteResult =
  | { ok: true; target: "ORDER" }
  | { ok: true; target: "PROJECT"; projectNumber: string }
  | { ok: false; error: string };

/** Tambah satu baris "• 12 Nov 21.19: catatan" (WIB) di bawah catatan lama. */
export function appendNote(existing: string | undefined | null, note: string, now = new Date()): string {
  const opts = { timeZone: "Asia/Jakarta" } as const;
  const day = now.toLocaleDateString("id-ID", { ...opts, day: "numeric", month: "short" }).replace(".", "");
  const time = now.toLocaleTimeString("id-ID", { ...opts, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(":", ".");
  const line = `• ${day} ${time}: ${note.trim()}`;
  return existing?.trim() ? `${existing.trim()}\n${line}` : line;
}

export async function addClientBriefNote(conversationId: string, note: string, now = new Date()): Promise<BriefNoteResult> {
  const intake = await prisma.waIntake.findFirst({
    where: { conversationId, status: { in: ["COLLECTING", "AWAITING_QUOTE", "QUOTED", "DP_REVIEW"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, briefDraft: true },
  });
  // Semua order aktif: brief dikunci (QUOTED/DP_REVIEW) maupun masih dikumpulkan, untuk permintaan yang tidak punya
  // field brief (kasus Mr.K4z 13 Nov: kenaikan harga menu tidak tersimpan di mana pun).
  if (intake) {
    const draft = (intake.briefDraft ?? {}) as Record<string, unknown>;
    const notes = appendNote(draft[CLIENT_NOTES_KEY] as string | undefined, note, now);
    await prisma.waIntake.update({
      where: { id: intake.id },
      data: { briefDraft: { ...draft, [CLIENT_NOTES_KEY]: notes } as Prisma.InputJsonValue },
    });
    return { ok: true, target: "ORDER" };
  }

  const conversation = await prisma.waConversation.findUnique({ where: { id: conversationId }, select: { clientId: true } });
  if (!conversation?.clientId) {
    return { ok: false, error: "Klien belum terhubung ke project. Panggil get_my_projects dulu." };
  }
  // Project yang masih dikerjakan; setelah hasil akhir dikirim, perubahan lewat revisi di portal.
  const project = await prisma.project.findFirst({
    where: { clientId: conversation.clientId, finalSubmittedAt: null, status: { not: "SELESAI" } },
    orderBy: { createdAt: "desc" },
    select: { projectNumber: true, brief: { select: { id: true, responses: true } } },
  });
  if (!project?.brief) {
    return { ok: false, error: "Tidak ada order atau project yang sedang dikerjakan. Setelah hasil akhir dikirim, perubahan lewat revisi di portal." };
  }
  const entries = (Array.isArray(project.brief.responses) ? project.brief.responses : []) as BriefResponseEntry[];
  const current = entries.find((e) => e.questionId === CLIENT_NOTES_KEY);
  const answer = appendNote(current?.answer, note, now);
  const responses = current
    ? entries.map((e) => (e.questionId === CLIENT_NOTES_KEY ? { ...e, answer } : e))
    : [...entries, { questionId: CLIENT_NOTES_KEY, question: "client notes", answer }];
  await prisma.brief.update({ where: { id: project.brief.id }, data: { responses: responses as Prisma.InputJsonValue } });
  return { ok: true, target: "PROJECT", projectNumber: project.projectNumber };
}
