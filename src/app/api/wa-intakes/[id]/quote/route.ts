import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { computeDpAmount, transitionIntake } from "@/lib/whatsapp/intake";
import { getStudioOperations } from "@/lib/studio-operations";
import { invoiceNumberFor } from "@/lib/whatsapp/outbound";
import { sendIntakeInvoice } from "@/lib/whatsapp/invoice";
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

/** Simpan ulang tanpa perubahan dalam rentang ini dianggap klik ganda (produksi 2026-11-13: invoice YAHDI terkirim 2x). */
const SAME_QUOTE_WINDOW_MS = 10 * 60_000;

function isRecentSameQuote(
  intake: { status: string; agreedPrice: number | null; deadline: Date | null; quotedAt: Date | null },
  agreedPrice: number,
  deadline: string,
): boolean {
  return (
    intake.status === "QUOTED" &&
    intake.agreedPrice === agreedPrice &&
    intake.deadline?.toISOString().slice(0, 10) === deadline.slice(0, 10) &&
    intake.quotedAt !== null &&
    Date.now() - intake.quotedAt.getTime() < SAME_QUOTE_WINDOW_MS
  );
}

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
      quotedAt: true,
      invoiceNumber: true,
      briefDraft: true,
      service: { select: { name: true, startingPrice: true, packages: true, unitPricing: true } },
    },
  });
  if (!intake) return errorResponse("NOT_FOUND", "Order WA tidak ditemukan");
  if (!intake.service) return errorResponse("UNPROCESSABLE_ENTITY", "Layanan order belum dipilih");
  if (isRecentSameQuote(intake, agreedPrice, deadline)) {
    return errorResponse(
      "CONFLICT",
      "Invoice dengan harga dan deadline yang sama baru saja dikirim ke klien, jadi tidak dikirim ulang. Ubah harga atau deadline untuk merevisi.",
    );
  }

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

  // Status sudah tersimpan; kegagalan kirim ditampilkan ke admin, bukan dibatalkan.
  const delivery = await sendIntakeInvoice({
    conversationId: intake.conversationId,
    clientName: intake.clientName,
    invoiceNumber,
    agreedPrice,
    dpAmount,
    dpPercent,
    deadline: deadlineDate,
    briefDraft: intake.briefDraft,
    service: intake.service,
  });
  // Meta di luar 24 jam: klien baru menerima template pembuka. Invoice lengkap + QRIS dikirim saat klien membalas.
  const viaTemplate = delivery.ok && delivery.via === "template";
  if (viaTemplate) await prisma.waIntake.updateMany({ where: { id }, data: { invoiceResendPending: true } });

  const row = await findIntakeForDetail(id);
  return NextResponse.json({
    intake: row ? await toDetail(row) : null,
    delivery,
    warnings: [...(delivery.activeAccounts ? [] : ["NO_ACTIVE_PAYMENT_ACCOUNT"]), ...(viaTemplate ? ["INVOICE_VIA_TEMPLATE"] : [])],
  });
}
