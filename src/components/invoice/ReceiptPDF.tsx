import { Document, Page, Text, View, StyleSheet, Link } from "@react-pdf/renderer";

// Thermal receipt 80mm: black & white, Courier monospace.
// Tracking code: highlighted box (black bg, white text) agar user mudah notice.

const C = {
  black: "#111111",
  gray: "#6b7280",
  white: "#FFFFFF",
  primary: "#013BA6",
};

const PW = 226; // 80mm ≈ 226pt
const PAD = 12;

const FONT = "Courier";
const FONT_BOLD = "Courier-Bold";
const LABEL_W = 52;

const styles = StyleSheet.create({
  page: {
    paddingVertical: 14,
    paddingHorizontal: PAD,
    fontFamily: FONT,
    fontSize: 8,
    color: C.black,
    backgroundColor: C.white,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: { alignItems: "center", marginBottom: 4 },
  company: { fontFamily: FONT_BOLD, fontSize: 12, textAlign: "center" },
  tagline: { fontSize: 7, color: C.gray, textAlign: "center", marginTop: 1 },

  // ── Title bar ──────────────────────────────────────────────────────────────
  titleBar: {
    backgroundColor: C.primary,
    alignItems: "center",
    paddingVertical: 4,
    marginBottom: 8,
  },
  titleText: { fontFamily: FONT_BOLD, fontSize: 9, color: C.white, letterSpacing: 1.5 },

  // ── KV row ────────────────────────────────────────────────────────────────
  kvRow: { flexDirection: "row", marginBottom: 2 },
  kvLabel: { width: LABEL_W, fontSize: 8, color: C.gray },
  kvValue: { flex: 1, fontSize: 8 },

  // ── Item table ─────────────────────────────────────────────────────────────
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.black,
    borderTopWidth: 1,
    borderTopColor: C.black,
    paddingVertical: 3,
    marginBottom: 2,
  },
  thDesc: { flex: 1, fontFamily: FONT_BOLD, fontSize: 7.5, color: C.black, letterSpacing: 0.5 },
  thQty: { width: 22, fontFamily: FONT_BOLD, fontSize: 7.5, color: C.black, textAlign: "center" },
  thPrice: { width: 42, fontFamily: FONT_BOLD, fontSize: 7.5, color: C.black, textAlign: "right" },
  thTotal: { width: 46, fontFamily: FONT_BOLD, fontSize: 7.5, color: C.black, textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 3,
  },
  rowDesc: { flex: 1, fontFamily: FONT_BOLD, fontSize: 8, color: C.black },
  rowQty: { width: 22, fontFamily: FONT_BOLD, fontSize: 8, color: C.black, textAlign: "center" },
  rowPrice: { width: 42, fontFamily: FONT_BOLD, fontSize: 8, color: C.black, textAlign: "right" },
  rowTotal: { width: 46, fontFamily: FONT_BOLD, fontSize: 8, color: C.black, textAlign: "right" },

  // ── Summary table ──────────────────────────────────────────────────────────
  summaryHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.black,
    paddingVertical: 2,
    marginBottom: 1,
  },
  sumRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 2,
  },
  sumLabel: { flex: 1, fontSize: 7.5, color: C.black },
  sumValue: { width: 46, fontSize: 7.5, color: C.black, textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderTopWidth: 1,
    borderTopColor: C.black,
    paddingVertical: 3,
  },
  totalLabel: { flex: 1, fontFamily: FONT_BOLD, fontSize: 9, color: C.black },
  totalValue: { width: 46, fontFamily: FONT_BOLD, fontSize: 9, color: C.black, textAlign: "right" },

  // ── Divider ────────────────────────────────────────────────────────────────
  divider: { borderBottomWidth: 0.5, borderBottomColor: C.primary, marginVertical: 5 },

  // ── Status ────────────────────────────────────────────────────────────────
  status: { alignItems: "center", marginBottom: 4 },
  statusBadge: {
    fontFamily: FONT_BOLD, fontSize: 9, letterSpacing: 1,
    paddingVertical: 3, paddingHorizontal: 10,
    borderWidth: 1, borderColor: C.black,
  },

  // ── Payment ───────────────────────────────────────────────────────────────
  payment: { alignItems: "center", marginBottom: 2 },
  paymentLabel: { fontSize: 7, color: C.black, marginBottom: 2 },
  paymentName: { fontFamily: FONT_BOLD, fontSize: 9, marginBottom: 1, color: C.black },
  paymentNumber: { fontSize: 9, letterSpacing: 1.5, marginBottom: 1, color: C.black },
  paymentHolder: { fontSize: 7.5, color: C.black },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: { alignItems: "center", marginTop: 4 },
  footerText: { fontSize: 7, color: C.black, textAlign: "center" },

  // ── Tracking highlight — primary box, white text ─────────────────────────────
  trackingBox: {
    backgroundColor: C.primary,
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  trackingLabel: { fontSize: 7, color: "rgba(255,255,255,0.7)", marginBottom: 2, letterSpacing: 0.5 },
  trackingCode: { fontFamily: FONT_BOLD, fontSize: 12, color: C.white, letterSpacing: 2, marginBottom: 2 },
  trackingHint: { fontSize: 7, color: "rgba(255,255,255,0.7)", textAlign: "center" },
  trackingHintLink: { fontSize: 7, color: C.white, textDecoration: "underline", textAlign: "center" },
});

