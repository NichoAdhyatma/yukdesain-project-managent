import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { computePaymentStatus, recordPayment } from "./record-payment";

function makeDb() {
  return {
    payment: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "pay_1", ...data })),
    },
    project: { update: vi.fn(async () => ({})) },
    invoice: { updateMany: vi.fn(async () => ({ count: 1 })) },
    activityLog: { create: vi.fn(async () => ({})) },
  };
}

const asDb = (db: ReturnType<typeof makeDb>) => db as unknown as Prisma.TransactionClient;
const project = { id: "proj_1", projectNumber: "PRJ-1", paidAmount: 1000000, agreedPrice: 2500000 };

describe("computePaymentStatus", () => {
  it.each([
    [0, 2500000, "UNPAID"],
    [1, 2500000, "PARTIALLY_PAID"],
    [2500000, 2500000, "PAID"],
    [3000000, 2500000, "PAID"],
  ])("paid %i dari %i → %s", (paid, price, expected) => {
    expect(computePaymentStatus(paid, price)).toBe(expected);
  });
});

describe("recordPayment", () => {
  it("menulis data yang sama seperti POST /api/payments lama", async () => {
    const db = makeDb();
    const result = await recordPayment(asDb(db), {
      project,
      amount: 1500000,
      date: "2026-11-01",
      method: "TRANSFER",
      reference: "REF-1",
      notes: "",
      recordedBy: "owner_1",
    });

    expect(db.payment.create).toHaveBeenCalledWith({
      data: {
        projectId: "proj_1",
        amount: 1500000,
        date: new Date("2026-11-01"),
        method: "TRANSFER",
        reference: "REF-1",
        notes: null,
        recordedBy: "owner_1",
      },
    });
    expect(db.project.update).toHaveBeenCalledWith({
      where: { id: "proj_1" },
      data: { paidAmount: 2500000, paymentStatus: "PAID" },
    });
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { projectId: "proj_1" },
      data: { status: "PAID" },
    });
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: {
        entityType: "Payment",
        entityId: "pay_1",
        action: "PAYMENT_RECORDED",
        actorId: "owner_1",
        newValue: {
          amount: 1500000,
          method: "TRANSFER",
          reference: "REF-1",
          totalPaid: 2500000,
          agreedPrice: 2500000,
          status: "PAID",
        },
        metadata: { projectId: "proj_1", projectNumber: "PRJ-1" },
      },
    });
    expect(result.summary).toEqual({
      agreedPrice: 2500000,
      paidAmount: 2500000,
      remainingBalance: 0,
      paymentStatus: "PAID",
    });
  });

  it("kelebihan bayar: paidAmount dibatasi harga, sisa tidak negatif", async () => {
    const db = makeDb();
    const { summary } = await recordPayment(asDb(db), {
      project,
      amount: 2000000,
      recordedBy: "owner_1",
    });
    expect(summary).toEqual({
      agreedPrice: 2500000,
      paidAmount: 2500000,
      remainingBalance: 0,
      paymentStatus: "PAID",
    });
  });

  it("pembayaran sebagian dan field opsional kosong", async () => {
    const db = makeDb();
    const { payment, summary } = await recordPayment(asDb(db), {
      project,
      amount: 500000.4,
      recordedBy: "owner_1",
    });
    expect(payment).toMatchObject({ amount: 500000, method: null, reference: null, notes: null });
    expect(summary).toMatchObject({ paidAmount: 1500000, remainingBalance: 1000000, paymentStatus: "PARTIALLY_PAID" });
  });
});
