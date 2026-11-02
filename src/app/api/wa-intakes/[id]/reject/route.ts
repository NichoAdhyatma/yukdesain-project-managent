import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { IntakeError, transitionIntake } from "@/lib/whatsapp/intake";
import { dpRejectedMessage, sendToClient } from "@/lib/whatsapp/outbound";
import {
  errorResponse,
  findIntakeForDetail,
  intakeErrorResponse,
  logIntakeActivity,
  parseBody,
  toDetail,
  REAL_INTAKE,
} from "@/lib/whatsapp/intake-api";

type Params = { params: Promise<{ id: string }> };

const rejectSchema = z.object({
  proofId: z.string().min(1),
  reason: z.string().trim().min(3, "Alasan wajib diisi (dikirim ke klien)").max(500),
});

// POST: tolak bukti DP → bukti REJECTED, order kembali QUOTED, alasan dikirim ke klien.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(request, rejectSchema);
  if (body.error) return body.error;
  const { proofId, reason } = body.data;

  const intake = await prisma.waIntake.findFirst({
    where: { id, ...REAL_INTAKE },
    select: { status: true, clientName: true, conversationId: true, service: { select: { name: true } } },
  });
  if (!intake) return errorResponse("NOT_FOUND", "Order WA tidak ditemukan");

  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.paymentProof.updateMany({
        where: { id: proofId, intakeId: id, status: "PENDING" },
        data: { status: "REJECTED", rejectReason: reason, reviewedById: auth.user.id, reviewedAt: new Date() },
      });
      if (count === 0) throw new IntakeError("CONFLICT", "Bukti tidak ditemukan atau sudah diperiksa");
      await transitionIntake(tx, { intakeId: id, from: intake.status, action: "reject_proof", actor: "ADMIN" });
      await logIntakeActivity(tx, {
        intakeId: id,
        actorId: auth.user.id,
        action: "WA_DP_REJECTED",
        newValue: { proofId, reason },
      });
    });
  } catch (error) {
    return intakeErrorResponse(error);
  }

  const delivery = await sendToClient(
    intake.conversationId,
    dpRejectedMessage({ clientName: intake.clientName, serviceName: intake.service?.name ?? "desain", reason }),
  );
  const row = await findIntakeForDetail(id);
  return NextResponse.json({ intake: row ? await toDetail(row) : null, delivery });
}
