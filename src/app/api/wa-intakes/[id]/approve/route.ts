import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { approveChecklistSchema, approveIntake } from "@/lib/whatsapp/approve-intake";
import { dpVerifiedMessage, sendToClient } from "@/lib/whatsapp/outbound";
import {
  findIntakeForDetail,
  intakeErrorResponse,
  parseBody,
  toDetail,
  trackingUrl,
} from "@/lib/whatsapp/intake-api";

type Params = { params: Promise<{ id: string }> };

const approveSchema = z.object({
  proofId: z.string().min(1),
  // Rupiah utuh yang benar-benar masuk di mutasi rekening (dicek admin, bukan dari gambar)
  verifiedAmount: z.number().int("Nominal harus bilangan bulat").positive("Nominal harus lebih dari 0"),
  checklist: approveChecklistSchema,
});

// POST: DP valid → project, brief, payment, struk, link tracking (satu transaksi), lalu kabari klien.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(request, approveSchema);
  if (body.error) return body.error;

  let result;
  try {
    result = await approveIntake({
      intakeId: id,
      proofId: body.data.proofId,
      verifiedAmount: body.data.verifiedAmount,
      actorId: auth.user.id,
    });
  } catch (error) {
    return intakeErrorResponse(error);
  }

  const url = trackingUrl(request, result.clientLinkToken);
  // Project sudah jadi; jika pesan gagal, portal menampilkan peringatan + tombol Kirim ulang.
  const delivery = await sendToClient(
    result.conversationId,
    dpVerifiedMessage({ clientName: result.clientName, projectNumber: result.project.projectNumber, trackingUrl: url }),
  );

  const row = await findIntakeForDetail(id);
  return NextResponse.json({
    intake: row ? await toDetail(row) : null,
    project: result.project,
    trackingUrl: url,
    delivery,
  });
}
