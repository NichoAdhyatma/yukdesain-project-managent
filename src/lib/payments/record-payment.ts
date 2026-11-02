import type { PaymentStatus, Prisma } from "@prisma/client";

// Diekstrak dari POST /api/payments. Menerima prisma atau transaction client.
type Db = Prisma.TransactionClient;

export function computePaymentStatus(paidAmount: number, agreedPrice: number): PaymentStatus {
  if (paidAmount >= agreedPrice) return "PAID";
  if (paidAmount > 0) return "PARTIALLY_PAID";
  return "UNPAID";
}

export type RecordPaymentInput = {
  project: { id: string; projectNumber: string; paidAmount: number; agreedPrice: number };
  amount: number;
  date?: string | number | Date | null;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  recordedBy: string;
};

/**
 * Catat payment, perbarui paidAmount/paymentStatus project, samakan status struk,
 * dan tulis ActivityLog.
 */
export async function recordPayment(db: Db, input: RecordPaymentInput) {
  const { project, amount, date, method, reference, notes, recordedBy } = input;

  const paymentAmount = Math.round(amount);
  const newPaidAmount = project.paidAmount + paymentAmount;
  const paymentStatus = computePaymentStatus(newPaidAmount, project.agreedPrice);

  const payment = await db.payment.create({
    data: {
      projectId: project.id,
      amount: paymentAmount,
      date: date ? new Date(date) : new Date(),
      method: method || null,
      reference: reference || null,
      notes: notes || null,
      recordedBy,
    },
  });

  await db.project.update({
    where: { id: project.id },
    data: {
      paidAmount: Math.min(newPaidAmount, project.agreedPrice),
      paymentStatus,
    },
  });

  // Status struk mengikuti status pembayaran
  await db.invoice.updateMany({
    where: { projectId: project.id },
    data: { status: paymentStatus },
  });

  await db.activityLog.create({
    data: {
      entityType: "Payment",
      entityId: payment.id,
      action: "PAYMENT_RECORDED",
      actorId: recordedBy,
      newValue: {
        amount: paymentAmount,
        method,
        reference,
        totalPaid: newPaidAmount,
        agreedPrice: project.agreedPrice,
        status: paymentStatus,
      },
      metadata: { projectId: project.id, projectNumber: project.projectNumber },
    },
  });

  return {
    payment,
    summary: {
      agreedPrice: project.agreedPrice,
      paidAmount: Math.min(newPaidAmount, project.agreedPrice),
      remainingBalance: Math.max(0, project.agreedPrice - newPaidAmount),
      paymentStatus,
    },
  };
}
