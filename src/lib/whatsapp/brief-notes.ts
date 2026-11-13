import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { copyToPublicBucket } from "@/lib/storage";
import type { BriefResponseEntry } from "@/lib/brief/responses";
import { getPrivateBucket } from "./env";
import { mimeFromStorageKey } from "./media";

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

  const found = await findRunningProject(conversationId);
  if (!found.ok) return found;
  const { project } = found;
  const entries = project.brief.responses;
  const current = entries.find((e) => e.questionId === CLIENT_NOTES_KEY);
  const answer = appendNote(current?.answer, note, now);
  const responses = current
    ? entries.map((e) => (e.questionId === CLIENT_NOTES_KEY ? { ...e, answer } : e))
    : [...entries, { questionId: CLIENT_NOTES_KEY, question: "client notes", answer }];
  await prisma.brief.update({
    where: { id: project.brief.id },
    data: { responses: responses as Prisma.InputJsonValue, clientUpdatedAt: now },
  });
  return { ok: true, target: "PROJECT", projectNumber: project.projectNumber };
}

const REFERENCES_KEY = "reference_items_json";
const WHATSAPP_UPLOADER = "whatsapp";

type RunningProject = { id: string; projectNumber: string; brief: { id: string; responses: BriefResponseEntry[] } };

/** Project klien yang masih dikerjakan; setelah hasil akhir dikirim, perubahan lewat revisi di portal. */
async function findRunningProject(conversationId: string): Promise<{ ok: true; project: RunningProject } | { ok: false; error: string }> {
  const conversation = await prisma.waConversation.findUnique({ where: { id: conversationId }, select: { clientId: true } });
  if (!conversation?.clientId) {
    return { ok: false, error: "Klien belum terhubung ke project. Panggil get_my_projects dulu." };
  }
  const project = await prisma.project.findFirst({
    where: { clientId: conversation.clientId, finalSubmittedAt: null, status: { not: "SELESAI" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, projectNumber: true, brief: { select: { id: true, responses: true } } },
  });
  if (!project?.brief) {
    return { ok: false, error: "Tidak ada order atau project yang sedang dikerjakan. Setelah hasil akhir dikirim, perubahan lewat revisi di portal." };
  }
  const responses = (Array.isArray(project.brief.responses) ? project.brief.responses : []) as BriefResponseEntry[];
  return { ok: true, project: { id: project.id, projectNumber: project.projectNumber, brief: { id: project.brief.id, responses } } };
}

function parseItems(answer: string | undefined): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(answer ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Gambar referensi dari klien saat project sudah dikerjakan → galeri referensi di brief desainer + lampiran project
 * (produksi 2026-11-13, Yeni: gambar "ini lucu" hanya tercatat sebagai teks dan tidak sampai ke desainer).
 */
export async function attachImageToProjectBrief(conversationId: string, messageId: string, caption: string, now = new Date()): Promise<BriefNoteResult> {
  const found = await findRunningProject(conversationId);
  if (!found.ok) return found;
  const { project } = found;

  const itemId = `wa-${messageId}`;
  const entries = project.brief.responses;
  const current = entries.find((e) => e.questionId === REFERENCES_KEY);
  const items = parseItems(current?.answer);
  if (items.some((i) => i.id === itemId)) return { ok: true, target: "PROJECT", projectNumber: project.projectNumber };

  const message = await prisma.waMessage.findFirst({
    where: { id: messageId, conversationId, direction: "INBOUND", type: "image" },
    select: { id: true, mediaStorageKey: true },
  });
  if (!message?.mediaStorageKey) return { ok: false, error: "Gambar tidak ditemukan di percakapan ini" };

  const ext = message.mediaStorageKey.split(".").pop() ?? "jpg";
  const storageKey = `project-brief/${project.id}/${message.id}.${ext}`;
  const mimeType = mimeFromStorageKey(message.mediaStorageKey);
  const url = await copyToPublicBucket(getPrivateBucket(), message.mediaStorageKey, storageKey, mimeType);
  if (!url) return { ok: false, error: "Storage publik belum dikonfigurasi" };

  // Bentuk item sama dengan referensi brief awal (ServiceBriefForm / attach_image_to_brief).
  const answer = JSON.stringify([...items, { id: itemId, type: "image", url, caption }]);
  const responses = current
    ? entries.map((e) => (e.questionId === REFERENCES_KEY ? { ...e, answer } : e))
    : [...entries, { questionId: REFERENCES_KEY, question: "reference items json", answer }];
  await prisma.brief.update({
    where: { id: project.brief.id },
    data: { responses: responses as Prisma.InputJsonValue, clientUpdatedAt: now },
  });
  await prisma.attachment.create({
    data: {
      filename: storageKey.split("/").pop() ?? storageKey,
      mimeType,
      size: 0,
      storageKey,
      caption,
      category: "BRIEF_REFERENCE",
      projectId: project.id,
      uploaderId: WHATSAPP_UPLOADER,
    },
  });
  return { ok: true, target: "PROJECT", projectNumber: project.projectNumber };
}
