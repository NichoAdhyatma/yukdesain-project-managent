import { NextResponse, after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { errorResponse, parseBody } from "@/lib/whatsapp/intake-api";
import { getInboxConversation, logConversationActivity } from "@/lib/whatsapp/inbox";
import { replyPendingAfterReturn } from "@/lib/whatsapp/resume-after-return";

type Params = { params: Promise<{ id: string }> };

const modeSchema = z.object({ mode: z.enum(["BOT", "HUMAN"]) });

// POST: ambil alih (HUMAN) / kembalikan ke bot (BOT) dari Inbox. Sama dengan /api/wa-intakes/[id]/mode,
// tetapi per percakapan, jadi juga untuk nomor yang belum punya order.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await parseBody(request, modeSchema);
  if (body.error) return body.error;
  const { mode } = body.data;
  const from = mode === "HUMAN" ? "BOT" : "HUMAN";

  const changed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.waConversation.updateMany({ where: { id, isSandbox: false, mode: from }, data: { mode } });
    if (count === 0) return false;
    await logConversationActivity(tx, {
      conversationId: id,
      actorId: auth.user.id,
      action: mode === "HUMAN" ? "WA_CHAT_TAKEN_OVER" : "WA_CHAT_RETURNED_TO_BOT",
      previousValue: { mode: from },
      newValue: { mode },
    });
    return true;
  });
  if (!changed) {
    const exists = await prisma.waConversation.count({ where: { id, isSandbox: false } });
    if (!exists) return errorResponse("NOT_FOUND", "Percakapan tidak ditemukan");
    return errorResponse("CONFLICT", mode === "HUMAN" ? "Chat sudah ditangani admin." : "Chat sudah dilayani bot.");
  }
  // Kembali ke bot: pesan klien yang tertinggal selama mode admin langsung dijawab (2026-11-12).
  if (mode === "BOT") after(() => replyPendingAfterReturn(id).then(() => undefined));
  return NextResponse.json({ conversation: await getInboxConversation(id) });
}
