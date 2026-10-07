import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// YukDesain brand colors (from globals.css design tokens)
const C = {
  brand: "#8B5CF6",
  brandDark: "#7C3AED",
  brandLight: "#EDE9FE",
  brandLighter: "#F5F3FF",
  black: "#111827",
  white: "#FFFFFF",
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    700: "#374151",
  },
  success: "#059669",
  successBg: "#ECFDF5",
  danger: "#B91C1C",
  dangerBg: "#FEF2F2",
};

const W = 340; // page width minus padding

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontFamily: "Helvetica",
    backgroundColor: C.white,
  },
  receiptBox: {
    borderWidth: 1,
    borderColor: C.gray[300],
    borderStyle: "solid",
    borderRadius: 8,
    overflow: "hidden",
  },

  // ── Header Banner ─────────────────────────────────────────────────────────────
  headerBanner: {
    backgroundColor: C.brandDark,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  companyName: {
    fontSize: 18,
    fontWeight: "bold",
    color: C.white,
    marginBottom: 2,
  },
  companyTagline: {
    fontSize: 8,
    color: "rgba(255,255,255,0.75)",
    marginBottom: 1,
  },

  // ── Receipt Title Row ────────────────────────────────────────────────────────
  titleRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.gray[200],
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleLabel: {
    fontSize: 13,
    fontWeight: "bold",
    color: C.brandDark,
  },
  titleNumber: {
    fontSize: 8,
    color: C.gray[500],
  },

  // ── Info Section ─────────────────────────────────────────────────────────────
  infoSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.gray[200],
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  infoLeftCol: {
    width: "50%",
  },
  infoRightCol: {
    width: "50%",
    alignItems: "flex-end",
  },
  infoLabel: {
    fontSize: 7,
    color: C.gray[400],
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  infoValue: {
    fontSize: 10,
    color: C.black,
    marginBottom: 6,
  },
  infoValueBold: {
    fontSize: 11,
    fontWeight: "bold",
    color: C.black,
    marginBottom: 6,
  },

  // ── Items Section ────────────────────────────────────────────────────────────
  itemsSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.gray[200],
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: C.gray[500],
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  // Cols: desc(170) qty(28) price(68) total(74) = 340
  colHeader: {
    flexDirection: "row",
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.gray[200],
    marginBottom: 4,
  },
  colHeaderText: {
    fontSize: 7,
    color: C.gray[400],
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  colDesc: { width: 170 },
  colQty: { width: 28, textAlign: "center" },
  colPrice: { width: 68, textAlign: "right" },
  colTotal: { width: 74, textAlign: "right" },
  itemRow: {
    flexDirection: "row",
    paddingVertical: 5,
  },
  itemDesc: {
    width: 170,
    fontSize: 9,
    color: C.gray[700],
  },
  itemQty: {
    width: 28,
    fontSize: 9,
    color: C.gray[700],
    textAlign: "center",
  },
  itemPrice: {
    width: 68,
    fontSize: 9,
    color: C.gray[700],
    textAlign: "right",
  },
  itemTotal: {
    width: 74,
    fontSize: 9,
    color: C.black,
    fontWeight: "bold",
    textAlign: "right",
  },

  // ── Summary Section ─────────────────────────────────────────────────────────
  summarySection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.gray[200],
  },
  summaryLine: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 5,
    width: 160,
  },
  summaryLinePaid: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 5,
    width: 160,
  },
  summaryLineLabel: {
    fontSize: 9,
    color: C.gray[500],
    width: 90,
    textAlign: "right",
    paddingRight: 8,
  },
  summaryLineValue: {
    fontSize: 9,
    color: C.gray[700],
    width: 70,
    textAlign: "right",
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: C.brand,
    width: 160,
  },
  totalLineLabel: {
    fontSize: 13,
    fontWeight: "bold",
    color: C.brandDark,
    width: 90,
    textAlign: "right",
    paddingRight: 8,
  },
  totalLineValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: C.brandDark,
    width: 70,
    textAlign: "right",
  },

  // ── Payment Info ─────────────────────────────────────────────────────────────
  paymentSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.gray[200],
  },
  paymentGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  paymentCard: {
    flex: 1,
    backgroundColor: C.brandLighter,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  paymentCardLabel: {
    fontSize: 7,
    color: C.brandDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  paymentCardValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.brandDark,
    marginBottom: 1,
  },
  paymentCardSub: {
    fontSize: 8,
    color: C.gray[500],
    marginBottom: 1,
  },
  paymentCardSubBold: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.black,
    marginBottom: 1,
  },
  remainingCard: {
    flex: 1,
    backgroundColor: C.dangerBg,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  paidCard: {
    flex: 1,
    backgroundColor: C.successBg,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },

  // ── Footer ──────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: C.gray[50],
  },
  footerText: {
    fontSize: 8,
    color: C.gray[400],
    textAlign: "center",
  },
  footerNote: {
    fontSize: 9,
    color: C.gray[500],
    textAlign: "center",
    marginTop: 3,
  },
});

type InvoiceItem = { description: string; quantity: number; unitPrice: number; total: number };
type PaymentAccount = { id: string; type: string; name: string; accountNumber: string; accountHolder: string; isActive?: boolean };

