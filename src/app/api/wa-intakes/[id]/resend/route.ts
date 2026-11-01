import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { dpVerifiedMessage, sendToClient } from "@/lib/whatsapp/outbound";
import { errorResponse, trackingUrl } from "@/lib/whatsapp/intake-api";

type Params = { params: Promise<{ id: string }> };

// POST: kirim ulang pesan "DP terverifikasi" (kode project + link tracking) untuk order APPROVED.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;

  const intake = await prisma.waIntake.findUnique({
    where: { id },
    select: {
      status: true,
      clientName: true,
      conversationId: true,
      project: {
        select: {
          projectNumber: true,
          clientName: true,
          clientLinks: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1, select: { token: true } },
        },
      },
    },
  });
  if (!intake) return errorResponse("NOT_FOUND", "Order WA tidak ditemukan");
  if (intake.status !== "APPROVED" || !intake.project) {
    return errorResponse("CONFLICT", "Hanya order yang sudah menjadi project yang bisa dikirim ulang");
  }
  const token = intake.project.clientLinks[0]?.token;
  if (!token) return errorResponse("UNPROCESSABLE_ENTITY", "Project belum punya link tracking aktif");

  const url = trackingUrl(request, token);
  const delivery = await sendToClient(
    intake.conversationId,
    dpVerifiedMessage({
      clientName: intake.clientName ?? intake.project.clientName,
      projectNumber: intake.project.projectNumber,
      trackingUrl: url,
    }),
  );
  return NextResponse.json({ delivery, trackingUrl: url });
}
