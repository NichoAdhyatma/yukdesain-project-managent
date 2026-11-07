import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { listOwnerNumbers } from "@/lib/whatsapp/owner/identity";
import {
  REAL_INTAKE,
  errorResponse,
  findIntakeForDetail,
  logIntakeActivity,
  parseBody,
  toDetail,
} from "@/lib/whatsapp/intake-api";

type Params = { params: Promise<{ id: string }> };

const blockSchema = z.object({ blocked: z.boolean() });

// POST: blokir / buka blokir nomor klien (docs/WHATSAPP_SPAM_GUARD.md §5). Berlaku per nomor
// (WaConversation): pesan tetap tersimpan, bot tidak membalas dan tidak memanggil AI.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(request, blockSchema);
  if (body.error) return body.error;
  const { blocked } = body.data;

  const intake = await prisma.waIntake.findFirst({
    where: { id, ...REAL_INTAKE },
    select: { conversationId: true, conversation: { select: { waId: true } } },
  });
  if (!intake) return errorResponse("NOT_FOUND", "Order WA tidak ditemukan");

  if (blocked && (await listOwnerNumbers()).some((o) => o.waNumber === intake.conversation.waId)) {
    return errorResponse("CONFLICT", "Nomor owner tidak bisa diblokir.");
  }

  const changed = await prisma.$transaction(async (tx) => {
    // Kondisi status lama di where: klik ganda / dua tab tidak tercatat dua kali.
    const { count } = await tx.waConversation.updateMany({
      where: { id: intake.conversationId, blockedAt: blocked ? null : { not: null } },
      data: blocked ? { blockedAt: new Date(), blockedById: auth.user.id } : { blockedAt: null, blockedById: null },
    });
    if (count === 0) return false;
    await logIntakeActivity(tx, {
      intakeId: id,
      actorId: auth.user.id,
      action: blocked ? "WA_NUMBER_BLOCKED" : "WA_NUMBER_UNBLOCKED",
      previousValue: { blocked: !blocked },
      newValue: { blocked },
    });
    return true;
  });
  if (!changed) {
    return errorResponse("CONFLICT", blocked ? "Nomor ini sudah diblokir." : "Nomor ini tidak sedang diblokir.");
  }

  const row = await findIntakeForDetail(id);
  return NextResponse.json({ intake: row ? await toDetail(row) : null });
}
