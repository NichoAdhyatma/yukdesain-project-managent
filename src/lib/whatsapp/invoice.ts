import { prisma } from "@/lib/db";
import { suggestQuotePrice } from "@/lib/services/price-calculator";
import { DP_PERCENT } from "@/lib/constants";
import { invoiceMessage, sendInvoiceToClient, type InvoiceDelivery } from "./outbound";

// Invoice WA (spec 2026-11-11-kb-merge-design §5): dikirim saat admin menyimpan harga, dan dikirim ulang lengkap saat
// klien membalas bila sebelumnya hanya sampai sebagai template pembuka (Meta di luar 24 jam).

export type InvoiceIntake = {
  conversationId: string;
  clientName: string | null;
  invoiceNumber: string;
  agreedPrice: number;
  dpAmount: number;
  dpPercent: number;
  deadline: Date;
  briefDraft: unknown;
  service: { name: string; startingPrice: number | null; packages: unknown; unitPricing: unknown };
};

/** Bangun dan kirim invoice dengan semua metode bayar aktif + QRIS. */
export async function sendIntakeInvoice(intake: InvoiceIntake): Promise<InvoiceDelivery & { activeAccounts: number }> {
  // Semua metode bayar aktif (rekening bank dan e-wallet), urut sesuai Pengaturan.
  const accounts = await prisma.paymentAccount.findMany({
    where: { isActive: true },
    select: { name: true, accountNumber: true, accountHolder: true, qrisImageUrl: true },
    orderBy: { order: "asc" },
  });
  const qris = accounts.filter((a) => a.qrisImageUrl).map((a) => ({ name: a.name, url: a.qrisImageUrl as string }));
  // Rincian kalkulator hanya bila totalnya sama dengan harga yang disimpan admin.
  const suggestion = suggestQuotePrice(intake.service, (intake.briefDraft ?? {}) as Record<string, unknown>);
  const lines =
    suggestion && suggestion.total === intake.agreedPrice && !suggestion.breakdown.startsWith("Harga layanan") ? [suggestion.breakdown] : [];
  const delivery = await sendInvoiceToClient(
    intake.conversationId,
    invoiceMessage({
      clientName: intake.clientName,
      serviceName: intake.service.name,
      invoiceNumber: intake.invoiceNumber,
      agreedPrice: intake.agreedPrice,
      dpAmount: intake.dpAmount,
      dpPercent: intake.dpPercent,
      deadline: intake.deadline,
      lines,
      accounts,
      hasQris: qris.some((q) => /^https:\/\//i.test(q.url.trim())),
    }),
    qris,
  );
  return { ...delivery, activeAccounts: accounts.length };
}

/**
 * Klien membalas setelah invoice hanya sampai sebagai template: kirim invoice lengkap + QRIS sekarang (jendela 24 jam
 * terbuka). Tanda diklaim atomik supaya pesan beruntun tidak mengirim dobel; gagal → tanda dipasang lagi.
 */
export async function resendPendingInvoice(conversationId: string): Promise<boolean> {
  const intake = await prisma.waIntake.findFirst({
    where: { conversationId, status: "QUOTED", invoiceResendPending: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      conversationId: true,
      clientName: true,
      invoiceNumber: true,
      agreedPrice: true,
      dpAmount: true,
      dpPercent: true,
      deadline: true,
      briefDraft: true,
      service: { select: { name: true, startingPrice: true, packages: true, unitPricing: true } },
    },
  });
  if (!intake || !intake.service || !intake.invoiceNumber || intake.agreedPrice === null || intake.dpAmount === null || !intake.deadline) {
    return false;
  }
  const claimed = await prisma.waIntake.updateMany({
    where: { id: intake.id, invoiceResendPending: true },
    data: { invoiceResendPending: false },
  });
  if (claimed.count === 0) return false;

  const delivery = await sendIntakeInvoice({
    ...intake,
    invoiceNumber: intake.invoiceNumber,
    agreedPrice: intake.agreedPrice,
    dpAmount: intake.dpAmount,
    dpPercent: intake.dpPercent ?? DP_PERCENT,
    deadline: intake.deadline,
    service: intake.service,
  });
  if (!delivery.ok || delivery.via === "template") {
    await prisma.waIntake.updateMany({ where: { id: intake.id }, data: { invoiceResendPending: true } });
    return false;
  }
  return true;
}