// ─────────────────────────────────────────────────────────────────────────────

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
  clientToken?: string;
  studioName?: string;
  clientPortalUrl?: string;
}

function fmtRp(amount: number): string {
  const n = Math.round(Number.isFinite(amount) ? amount : 0);
  const digits = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}Rp ${digits}`;
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "-";
  const date = d.toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    timeZone: "Asia/Jakarta",
  });
  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Asia/Jakarta",
  });
  return `${date}, ${time} WIB`;
}

const STATUS_LABELS: Record<string, string> = {
  UNPAID: "BELUM BAYAR",
  PARTIALLY_PAID: "DP / CICILAN",
  PAID: "LUNAS",
};

function KV({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={[styles.kvValue, bold ? { fontFamily: FONT_BOLD } : {}]}>{value}</Text>
    </View>
  );
}

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
  clientToken,
  studioName = "YukDesain Studio",
  clientPortalUrl = "/client-portal",
}: ReceiptPDFProps) {
  const statusLabel = STATUS_LABELS[paymentStatus] || paymentStatus;
  const remaining = Math.max(0, total - paidAmount);
  const isPaid = remaining === 0;
  const account = paymentAccounts?.find((a) => a.isActive !== false);
  const showAccount = !isPaid && !!account;

  return (
    <Document>
      <Page size={[PW, 640]} style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.company}>{studioName}</Text>
          <Text style={styles.tagline}>Creative Design Agency, Jakarta</Text>
        </View>

        {/* Title */}
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>STRUK PEMBAYARAN</Text>
        </View>

        {/* Meta */}
        <KV label="NO." value={invoiceNumber} />
        <KV label="TANGGAL" value={fmtDate(issuedAt)} />

        {/* Info */}
        <KV label="CLIENT" value={clientName} bold />
        <KV label="PROJECT" value={projectNumber} bold />
        {serviceName ? <KV label="LAYANAN" value={serviceName} /> : null}

        {/* Items */}
        <View style={styles.tableHeader}>
          <Text style={styles.thDesc}>DESKRIPSI</Text>
          <Text style={styles.thQty}>QTY</Text>
          <Text style={styles.thPrice}>HARGA</Text>
          <Text style={styles.thTotal}>TOTAL</Text>
        </View>
        {items.map((item, idx) => (
          <View key={idx} style={styles.tableRow}>
            <Text style={styles.rowDesc}>{item.description}</Text>
            <Text style={styles.rowQty}>{item.quantity}</Text>
            <Text style={styles.rowPrice}>{fmtRp(item.unitPrice)}</Text>
            <Text style={styles.rowTotal}>{fmtRp(item.total)}</Text>
          </View>
        ))}

        {/* Summary */}
        {paidAmount > 0 && (
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Sdh Bayar</Text>
            <Text style={styles.sumValue}>-{fmtRp(paidAmount)}</Text>
          </View>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalValue}>{fmtRp(total)}</Text>
        </View>
        {remaining > 0 && (
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Sisa</Text>
            <Text style={styles.sumValue}>{fmtRp(remaining)}</Text>
          </View>
        )}

        {/* Status */}
        <View style={styles.status}>
          <Text style={styles.statusBadge}>{statusLabel}</Text>
        </View>

        {/* Payment account */}
        {showAccount && account ? (
          <View>
            <View style={styles.payment}>
              <Text style={styles.paymentLabel}>
                {account.type === "BANK" ? "TRANSFER BANK" : "E-WALLET"}
              </Text>
              <Text style={styles.paymentName}>{account.name}</Text>
              <Text style={styles.paymentNumber}>{account.accountNumber}</Text>
              <Text style={styles.paymentHolder}>a/n {account.accountHolder}</Text>
            </View>
          </View>
        ) : null}

        {/* Tracking code — highlighted */}
        {clientToken ? (
          <View style={styles.trackingBox}>
            <Text style={styles.trackingLabel}>KODE LACAK PESANAN</Text>
            <Text style={styles.trackingCode}>{clientToken}</Text>
            <Link src={clientPortalUrl} style={styles.trackingHintLink}>
              Cek progress di Client Portal
            </Link>
          </View>
        ) : null}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Simpan struk ini sebagai bukti pembayaran</Text>
        </View>
      </Page>
    </Document>
  );
}
