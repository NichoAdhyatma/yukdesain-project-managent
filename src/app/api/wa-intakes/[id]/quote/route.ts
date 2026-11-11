import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { computeDpAmount, transitionIntake } from "@/lib/whatsapp/intake";
import { getStudioOperations } from "@/lib/studio-operations";
import { invoiceMessage, invoiceNumberFor, sendInvoiceToClient } from "@/lib/whatsapp/outbound";
import { suggestQuotePrice } from "@/lib/services/price-calculator";
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

// POST: isi/revisi harga + deadline → QUOTED → kirim invoice + semua metode bayar aktif (§3.2, §13;
// spec 2026-11-11-kb-merge-design §5).
export async function POST(request: Request, { params }: Params) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const { id } = await params;

  const body = await parseBody(request, quoteSchema);
  if (body.error) return body.error;
  const { agreedPrice, deadline } = body.data;

  const intake = await prisma.waIntake.findFirst({
    where: { id, ...REAL_INTAKE },
    select: {
      status: true,
      clientName: true,
      conversationId: true,
      agreedPrice: true,
      deadline: true,
      invoiceNumber: true,
      briefDraft: true,
      service: { select: { name: true, startingPrice: true, packages: true, unitPricing: true } },
    },
  });
  if (!intake) return errorResponse("NOT_FOUND", "Order WA tidak ditemukan");
  if (!intake.service) return errorResponse("UNPROCESSABLE_ENTITY", "Layanan order belum dipilih");

  // Penawaran baru memakai DP dari Operasional saat ini dan menyimpannya (docs/STUDIO_OPERATIONS.md).
  const { dpPercent } = await getStudioOperations();
  const dpAmount = computeDpAmount(agreedPrice, dpPercent);
  const deadlineDate = new Date(deadline);
  // Satu nomor per order: revisi harga memakai nomor yang sama.
  const invoiceNumber = intake.invoiceNumber ?? invoiceNumberFor(new Date());

  try {
    await prisma.$transaction(async (tx) => {
      await transitionIntake(tx, {
        intakeId: id,
        from: intake.status,
        action: "quote",
        actor: "ADMIN",
        data: { agreedPrice, dpAmount, dpPercent, deadline: deadlineDate, invoiceNumber, quotedById: auth.user.id, quotedAt: new Date() },
      });
      await logIntakeActivity(tx, {
        intakeId: id,
        actorId: auth.user.id,
        action: intake.status === "QUOTED" ? "WA_QUOTE_REVISED" : "WA_QUOTED",
        previousValue: { agreedPrice: intake.agreedPrice, deadline: intake.deadline },
        newValue: { agreedPrice, dpAmount, dpPercent, deadline: deadlineDate },
      });
    });
  } catch (error) {
    return intakeErrorResponse(error);
  }

  // Semua metode bayar aktif (rekening bank dan e-wallet), urut sesuai Pengaturan.
  const accounts = await prisma.paymentAccount.findMany({
    where: { isActive: true },
    select: { name: true, accountNumber: true, accountHolder: true, qrisImageUrl: true },
    orderBy: { order: "asc" },
  });
  const qris = accounts.filter((a) => a.qrisImageUrl).map((a) => ({ name: a.name, url: a.qrisImageUrl as string }));
  // Rincian kalkulator hanya bila totalnya sama dengan harga yang disimpan admin.
  const suggestion = suggestQuotePrice(intake.service, (intake.briefDraft ?? {}) as Record<string, unknown>);
  const lines = suggestion && suggestion.total === agreedPrice && !suggestion.breakdown.startsWith("Harga layanan") ? [suggestion.breakdown] : [];
  // Status sudah tersimpan; kegagalan kirim ditampilkan ke admin, bukan dibatalkan.
  const delivery = await sendInvoiceToClient(
    intake.conversationId,
    invoiceMessage({
      clientName: intake.clientName,
      serviceName: intake.service.name,
      invoiceNumber,
      agreedPrice,
      dpAmount,
      dpPercent,
      deadline: deadlineDate,
      lines,
      accounts,
      hasQris: qris.some((q) => q.url.startsWith("https://")),
    }),
    qris,
  );

  const row = await findIntakeForDetail(id);
  return NextResponse.json({
    intake: row ? await toDetail(row) : null,
    delivery,
    warnings: accounts.length ? [] : ["NO_ACTIVE_PAYMENT_ACCOUNT"],
  });
}
