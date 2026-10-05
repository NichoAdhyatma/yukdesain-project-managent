"use client";

import { useState, useEffect } from "react";
import { pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { Search, Download, Eye, FileText, Send, Loader2, Plus, Trash2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { InvoicePDF } from "@/components/invoice/InvoicePDF";

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
  dueDate: string | null;
  project: {
    id: string;
    projectNumber: string;
    clientName: string;
    agreedPrice: number;
    paidAmount: number;
    paymentStatus: string;
  };
};

type SimpleProject = {
  id: string;
  projectNumber: string;
  clientName: string;
  agreedPrice: number;
  paymentStatus: string;
};

type InvoiceItemInput = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
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

  // Create invoice dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [projects, setProjects] = useState<SimpleProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemInput[]>([
    { id: "1", description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [taxAmount, setTaxAmount] = useState(0);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects?limit=100");
      const data = await res.json();
      if (data.projects) {
        setProjects(
          data.projects.map((p: { id: string; projectNumber: string; clientName: string; agreedPrice: number; paymentStatus: string }) => ({
            id: p.id,
            projectNumber: p.projectNumber,
            clientName: p.clientName,
            agreedPrice: p.agreedPrice,
            paymentStatus: p.paymentStatus,
          }))
        );
      }
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  }

  function addItem() {
    setInvoiceItems((prev) => [
      ...prev,
      { id: String(Date.now()), description: "", quantity: 1, unitPrice: 0 },
    ]);
  }

  function removeItem(id: string) {
    if (invoiceItems.length === 1) return;
    setInvoiceItems((prev) => prev.filter((i) => i.id !== id));
  }

  function updateItem(id: string, field: keyof InvoiceItemInput, value: string | number) {
    setInvoiceItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  }

  const subtotal = invoiceItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const total = subtotal + taxAmount;

  function resetCreateForm() {
    setSelectedProjectId("");
    setInvoiceItems([{ id: "1", description: "", quantity: 1, unitPrice: 0 }]);
    setTaxAmount(0);
    setDueDate(undefined);
  }

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

  async function handleCreateInvoice() {
    if (!selectedProjectId || invoiceItems.length === 0) {
      alert("Pilih project dan isi minimal 1 item");
      return;
    }
    const validItems = invoiceItems.filter((i) => i.description.trim());
    if (validItems.length === 0) {
      alert("Minimal isi deskripsi untuk 1 item");
      return;
    }
    setCreating(true);
    try {
      const items = validItems.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.quantity * i.unitPrice,
      }));
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          items,
          subtotal,
          tax: taxAmount || null,
          total,
          dueDate: dueDate ? dueDate.toISOString() : null,
        }),
      });
      if (res.ok) {
        setCreateOpen(false);
        resetCreateForm();
        loadInvoices();
        alert("Invoice berhasil dibuat!");
      } else {
        const data = await res.json();
        alert(data.error || "Gagal membuat invoice");
      }
    } catch {
      alert("Terjadi kesalahan");
    } finally {
      setCreating(false);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect -- pre-existing pattern in codebase */
  useEffect(() => {
    loadInvoices();
    loadProjects();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleDownloadPDF(invoice: Invoice) {
    setDownloadingId(invoice.id);
    try {
      const doc = (
        <InvoicePDF
          invoiceNumber={invoice.invoiceNumber}
          issuedAt={invoice.issuedAt}
          dueDate={invoice.dueDate}
          clientName={invoice.project.clientName}
          projectNumber={invoice.project.projectNumber}
          items={invoice.items}
          subtotal={invoice.subtotal}
          tax={invoice.tax}
          total={invoice.total}
          status={invoice.status}
        />
      );
      const blob = await pdf(doc).toBlob();
      saveAs(blob, `${invoice.invoiceNumber}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Gagal generate PDF. Coba lagi.");
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Invoices</h1>
            <p className="text-muted-foreground">Kelola invoice dan pembayaran</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Buat Invoice
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari invoice..."
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
                  <TableHead className="w-36">Invoice #</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Jatuh Tempo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Tidak ada invoice yang ditemukan
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const status = statusConfig[invoice.status] || statusConfig.UNPAID;
                    return (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium font-mono text-sm">
                          {invoice.invoiceNumber}
                        </TableCell>
                        <TableCell className="text-sm">{invoice.project.projectNumber}</TableCell>
                        <TableCell className="text-sm">{invoice.project.clientName}</TableCell>
                        <TableCell className="text-sm">{formatDate(invoice.issuedAt)}</TableCell>
                        <TableCell className="text-sm">
                          {invoice.dueDate ? formatDate(invoice.dueDate) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">
                          {formatCurrency(invoice.total)}
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
                              aria-label="Lihat detail invoice"
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {selectedInvoice?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-6">
              {/* Header Info */}
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
                  <p className="text-muted-foreground">Jatuh Tempo</p>
                  <p className="font-medium">
                    {selectedInvoice.dueDate ? formatDate(selectedInvoice.dueDate) : "-"}
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <div className="border rounded-lg">
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

              {/* Total */}
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  {selectedInvoice.tax && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Pajak</span>
                      <span>{formatCurrency(selectedInvoice.tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(selectedInvoice.total)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
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
                  Download PDF
                </Button>
                <Button>
                  <Send className="h-4 w-4 mr-2" />
                  Kirim ke Client
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) resetCreateForm(); setCreateOpen(open); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Buat Invoice Baru
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">

            {/* Project Selection */}
            <div className="space-y-2">
              <Label>Project *</Label>
              <Select value={selectedProjectId} onValueChange={(v) => v && setSelectedProjectId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih project..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span>
                        {p.projectNumber} — {p.clientName}
                        <span className="text-muted-foreground ml-2">
                          ({formatCurrency(p.agreedPrice)})
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Invoice Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Item *</Label>
                <Button variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-3 w-3 mr-1" /> Tambah Item
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-full">Deskripsi</TableHead>
                      <TableHead className="w-20 text-center">Qty</TableHead>
                      <TableHead className="w-36 text-right">Harga Satuan</TableHead>
                      <TableHead className="w-28 text-right">Total</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoiceItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Input
                            placeholder="Deskripsi item..."
                            value={item.description}
                            onChange={(e) => updateItem(item.id, "description", e.target.value)}
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                            className="h-8 text-sm text-center"
                          />
                        </TableCell>
                        <TableCell>
                          <CurrencyInput
                            value={item.unitPrice}
                            onChange={(val) => updateItem(item.id, "unitPrice", val)}
                            placeholder="0"
                            className="h-8 text-sm text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-muted-foreground">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            disabled={invoiceItems.length === 1}
                            onClick={() => removeItem(item.id)}
                            aria-label="Hapus item invoice"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Subtotal, Tax, Total */}
            <div className="flex justify-end">
              <div className="w-64 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm gap-2">
                  <Label className="text-muted-foreground shrink-0">Pajak (PPN 11%)</Label>
                  <div className="w-36">
                    <CurrencyInput
                      value={taxAmount}
                      onChange={(val) => setTaxAmount(val)}
                      placeholder="0"
                      className="h-8 text-sm text-right"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between font-bold text-lg border-t pt-2">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <Label>Jatuh Tempo</Label>
              <DatePicker
                value={dueDate}
                onChange={setDueDate}
                placeholder="Pilih tanggal jatuh tempo"
                className="max-w-xs"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreateForm(); }}>
                Batal
              </Button>
              <Button onClick={handleCreateInvoice} disabled={creating || !selectedProjectId}>
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                {creating ? "Membuat..." : "Buat Invoice"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
