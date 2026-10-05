import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// Register fonts (use built-in Helvetica for Indonesian)
Font.register({
  family: "Helvetica",
  fonts: [],
});

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 30,
    borderBottomWidth: 2,
    borderBottomColor: "#2563eb",
    paddingBottom: 20,
  },
  logo: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2563eb",
  },
  logoSub: {
    fontSize: 8,
    color: "#6b7280",
    marginTop: 2,
  },
  invoiceTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2563eb",
    textAlign: "right",
  },
  invoiceNumber: {
    fontSize: 10,
    color: "#6b7280",
    textAlign: "right",
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  infoBlock: {
    width: "48%",
  },
  infoLabel: {
    fontSize: 8,
    color: "#6b7280",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 8,
  },
  infoSub: {
    fontSize: 9,
    color: "#374151",
    marginBottom: 6,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    marginVertical: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#2563eb",
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableHeaderText: {
    fontSize: 8,
    color: "#ffffff",
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  tableRowAlt: {
    backgroundColor: "#f9fafb",
  },
  colDesc: { flex: 3 },
  colQty: { width: 40, textAlign: "center" },
  colPrice: { width: 80, textAlign: "right" },
  colTotal: { width: 90, textAlign: "right" },
  cellText: {
    fontSize: 9,
    color: "#374151",
  },
  summaryBox: {
    marginTop: 20,
    alignItems: "flex-end",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 4,
    width: 220,
  },
  summaryLabel: {
    fontSize: 9,
    color: "#6b7280",
    width: 100,
    textAlign: "right",
    paddingRight: 10,
  },
  summaryValue: {
    fontSize: 9,
    color: "#374151",
    width: 110,
    textAlign: "right",
  },
  summaryTotalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1.5,
    borderTopColor: "#2563eb",
    width: 220,
  },
  summaryTotalLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#1a1a1a",
    width: 100,
    textAlign: "right",
    paddingRight: 10,
  },
  summaryTotalValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#2563eb",
    width: 110,
    textAlign: "right",
  },
  paymentBox: {
    marginTop: 20,
    backgroundColor: "#f0f9ff",
    borderRadius: 6,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  paymentLabel: {
    fontSize: 8,
    color: "#6b7280",
    marginBottom: 2,
  },
  paymentValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1d4ed8",
  },
  statusBadge: {
    fontSize: 8,
    color: "#ffffff",
    backgroundColor: "#2563eb",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    overflow: "hidden",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: "#9ca3af",
    textAlign: "center",
  },
  noteText: {
    fontSize: 8,
    color: "#6b7280",
    marginTop: 4,
    textAlign: "center",
  },
});

type InvoiceItem = { description: string; quantity: number; unitPrice: number; total: number };

interface InvoicePDFProps {
  invoiceNumber: string;
  issuedAt: string;
  dueDate?: string | null;
  clientName: string;
  projectNumber: string;
  items: InvoiceItem[];
  subtotal: number;
  tax?: number | null;
  total: number;
  status: string;
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
    month: "long",
    year: "numeric",
  });
}

const statusLabels: Record<string, string> = {
  UNPAID: "BELUM BAYAR",
  PARTIALLY_PAID: "DP / CICILAN",
  PAID: "LUNAS",
};

export function InvoicePDF({
  invoiceNumber,
  issuedAt,
  dueDate,
  clientName,
  projectNumber,
  items,
  subtotal,
  tax,
  total,
  status,
}: InvoicePDFProps) {
  const statusLabel = statusLabels[status] || status;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>YukDesain Studio</Text>
            <Text style={styles.logoSub}>Creative Design Agency</Text>
            <Text style={styles.logoSub}>Jakarta, Indonesia</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>#{invoiceNumber}</Text>
          </View>
        </View>

        {/* Info Row */}
        <View style={[styles.section, styles.sectionRow]}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Ditagihkan kepada</Text>
            <Text style={styles.infoValue}>{clientName}</Text>
          </View>
          <View style={styles.infoBlock}>
            <View>
              <Text style={styles.infoLabel}>Tanggal Invoice</Text>
              <Text style={styles.infoValue}>{formatDate(issuedAt)}</Text>
            </View>
            {dueDate && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.infoLabel}>Jatuh Tempo</Text>
                <Text style={styles.infoValue}>{formatDate(dueDate)}</Text>
              </View>
            )}
            <View style={{ marginTop: 8 }}>
              <Text style={styles.infoLabel}>Project</Text>
              <Text style={styles.infoValue}>{projectNumber}</Text>
            </View>
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.section}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.colDesc]}>Deskripsi</Text>
            <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
            <Text style={[styles.tableHeaderText, styles.colPrice]}>Harga</Text>
            <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
          </View>

          {items.map((item, idx) => (
            <View
              key={idx}
              style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}
            >
              <View style={styles.colDesc}>
                <Text style={styles.cellText}>{item.description}</Text>
              </View>
              <View style={styles.colQty}>
                <Text style={styles.cellText}>{item.quantity}</Text>
              </View>
              <View style={styles.colPrice}>
                <Text style={styles.cellText}>{formatCurrency(item.unitPrice)}</Text>
              </View>
              <View style={styles.colTotal}>
                <Text style={styles.cellText}>{formatCurrency(item.total)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text>
          </View>
          {tax && tax > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Pajak (11%)</Text>
              <Text style={styles.summaryValue}>{formatCurrency(tax)}</Text>
            </View>
          )}
          <View style={styles.summaryTotalRow}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>{formatCurrency(total)}</Text>
          </View>
        </View>

        {/* Payment Status */}
        <View style={styles.paymentBox}>
          <View>
            <Text style={styles.paymentLabel}>Status Pembayaran</Text>
            <Text style={styles.paymentValue}>{statusLabel}</Text>
          </View>
          <View>
            <Text style={styles.paymentLabel}>Amount Due</Text>
            <Text style={styles.paymentValue}>{formatCurrency(total)}</Text>
          </View>
        </View>

        <Text style={styles.noteText}>
          Pembayaran dapat ditransfer ke rekening yang tertera pada invoice.
        </Text>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            YukDesain Studio — Creative Design Agency
          </Text>
          <Text style={styles.footerText}>
            Generated: {formatDate(new Date().toISOString())}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
