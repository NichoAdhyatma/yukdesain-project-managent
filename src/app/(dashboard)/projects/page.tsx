"use client";

import { useState, useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, LayoutGrid, Kanban as KanbanIcon, Loader2, UserPlus, Plus, Trash2 } from "lucide-react";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import type { ProjectCardData } from "@/components/kanban/kanban-board";
import type { ProjectStatus } from "@/types";
import { CurrencyInput } from "@/components/ui/currency-input";

type Designer = { id: string; name: string; email: string; classification: string };
type Project = ProjectCardData;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  BELUM_DIKERJAKAN: { label: "Menunggu Brief", variant: "secondary" },
  SEDANG_DIKERJAKAN: { label: "Dikerjakan", variant: "default" },
  SELESAI: { label: "Selesai", variant: "outline" },
};

const paymentStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  UNPAID: { label: "Belum Bayar", variant: "destructive" },
  PARTIALLY_PAID: { label: "DP", variant: "secondary" },
  PAID: { label: "Lunas", variant: "default" },
};

const paymentMethods = ["Bank Transfer", "Cash", "E-Wallet", "QRIS", "Lainnya"];

type ViewMode = "grid" | "kanban";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [designers, setDesigners] = useState<Designer[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [loading, setLoading] = useState(true);

  // Filter state
  const [filterService, setFilterService] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterDesigner, setFilterDesigner] = useState("all");
  const [filterWorkerType, setFilterWorkerType] = useState("all");
  const [filterDeadline, setFilterDeadline] = useState("");

  // Assign dialog state
  const [assignDialog, setAssignDialog] = useState<Project | null>(null);
  const [selectedDesigner, setSelectedDesigner] = useState("");
  const [freelancerPayout, setFreelancerPayout] = useState(0);
  const [assigning, setAssigning] = useState(false);

  // Payment dialog state
  const [paymentDialog, setPaymentDialog] = useState<Project | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Delete dialog state
  const [deleteDialog, setDeleteDialog] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [projectsRes, designersRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/designers"),
      ]);
      const projectsData = await projectsRes.json();
      const designersData = await designersRes.json();
      if (projectsData.projects) setProjects(projectsData.projects);
      if (designersData.designers) setDesigners(designersData.designers);
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }

  const handleProjectMove = async (projectId: string, newStatus: ProjectStatus) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, status: newStatus } : p))
    );
    try {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) loadData();
    } catch {
      loadData();
    }
  };

  async function handleAssignDesigner() {
    if (!assignDialog || !selectedDesigner) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/projects/${assignDialog.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designerId: selectedDesigner,
          freelancerPayout: freelancerPayout || null,
        }),
      });
      if (res.ok) {
        setAssignDialog(null);
        setSelectedDesigner("");
        setFreelancerPayout(0);
        loadData();
      } else {
        const data = await res.json();
        toast(data.error || "Gagal assign designer", "error");
      }
    } catch (e) {
      console.error("Failed:", e);
      toast("Terjadi kesalahan", "error");
    } finally {
      setAssigning(false);
    }
  }

  async function handleRecordPayment() {
    if (!paymentDialog || !paymentAmount) return;
    setRecordingPayment(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: paymentDialog.id,
          amount: paymentAmount,
          date: paymentDate || undefined,
          method: paymentMethod || undefined,
          reference: paymentReference || undefined,
          notes: paymentNotes || undefined,
        }),
      });
      if (res.ok) {
        setPaymentDialog(null);
        setPaymentAmount(0);
        setPaymentDate("");
        setPaymentMethod("");
        setPaymentReference("");
        setPaymentNotes("");
        loadData();
      } else {
        const data = await res.json();
        toast(data.error || "Gagal record payment", "error");
      }
    } catch (e) {
      console.error("Failed:", e);
      toast("Terjadi kesalahan", "error");
    } finally {
      setRecordingPayment(false);
    }
  }

  async function handleDelete() {
    if (!deleteDialog) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${deleteDialog.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteDialog(null);
        loadData();
      } else {
        const data = await res.json();
        toast(data.error || "Gagal menghapus project", "error");
      }
    } catch (e) {
      console.error("Failed:", e);
      toast("Terjadi kesalahan", "error");
    } finally {
      setDeleting(false);
    }
  }

  const openPaymentDialog = (project: Project) => {
    const remaining = project.agreedPrice - project.paidAmount;
    setPaymentAmount(remaining > 0 ? remaining : project.agreedPrice);
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("");
    setPaymentReference("");
    setPaymentNotes("");
    setPaymentDialog(project);
  };

  const filteredProjects = projects.filter((p) => {
    const query = search.toLowerCase();
    const matchesSearch =
      !query ||
      p.projectNumber.toLowerCase().includes(query) ||
      p.clientName.toLowerCase().includes(query);

    const matchesService = filterService === "all" || p.service?.id === filterService;
    const matchesStatus = filterStatus === "all" || p.status === filterStatus;
    const matchesPayment = filterPayment === "all" || p.paymentStatus === filterPayment;

    const assigned = p.assignments?.[0]?.designer;
    const matchesDesigner = filterDesigner === "all" || assigned?.id === filterDesigner;

    if (filterWorkerType !== "all" && assigned) {
      const isFreelancer = assigned.classification === "FREELANCER";
      if (filterWorkerType === "freelancer" && !isFreelancer) return false;
      if (filterWorkerType === "fulltime" && isFreelancer) return false;
    } else if (filterWorkerType !== "all" && !assigned) {
      return false;
    }

    if (filterDeadline) {
      const deadline = p.deadline ? new Date(p.deadline) : null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (filterDeadline === "overdue" && (!deadline || deadline >= today)) return false;
      if (filterDeadline === "today" && (!deadline || deadline.toDateString() !== today.toDateString())) return false;
      if (filterDeadline === "week") {
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 7);
        if (!deadline || deadline < today || deadline > weekEnd) return false;
      }
      if (filterDeadline === "month") {
        const monthEnd = new Date(today);
        monthEnd.setMonth(monthEnd.getMonth() + 1);
        if (!deadline || deadline < today || deadline > monthEnd) return false;
      }
    }

    return matchesSearch && matchesService && matchesStatus && matchesPayment && matchesDesigner;
  });

  const serviceOptions = [
    { value: "all", label: "Semua Layanan" },
    ...projects.reduce<{ value: string; label: string }[]>((acc, p) => {
      if (p.service && !acc.find(a => a.value === p.service!.id)) {
        acc.push({ value: p.service.id, label: p.service.name });
      }
      return acc;
    }, []),
  ];

  const designerOptions = [
    { value: "all", label: "Semua Designer" },
    ...designers.map(d => ({ value: d.id, label: d.name })),
  ];

  const hasActiveFilters =
    filterService !== "all" ||
    filterStatus !== "all" ||
    filterPayment !== "all" ||
    filterDesigner !== "all" ||
    filterWorkerType !== "all" ||
    filterDeadline !== "";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted-foreground text-sm">
            {viewMode === "grid" ? "Table view" : "Kanban view"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={viewMode === "grid" ? "default" : "outline"} size="sm" onClick={() => setViewMode("grid")}>
            <LayoutGrid className="h-4 w-4 mr-1" /> Grid
          </Button>
          <Button variant={viewMode === "kanban" ? "default" : "outline"} size="sm" onClick={() => setViewMode("kanban")}>
            <KanbanIcon className="h-4 w-4 mr-1" /> Kanban
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b">
        <div className="relative w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cari project..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>

        {/* Service filter */}
        <Select value={filterService} options={serviceOptions} onValueChange={(v) => v && setFilterService(v)}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="Layanan" /></SelectTrigger>
          <SelectContent>
            {serviceOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select value={filterStatus} options={[
          { value: "all", label: "Semua Status" },
          { value: "DRAFT", label: "Draft" },
          { value: "BELUM_DIKERJAKAN", label: "Menunggu Brief" },
          { value: "SEDANG_DIKERJAKAN", label: "Dikerjakan" },
          { value: "SELESAI", label: "Selesai" },
        ]} onValueChange={(v) => v && setFilterStatus(v)}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="BELUM_DIKERJAKAN">Menunggu Brief</SelectItem>
            <SelectItem value="SEDANG_DIKERJAKAN">Dikerjakan</SelectItem>
            <SelectItem value="SELESAI">Selesai</SelectItem>
          </SelectContent>
        </Select>

        {/* Payment status filter */}
        <Select value={filterPayment} options={[
          { value: "all", label: "Semua Pembayaran" },
          { value: "UNPAID", label: "Belum Bayar" },
          { value: "PARTIALLY_PAID", label: "DP" },
          { value: "PAID", label: "Lunas" },
        ]} onValueChange={(v) => v && setFilterPayment(v)}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Pembayaran" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Pembayaran</SelectItem>
            <SelectItem value="UNPAID">Belum Bayar</SelectItem>
            <SelectItem value="PARTIALLY_PAID">DP</SelectItem>
            <SelectItem value="PAID">Lunas</SelectItem>
          </SelectContent>
        </Select>

        {/* Designer filter */}
        <Select value={filterDesigner} options={designerOptions} onValueChange={(v) => v && setFilterDesigner(v)}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Designer" /></SelectTrigger>
          <SelectContent>
            {designerOptions.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Worker type filter */}
        <Select value={filterWorkerType} options={[
          { value: "all", label: "Semua Tipe" },
          { value: "fulltime", label: "Full Time" },
          { value: "freelancer", label: "Freelancer" },
        ]} onValueChange={(v) => v && setFilterWorkerType(v)}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue placeholder="Tipe Worker" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Tipe</SelectItem>
            <SelectItem value="fulltime">Full Time</SelectItem>
            <SelectItem value="freelancer">Freelancer</SelectItem>
          </SelectContent>
        </Select>

        {/* Deadline filter */}
        <Select value={filterDeadline} options={[
          { value: "", label: "Semua Deadline" },
          { value: "overdue", label: "Terlambat" },
          { value: "today", label: "Hari ini" },
          { value: "week", label: "7 hari ke depan" },
          { value: "month", label: "30 hari ke depan" },
        ]} onValueChange={(v) => setFilterDeadline(v ?? "")}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="Deadline" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Semua Deadline</SelectItem>
            <SelectItem value="overdue">Terlambat</SelectItem>
            <SelectItem value="today">Hari ini</SelectItem>
            <SelectItem value="week">7 hari ke depan</SelectItem>
            <SelectItem value="month">30 hari ke depan</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground px-2"
            onClick={() => {
              setSearch("");
              setFilterService("all");
              setFilterStatus("all");
              setFilterPayment("all");
              setFilterDesigner("all");
              setFilterWorkerType("all");
              setFilterDeadline("");
            }}
          >
            Reset
          </Button>
        )}

        {/* Result count */}
        <span className="ml-auto text-xs text-muted-foreground">
          {filteredProjects.length} dari {projects.length} project
        </span>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {viewMode === "kanban" ? (
          <KanbanBoard projects={filteredProjects} onProjectMove={handleProjectMove} onAssignDesigner={setAssignDialog} />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Layanan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Designer</TableHead>
                    <TableHead>Pembayaran</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead className="w-16">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Tidak ada project
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProjects.map((p) => {
                      const st = statusMap[p.status] || statusMap.DRAFT;
                      const pst = paymentStatusMap[p.paymentStatus] || paymentStatusMap.UNPAID;
                      const assigned = p.assignments?.[0]?.designer;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.projectNumber}</TableCell>
                          <TableCell>{p.clientName}</TableCell>
                          <TableCell>{p.service?.name || "-"}</TableCell>
                          <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                          <TableCell>
                            {assigned ? (
                              <span className="text-sm">{assigned.name}</span>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => setAssignDialog(p)}>
                                <UserPlus className="h-3 w-3 mr-1" /> Assign
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <button
                              className="text-left hover:underline"
                              onClick={() => openPaymentDialog(p)}
                            >
                              <div className="flex flex-col gap-0.5">
                                <Badge variant={pst.variant} className="text-xs w-fit">{pst.label}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {formatCurrency(p.paidAmount)} / {formatCurrency(p.agreedPrice)}
                                </span>
                              </div>
                            </button>
                          </TableCell>
                          <TableCell>{p.deadline ? formatDate(p.deadline) : "-"}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteDialog(p)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Assign Designer Dialog */}
      <Dialog open={!!assignDialog} onOpenChange={() => { setAssignDialog(null); setSelectedDesigner(""); setFreelancerPayout(0); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Designer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project</label>
              <p className="text-sm text-muted-foreground">{assignDialog?.projectNumber}</p>
            </div>
            {assignDialog?.assignments?.[0] && (
              <div className="rounded-md bg-muted/50 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Current Assignment</p>
                <p className="text-sm font-medium">{assignDialog.assignments[0].designer.name}</p>
                <p className="text-xs text-muted-foreground">
                  {assignDialog.assignments[0].designer.classification === "FULL_TIME" ? "Full Time" : "Freelancer"}
                  {assignDialog.assignments[0].freelancerPayout && ` · ${formatCurrency(assignDialog.assignments[0].freelancerPayout)}`}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Designer</label>
              <Select
                value={selectedDesigner}
                options={designers.map(d => ({ value: d.id, label: `${d.name} (${d.classification === "FULL_TIME" ? "Full Time" : "Freelancer"})` }))}
                onValueChange={(v) => { if (v) { setSelectedDesigner(v); setFreelancerPayout(0); } }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih designer" />
                </SelectTrigger>
                <SelectContent>
                  {designers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.classification === "FULL_TIME" ? "Full Time" : "Freelancer"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedDesigner && designers.find(d => d.id === selectedDesigner)?.classification === "FREELANCER" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Freelancer Payout (IDR)</label>
                <CurrencyInput
                  value={freelancerPayout}
                  onChange={setFreelancerPayout}
                  placeholder="Rp 0"
                />
                <p className="text-xs text-muted-foreground">Required for freelancer assignment</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setAssignDialog(null); setSelectedDesigner(""); setFreelancerPayout(0); }}>Batal</Button>
              <Button
                onClick={handleAssignDesigner}
                disabled={
                  !selectedDesigner ||
                  assigning ||
                  (designers.find(d => d.id === selectedDesigner)?.classification === "FREELANCER" && !freelancerPayout)
                }
              >
                {assigning ? "Menyimpan..." : "Assign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!paymentDialog} onOpenChange={() => setPaymentDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pembayaran</DialogTitle>
          </DialogHeader>
          {paymentDialog && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="rounded-md bg-muted/50 p-3 space-y-1">
                <p className="text-sm font-medium">{paymentDialog.projectNumber}</p>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Total</span>
                  <span>{formatCurrency(paymentDialog.agreedPrice)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Sudah Bayar</span>
                  <span className="text-green-600">{formatCurrency(paymentDialog.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span>Sisa</span>
                  <span className="text-red-600">
                    {formatCurrency(Math.max(0, paymentDialog.agreedPrice - paymentDialog.paidAmount))}
                  </span>
                </div>
              </div>

              {/* Payment History */}
              {paymentDialog.payments && paymentDialog.payments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Riwayat Pembayaran</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {paymentDialog.payments.map((pmt) => (
                      <div key={pmt.id} className="flex justify-between items-center text-sm py-1 border-b border-border">
                        <div>
                          <p className="text-xs">{formatDate(pmt.date)}</p>
                          {pmt.method && <p className="text-xs text-muted-foreground">{pmt.method}{pmt.reference ? ` · ${pmt.reference}` : ""}</p>}
                        </div>
                        <span className="text-green-600 font-medium">{formatCurrency(pmt.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Record Payment Form */}
              <div className="space-y-3 pt-2 border-t">
                <p className="text-sm font-medium">Catat Pembayaran</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Jumlah (IDR)</Label>
                    <CurrencyInput
                      value={paymentAmount}
                      onChange={setPaymentAmount}
                      placeholder="Rp 0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Tanggal</Label>
                    <Input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Metode</Label>
                  <Select
                    value={paymentMethod}
                    options={paymentMethods.map(m => ({ value: m, label: m }))}
                    onValueChange={(v) => { if (v) setPaymentMethod(v); }}
                  >
                    <SelectTrigger className="w-full"><SelectValue placeholder="Pilih metode" /></SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Reference (opsional)</Label>
                  <Input
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="No. slip / txid"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Catatan (opsional)</Label>
                  <Input
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Catatan"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setPaymentDialog(null)}>Batal</Button>
                  <Button onClick={handleRecordPayment} disabled={!paymentAmount || recordingPayment}>
                    {recordingPayment ? "Menyimpan..." : <><Plus className="h-4 w-4 mr-1" />Catat Pembayaran</>}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={() => !deleting && setDeleteDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Project?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Project <span className="font-semibold text-foreground">{deleteDialog?.projectNumber}</span> ({deleteDialog?.clientName}) akan dihapus permanen beserta semua data terkait (brief, revisi, invoice, pembayaran, dll). Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteDialog(null)} disabled={deleting}>
                Batal
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                Hapus
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
