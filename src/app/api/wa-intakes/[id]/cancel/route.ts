import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { transitionIntake } from "@/lib/whatsapp/intake";
import { cancelledMessage, sendToClient } from "@/lib/whatsapp/outbound";
import {
  errorResponse,
  findIntakeForDetail,
  intakeErrorResponse,
  logIntakeActivity,
  parseBody,
  toDetail,
} from "@/lib/whatsapp/intake-api";

type Params = { params: Promise<{ id: string }> };

const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Alasan wajib diisi (dikirim ke klien)").max(500),
});

// POST: batalkan order WA (semua status kecuali APPROVED/CANCELLED), beri tahu klien.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(request, cancelSchema);
  if (body.error) return body.error;
  const { reason } = body.data;

  const intake = await prisma.waIntake.findUnique({
    where: { id },
    select: { status: true, clientName: true, conversationId: true, service: { select: { name: true } } },
  });
  if (!intake) return errorResponse("NOT_FOUND", "Order WA tidak ditemukan");

  try {
    await prisma.$transaction(async (tx) => {
      await transitionIntake(tx, {
        intakeId: id,
        from: intake.status,
        action: "cancel",
        actor: "ADMIN",
        data: { cancelReason: reason },
      });
      // Bukti yang belum diperiksa ikut ditutup supaya tidak menggantung di antrean.
      await tx.paymentProof.updateMany({
        where: { intakeId: id, status: "PENDING" },
        data: { status: "REJECTED", rejectReason: `Order dibatalkan: ${reason}`, reviewedById: auth.user.id, reviewedAt: new Date() },
      });
      await logIntakeActivity(tx, {
        intakeId: id,
        actorId: auth.user.id,
        action: "WA_INTAKE_CANCELLED",
        previousValue: { status: intake.status },
        newValue: { reason },
      });
    });
  } catch (error) {
    return intakeErrorResponse(error);
  }

  const delivery = await sendToClient(
    intake.conversationId,
    cancelledMessage({ clientName: intake.clientName, serviceName: intake.service?.name ?? "desain", reason }),
  );
  const row = await findIntakeForDetail(id);
  return NextResponse.json({ intake: row ? await toDetail(row) : null, delivery });
}
