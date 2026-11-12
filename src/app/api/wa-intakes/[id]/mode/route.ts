import { NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  REAL_INTAKE,
  errorResponse,
  findIntakeForDetail,
  logIntakeActivity,
  parseBody,
  toDetail,
} from "@/lib/whatsapp/intake-api";
import { replyPendingAfterReturn } from "@/lib/whatsapp/resume-after-return";

type Params = { params: Promise<{ id: string }> };

const modeSchema = z.object({ mode: z.enum(["BOT", "HUMAN"]) });

// POST: admin mengambil alih chat (HUMAN) atau mengembalikannya ke bot (BOT).
// Mode berlaku per nomor (WaConversation). Setelah kembali ke BOT, pesan klien yang belum terbalas (24 jam terakhir)
// langsung dijawab bot (2026-11-12, kasus hastalinuwih); kalau tidak ada, bot menunggu pesan klien berikutnya.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(request, modeSchema);
  if (body.error) return body.error;
  const { mode } = body.data;

  const intake = await prisma.waIntake.findFirst({ where: { id, ...REAL_INTAKE }, select: { conversationId: true } });
  if (!intake) return errorResponse("NOT_FOUND", "Order WA tidak ditemukan");

  const from = mode === "HUMAN" ? "BOT" : "HUMAN";
  const changed = await prisma.$transaction(async (tx) => {
    // Kondisi mode lama di where: klik ganda / dua tab tidak tercatat dua kali.
    const { count } = await tx.waConversation.updateMany({ where: { id: intake.conversationId, mode: from }, data: { mode } });
    if (count === 0) return false;
    await logIntakeActivity(tx, {
      intakeId: id,
      actorId: auth.user.id,
      action: mode === "HUMAN" ? "WA_CHAT_TAKEN_OVER" : "WA_CHAT_RETURNED_TO_BOT",
      previousValue: { mode: from },
      newValue: { mode },
    });
    return true;
  });
  if (!changed) {
    return errorResponse("CONFLICT", mode === "HUMAN" ? "Chat sudah ditangani admin." : "Chat sudah dilayani bot.");
  }

  if (mode === "BOT") after(() => replyPendingAfterReturn(intake.conversationId).then(() => undefined));
  const row = await findIntakeForDetail(id);
  return NextResponse.json({ intake: row ? await toDetail(row) : null });
}