interface ReceiptPDFProps {
  invoiceNumber: string;
  issuedAt: string;
  clientName: string;
  projectNumber: string;
  serviceName?: string;
  items: InvoiceItem[];
  subtotal: number;
  total: number;
  paidAmount: number;
  paymentStatus: string;
  agreedPrice: number;
  paymentAccounts?: PaymentAccount[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusLabels: Record<string, string> = {
  UNPAID: "BELUM BAYAR",
  PARTIALLY_PAID: "DP / CICILAN",
  PAID: "LUNAS",
};

export function ReceiptPDF({
  invoiceNumber,
  issuedAt,
  clientName,
  projectNumber,
  serviceName,
  items,
  subtotal,
  total,
  paidAmount,
  paymentStatus,
  paymentAccounts,
}: ReceiptPDFProps) {
  const statusLabel = statusLabels[paymentStatus] || paymentStatus;
  const remaining = Math.max(0, total - paidAmount);
  const accounts = paymentAccounts?.filter((a) => a.isActive !== false) ?? [];

  return (
    <Document>
      <Page size={[W + 48, 720]} style={styles.page}>
        <View style={styles.receiptBox}>
          {/* Header Banner */}
          <View style={styles.headerBanner}>
            <Text style={styles.companyName}>YukDesain Studio</Text>
            <Text style={styles.companyTagline}>Creative Design Agency · Jakarta</Text>
          </View>

          {/* Title Row */}
          <View style={styles.titleRow}>
            <Text style={styles.titleLabel}>STRUK PEMBAYARAN</Text>
            <Text style={styles.titleNumber}>{invoiceNumber}</Text>
          </View>

          {/* Info Section */}
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <View style={styles.infoLeftCol}>
                <Text style={styles.infoLabel}>Client</Text>
                <Text style={styles.infoValueBold}>{clientName}</Text>
                <Text style={styles.infoLabel}>Project</Text>
                <Text style={styles.infoValue}>{projectNumber}</Text>
                {serviceName && (
                  <>
                    <Text style={styles.infoLabel}>Layanan</Text>
                    <Text style={styles.infoValue}>{serviceName}</Text>
                  </>
                )}
              </View>
              <View style={styles.infoRightCol}>
                <Text style={styles.infoLabel}>Tanggal</Text>
                <Text style={styles.infoValue}>{formatDate(issuedAt)}</Text>
                <Text style={styles.infoLabel}>Pukul</Text>
                <Text style={styles.infoValue}>{formatTime(issuedAt)}</Text>
              </View>
            </View>
          </View>

          {/* Items Section */}
          <View style={styles.itemsSection}>
            <Text style={styles.sectionTitle}>Rincian Tagihan</Text>

            {/* Table Header */}
            <View style={styles.colHeader}>
              <Text style={[styles.colDesc, styles.colHeaderText]}>Deskripsi</Text>
              <Text style={[styles.colQty, styles.colHeaderText]}>Qty</Text>
              <Text style={[styles.colPrice, styles.colHeaderText]}>Harga</Text>
              <Text style={[styles.colTotal, styles.colHeaderText]}>Total</Text>
            </View>

            {/* Item Rows */}
            {items.map((item, idx) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemDesc}>{item.description}</Text>
                <Text style={styles.itemQty}>{item.quantity}</Text>
                <Text style={styles.itemPrice}>{formatCurrency(item.unitPrice)}</Text>
                <Text style={styles.itemTotal}>{formatCurrency(item.total)}</Text>
              </View>
            ))}
          </View>

          {/* Summary Section */}
          <View style={styles.summarySection}>
            <View style={[styles.summaryLine, { marginLeft: "auto" }]}>
              <Text style={styles.summaryLineLabel}>Subtotal</Text>
              <Text style={styles.summaryLineValue}>{formatCurrency(subtotal)}</Text>
            </View>
            {paidAmount > 0 && (
              <View style={[styles.summaryLinePaid, { marginLeft: "auto" }]}>
                <Text style={styles.summaryLineLabel}>Sudah Dibayar</Text>
                <Text style={[styles.summaryLineValue, { color: C.success }]}>
                  -{formatCurrency(paidAmount)}
                </Text>
              </View>
            )}
            <View style={[styles.totalLine, { marginLeft: "auto" }]}>
              <Text style={styles.totalLineLabel}>TOTAL</Text>
              <Text style={styles.totalLineValue}>{formatCurrency(total)}</Text>
            </View>
          </View>

          {/* Payment Info */}
          <View style={styles.paymentSection}>
            <Text style={styles.sectionTitle}>Informasi Pembayaran</Text>
            <View style={styles.paymentGrid}>
              {/* Left: Status + Amount */}
              <View style={remaining > 0 ? styles.remainingCard : styles.paidCard}>
                <Text style={styles.paymentCardLabel}>Status</Text>
                <Text style={styles.paymentCardValue}>{statusLabel}</Text>
                <Text style={styles.paymentCardLabel}>
                  {remaining > 0 ? "Sisa Bayar" : "Total Bayar"}
                </Text>
                <Text style={[
                  styles.paymentCardSubBold,
                  { color: remaining > 0 ? C.danger : C.success },
                ]}>
                  {formatCurrency(remaining > 0 ? remaining : paidAmount)}
                </Text>
              </View>

              {/* Right: Payment Account (first one) */}
              {accounts.length > 0 ? (
                <View style={styles.paymentCard}>
                  <Text style={styles.paymentCardLabel}>
                    {accounts[0].type === "BANK" ? "Transfer Bank" : "E-Wallet"}
                  </Text>
                  <Text style={styles.paymentCardValue}>{accounts[0].name}</Text>
                  <Text style={styles.paymentCardSubBold}>{accounts[0].accountNumber}</Text>
                  <Text style={styles.paymentCardSub}>a/n {accounts[0].accountHolder}</Text>
                </View>
              ) : remaining > 0 ? (
                <View style={styles.paymentCard}>
                  <Text style={styles.paymentCardLabel}>Transfer ke</Text>
                  <Text style={[styles.paymentCardSubBold, { fontSize: 8 }]}>
                    Hubungi admin untuk info rekening
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              YukDesain Studio · Simpan struk ini sebagai bukti pembayaran
            </Text>
            <Text style={styles.footerNote}>Terima kasih atas kepercayaan Anda</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
