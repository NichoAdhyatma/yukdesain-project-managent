import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// Thermal receipt 80mm: black & white, Courier monospace.
// Tracking code: highlighted box (black bg, white text) agar user mudah notice.

const C = {
  black: "#111111",
  gray: "#6b7280",
  white: "#FFFFFF",
  blue: "#2563EB",
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
    backgroundColor: C.black,
    alignItems: "center",
    paddingVertical: 4,
    marginBottom: 8,
  },
  titleText: { fontFamily: FONT_BOLD, fontSize: 9, color: C.white, letterSpacing: 1.5 },

  // ── KV row ────────────────────────────────────────────────────────────────
  kvRow: { flexDirection: "row", marginBottom: 2 },
  kvLabel: { width: LABEL_W, fontSize: 8, color: C.gray },
  kvValue: { flex: 1, fontSize: 8 },

  // ── Item ─────────────────────────────────────────────────────────────────
  itemBlock: { marginBottom: 5 },
  itemDesc: { fontFamily: FONT_BOLD, fontSize: 8.5, marginBottom: 1 },
  itemBottom: { flexDirection: "row", justifyContent: "space-between" },
  itemCalc: { fontSize: 8, color: C.gray },
  itemTotal: { fontFamily: FONT_BOLD, fontSize: 8.5, textAlign: "right" },

  // ── Summary ────────────────────────────────────────────────────────────────
  sumRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 2 },
  sumLabel: { fontSize: 8, color: C.gray, width: 100, textAlign: "right", paddingRight: 8 },
  sumValue: { fontSize: 8, minWidth: 80, textAlign: "right" },
  sumAccent: { color: C.blue },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 3,
    borderTopWidth: 0.5,
    borderTopColor: C.black,
    marginTop: 2,
  },
  totalLabel: { fontFamily: FONT_BOLD, fontSize: 10, width: 100, textAlign: "right", paddingRight: 8 },
  totalValue: { fontFamily: FONT_BOLD, fontSize: 10, minWidth: 80, textAlign: "right", color: C.blue },

  // ── Divider ────────────────────────────────────────────────────────────────
  divider: { borderBottomWidth: 0.5, borderBottomColor: C.black, marginVertical: 5 },

  // ── Status ────────────────────────────────────────────────────────────────
  status: { alignItems: "center", marginBottom: 4 },
  statusBadge: {
    fontFamily: FONT_BOLD, fontSize: 9, letterSpacing: 1,
    paddingVertical: 3, paddingHorizontal: 10,
    borderWidth: 1, borderColor: C.black,
  },

  // ── Payment ───────────────────────────────────────────────────────────────
  payment: { alignItems: "center", marginBottom: 2 },
  paymentLabel: { fontSize: 7, color: C.gray, marginBottom: 2 },
  paymentName: { fontFamily: FONT_BOLD, fontSize: 9, marginBottom: 1 },
  paymentNumber: { fontSize: 9, letterSpacing: 1.5, marginBottom: 1 },
  paymentHolder: { fontSize: 7.5, color: C.gray },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: { alignItems: "center", marginTop: 4 },
  footerText: { fontSize: 7, color: C.gray, textAlign: "center" },

  // ── Tracking highlight — black box, white text ─────────────────────────────
  trackingBox: {
    backgroundColor: C.black,
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  trackingLabel: { fontSize: 7, color: "#9ca3af", marginBottom: 2, letterSpacing: 0.5 },
  trackingCode: { fontFamily: FONT_BOLD, fontSize: 12, color: C.white, letterSpacing: 2, marginBottom: 2 },
  trackingHint: { fontSize: 7, color: "#9ca3af", textAlign: "center" },
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

function SRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.sumRow}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={[styles.sumValue, accent ? styles.sumAccent : {}]}>{value}</Text>
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
          <Text style={styles.company}>YukDesain Studio</Text>
          <Text style={styles.tagline}>Creative Design Agency, Jakarta</Text>
        </View>

        {/* Title */}
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>STRUK PEMBAYARAN</Text>
        </View>

        {/* Meta */}
        <KV label="NO." value={invoiceNumber} />
        <KV label="TANGGAL" value={fmtDate(issuedAt)} />

        <View style={styles.divider} />

        {/* Info */}
        <KV label="CLIENT" value={clientName} bold />
        <KV label="PROJECT" value={projectNumber} bold />
        {serviceName ? <KV label="LAYANAN" value={serviceName} /> : null}

        <View style={styles.divider} />

        {/* Items */}
        {items.map((item, idx) => (
          <View key={idx} style={styles.itemBlock}>
            <Text style={styles.itemDesc}>{item.description}</Text>
            <View style={styles.itemBottom}>
              <Text style={styles.itemCalc}>
                {item.quantity} x {fmtRp(item.unitPrice)}
              </Text>
              <Text style={styles.itemTotal}>{fmtRp(item.total)}</Text>
            </View>
          </View>
        ))}

        <View style={styles.divider} />

        {/* Summary */}
        <SRow label="Subtotal" value={fmtRp(subtotal)} />
        {paidAmount > 0 && (
          <SRow label="Sdh Bayar" value={`-${fmtRp(paidAmount)}`} accent />
        )}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL</Text>
          <Text style={styles.totalValue}>{fmtRp(total)}</Text>
        </View>
        <SRow label="Sisa" value={fmtRp(remaining)} accent={!isPaid} />

        <View style={styles.divider} />

        {/* Status */}
        <View style={styles.status}>
          <Text style={styles.statusBadge}>{statusLabel}</Text>
        </View>

        {/* Payment account */}
        {showAccount && account ? (
          <View>
            <View style={styles.divider} />
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
            <Text style={styles.trackingHint}>Cek progress di Client Portal</Text>
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
