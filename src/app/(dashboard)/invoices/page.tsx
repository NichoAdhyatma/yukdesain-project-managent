"use client";

import { useState, useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Download, Eye, FileText, Loader2 } from "lucide-react";
import { ReceiptPDF } from "@/components/invoice/ReceiptPDF";

type InvoiceItem = { description: string; quantity: number; unitPrice: number; total: number };
type Invoice = {
  id: string;
  projectId: string;
  invoiceNumber: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number | null;
  total: number;
  status: string;
  issuedAt: string;
  project: {
    id: string;
    projectNumber: string;
    clientName: string;
    agreedPrice: number;
    paidAmount: number;
    paymentStatus: string;
    service?: { name: string } | null;
  };
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  UNPAID: { label: "Belum Bayar", variant: "destructive" },
  PARTIALLY_PAID: { label: "DP", variant: "secondary" },
  PAID: { label: "Lunas", variant: "default" },
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function loadInvoices() {
    try {
      const res = await fetch("/api/invoices");
      const data = await res.json();
      if (data.invoices) setInvoices(data.invoices);
    } catch (e) {
      console.error("Failed to load invoices:", e);
    } finally {
      setLoading(false);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect -- pre-existing pattern in codebase */
  useEffect(() => {
    loadInvoices();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleDownloadPDF(invoice: Invoice) {
    setDownloadingId(invoice.id);
    try {
      const doc = (
        <ReceiptPDF
          invoiceNumber={invoice.invoiceNumber}
          issuedAt={invoice.issuedAt}
          clientName={invoice.project.clientName}
          projectNumber={invoice.project.projectNumber}
          serviceName={invoice.project.service?.name}
          items={invoice.items}
          subtotal={invoice.subtotal}
          total={invoice.total}
          paidAmount={invoice.project.paidAmount}
          paymentStatus={invoice.status}
          agreedPrice={invoice.project.agreedPrice}
        />
      );
      const blob = await pdf(doc).toBlob();
      saveAs(blob, `${invoice.invoiceNumber}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      toast("Gagal generate PDF. Coba lagi.", "error");
    } finally {
      setDownloadingId(null);
    }
  }

  const filteredInvoices = invoices.filter((invoice) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      invoice.invoiceNumber.toLowerCase().includes(query) ||
      invoice.project.projectNumber.toLowerCase().includes(query) ||
      invoice.project.clientName.toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-4 p-6 border-b border-border">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Struk Pembayaran</h1>
          <p className="text-muted-foreground text-sm">Struk pembayaran auto-generated per project</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari struk..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            options={[
              { value: "all", label: "Semua Status" },
              { value: "UNPAID", label: "Belum Bayar" },
              { value: "PARTIALLY_PAID", label: "DP" },
              { value: "PAID", label: "Lunas" },
            ]}
            onValueChange={(v) => v && setStatusFilter(v)}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="UNPAID">Belum Bayar</SelectItem>
              <SelectItem value="PARTIALLY_PAID">DP</SelectItem>
              <SelectItem value="PAID">Lunas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Struk #</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Sudah Bayar</TableHead>
                  <TableHead>Sisa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Tidak ada struk yang ditemukan
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const status = statusConfig[invoice.status] || statusConfig.UNPAID;
                    const remaining = Math.max(0, invoice.total - invoice.project.paidAmount);
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium font-mono text-sm">
                          {invoice.invoiceNumber}
                        </TableCell>
                        <TableCell className="text-sm">{invoice.project.projectNumber}</TableCell>
                        <TableCell className="text-sm">{invoice.project.clientName}</TableCell>
                        <TableCell className="text-sm">{formatDate(invoice.issuedAt)}</TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {formatCurrency(invoice.total)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-emerald-600">
                          {formatCurrency(invoice.project.paidAmount)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {remaining > 0 ? (
                            <span className="text-red-600 font-medium">{formatCurrency(remaining)}</span>
                          ) : (
                            <span className="text-emerald-600">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setSelectedInvoice(invoice)}
                              aria-label="Lihat detail"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleDownloadPDF(invoice)}
                              disabled={downloadingId === invoice.id}
                              aria-label="Download PDF"
                            >
                              {downloadingId === invoice.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedInvoice?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Project</p>
                  <p className="font-medium">{selectedInvoice.project.projectNumber}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Client</p>
                  <p className="font-medium">{selectedInvoice.project.clientName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tanggal</p>
                  <p className="font-medium">{formatDate(selectedInvoice.issuedAt)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Layanan</p>
                  <p className="font-medium">{selectedInvoice.project.service?.name || "-"}</p>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Deskripsi</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedInvoice.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium">{formatCurrency(selectedInvoice.total)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span className="text-muted-foreground">Sudah Bayar</span>
                    <span className="font-medium">-{formatCurrency(selectedInvoice.project.paidAmount)}</span>
                  </div>
                  {Math.max(0, selectedInvoice.total - selectedInvoice.project.paidAmount) > 0 && (
                    <div className="flex justify-between text-sm text-red-600 border-t pt-2">
                      <span className="text-muted-foreground">Sisa</span>
                      <span className="font-medium">{formatCurrency(selectedInvoice.total - selectedInvoice.project.paidAmount)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => selectedInvoice && handleDownloadPDF(selectedInvoice)}
                  disabled={downloadingId === selectedInvoice?.id}
                >
                  {downloadingId === selectedInvoice?.id ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Download Struk
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
