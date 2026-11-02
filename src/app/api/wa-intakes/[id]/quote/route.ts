import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { computeDpAmount, transitionIntake } from "@/lib/whatsapp/intake";
import { offerMessage, sendToClient } from "@/lib/whatsapp/outbound";
import {
  errorResponse,
  findIntakeForDetail,
  intakeErrorResponse,
  logIntakeActivity,
  parseBody,
  toDetail,
} from "@/lib/whatsapp/intake-api";

type Params = { params: Promise<{ id: string }> };

const todayWib = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

const quoteSchema = z.object({
  // Rupiah utuh, sama dengan Project.agreedPrice
  agreedPrice: z.number().int("Harga harus bilangan bulat").positive("Harga harus lebih dari 0").max(10_000_000_000),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "Format tanggal YYYY-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(d)), "Tanggal tidak valid")
    .refine((d) => d.slice(0, 10) >= todayWib(), "Deadline tidak boleh sebelum hari ini"),
});

// POST: isi/revisi harga + deadline → QUOTED → kirim penawaran (§3.2, §13).
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(request, quoteSchema);
  if (body.error) return body.error;
  const { agreedPrice, deadline } = body.data;

  const intake = await prisma.waIntake.findUnique({
    where: { id },
    select: {
      status: true,
      clientName: true,
      conversationId: true,
      agreedPrice: true,
      deadline: true,
      service: { select: { name: true } },
    },
  });
  if (!intake) return errorResponse("NOT_FOUND", "Order WA tidak ditemukan");
  if (!intake.service) return errorResponse("UNPROCESSABLE_ENTITY", "Layanan order belum dipilih");

  const dpAmount = computeDpAmount(agreedPrice);
  const deadlineDate = new Date(deadline);

  try {
    await prisma.$transaction(async (tx) => {
      await transitionIntake(tx, {
        intakeId: id,
        from: intake.status,
        action: "quote",
        actor: "ADMIN",
        data: { agreedPrice, dpAmount, deadline: deadlineDate, quotedById: auth.user.id, quotedAt: new Date() },
      });
      await logIntakeActivity(tx, {
        intakeId: id,
        actorId: auth.user.id,
        action: intake.status === "QUOTED" ? "WA_QUOTE_REVISED" : "WA_QUOTED",
        previousValue: { agreedPrice: intake.agreedPrice, deadline: intake.deadline },
        newValue: { agreedPrice, dpAmount, deadline: deadlineDate },
      });
    });
  } catch (error) {
    return intakeErrorResponse(error);
  }

  const accounts = await prisma.paymentAccount.findMany({
    where: { isActive: true },
    select: { name: true, accountNumber: true, accountHolder: true },
    orderBy: { order: "asc" },
  });
  // Status sudah tersimpan; kegagalan kirim ditampilkan ke admin, bukan dibatalkan.
  const delivery = await sendToClient(
    intake.conversationId,
    offerMessage({
      clientName: intake.clientName,
      serviceName: intake.service.name,
      agreedPrice,
      dpAmount,
      deadline: deadlineDate,
      accounts,
    }),
  );

  const row = await findIntakeForDetail(id);
  return NextResponse.json({
    intake: row ? await toDetail(row) : null,
    delivery,
    warnings: accounts.length ? [] : ["NO_ACTIVE_PAYMENT_ACCOUNT"],
  });
}
