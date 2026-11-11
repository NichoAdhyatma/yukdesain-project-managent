import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waIntake: { findFirst: vi.fn(), updateMany: vi.fn() },
  paymentAccount: { findMany: vi.fn() },
}));
const outbound = vi.hoisted(() => ({ sendInvoiceToClient: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./outbound", async (orig) => ({ ...(await orig<typeof import("./outbound")>()), sendInvoiceToClient: outbound.sendInvoiceToClient }));

import { resendPendingInvoice } from "./invoice";

const pending = {
  id: "in_1",
  conversationId: "conv_1",
  clientName: "Sari",
  invoiceNumber: "INV-WA-20261111-AB12",
  agreedPrice: 1500000,
  dpAmount: 750000,
  dpPercent: 50,
  deadline: new Date("2026-11-20T00:00:00Z"),
  briefDraft: {},
  service: { name: "Logo Minimalis", startingPrice: null, packages: null, unitPricing: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.waIntake.updateMany.mockResolvedValue({ count: 1 });
  db.paymentAccount.findMany.mockResolvedValue([{ name: "BCA", accountNumber: "123", accountHolder: "YukDesain", qrisImageUrl: "https://cdn.example.com/q.png" }]);
  outbound.sendInvoiceToClient.mockResolvedValue({ ok: true, via: "text", messageId: "m", qrisSent: 1, qrisFailed: 0 });
});

describe("resendPendingInvoice (review Plan B #1)", () => {
  it("tidak ada invoice tertunda → tidak mengirim apa pun", async () => {
    db.waIntake.findFirst.mockResolvedValue(null);
    expect(await resendPendingInvoice("conv_1")).toBe(false);
    expect(outbound.sendInvoiceToClient).not.toHaveBeenCalled();
    expect(db.waIntake.findFirst.mock.calls[0][0].where).toMatchObject({ conversationId: "conv_1", status: "QUOTED", invoiceResendPending: true });
  });

  it("invoice tertunda: diklaim sekali, dikirim lengkap dengan nomor sama dan QRIS", async () => {
    db.waIntake.findFirst.mockResolvedValue(pending);
    expect(await resendPendingInvoice("conv_1")).toBe(true);
    expect(db.waIntake.updateMany.mock.calls[0][0]).toEqual({ where: { id: "in_1", invoiceResendPending: true }, data: { invoiceResendPending: false } });
    const [conv, message, qris] = outbound.sendInvoiceToClient.mock.calls[0];
    expect(conv).toBe("conv_1");
    expect(message.text).toContain("Invoice INV-WA-20261111-AB12");
    expect(message.text).toContain("Tagihan DP 50%: *Rp750.000*");
    expect(message.text).toContain("• BCA 123 a.n. YukDesain");
    expect(qris).toEqual([{ name: "BCA", url: "https://cdn.example.com/q.png" }]);
  });

  it("sudah diklaim proses lain → tidak dikirim dobel", async () => {
    db.waIntake.findFirst.mockResolvedValue(pending);
    db.waIntake.updateMany.mockResolvedValue({ count: 0 });
    expect(await resendPendingInvoice("conv_1")).toBe(false);
    expect(outbound.sendInvoiceToClient).not.toHaveBeenCalled();
  });

  it("kirim gagal → tanda tertunda dipasang lagi", async () => {
    db.waIntake.findFirst.mockResolvedValue(pending);
    outbound.sendInvoiceToClient.mockResolvedValue({ ok: false, via: "text", errorCode: "KIRIMI_FAILED", messageId: "m", qrisSent: 0, qrisFailed: 1 });
    expect(await resendPendingInvoice("conv_1")).toBe(false);
    expect(db.waIntake.updateMany.mock.calls[1][0]).toEqual({ where: { id: "in_1" }, data: { invoiceResendPending: true } });
  });
});
