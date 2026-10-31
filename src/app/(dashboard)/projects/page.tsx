"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, LayoutGrid, Kanban as KanbanIcon, Loader2, UserPlus, Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
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
const PAGE_SIZE = 20;

type ViewMode = "grid" | "kanban";

interface ProjectsResponse {
  projects: Project[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildProjectParams(page: number, filterService: string, filterStatus: string, filterPayment: string, filterDesigner: string, filterWorkerType: string, filterDeadline: string, search: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (filterService !== "all") params.set("service", filterService);
  if (filterStatus !== "all") params.set("status", filterStatus);
  if (filterPayment !== "all") params.set("payment", filterPayment);
  if (filterDesigner !== "all") params.set("designer", filterDesigner);
  if (filterWorkerType !== "all") params.set("workerType", filterWorkerType);
  if (filterDeadline) params.set("deadline", filterDeadline);
  if (search) params.set("search", search);
  return params.toString();
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [filterService, setFilterService] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPayment, setFilterPayment] = useState("all");
  const [filterDesigner, setFilterDesigner] = useState("all");
  const [filterWorkerType, setFilterWorkerType] = useState("all");
  const [filterDeadline, setFilterDeadline] = useState("");

  const [assignDialog, setAssignDialog] = useState<Project | null>(null);
  const [selectedDesigner, setSelectedDesigner] = useState("");
  const [freelancerPayout, setFreelancerPayout] = useState(0);
  const [assigning, setAssigning] = useState(false);

  const [paymentDialog, setPaymentDialog] = useState<Project | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  // page NOT in queryKey — navigating pages uses cached data, no refetch
  const { data: projectsData, isLoading } = useQuery<ProjectsResponse>({
    queryKey: ["projects", filterService, filterStatus, filterPayment, filterDesigner, filterWorkerType, filterDeadline, search],
    queryFn: async () => {
      const res = await fetch(`/api/projects?${buildProjectParams(currentPage, filterService, filterStatus, filterPayment, filterDesigner, filterWorkerType, filterDeadline, search)}`);
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
    staleTime: Infinity,
  });

  const { data: designersData } = useQuery<{ designers: Designer[] }>({
    queryKey: ["designers"],
    queryFn: async () => {
      const res = await fetch("/api/designers");
      if (!res.ok) throw new Error("Failed to fetch designers");
      return res.json();
    },
  });

  const projects = projectsData?.projects ?? [];
  const totalProjects = projectsData?.total ?? 0;
  const totalPages = projectsData?.totalPages ?? 1;
  const designers = designersData?.designers ?? [];

  const serviceOptions = [
    { value: "all", label: "Semua Layanan" },
    ...Array.from(
      new Map(
        projects
          .filter((p) => p.service)
          .map((p) => [p.service!.id, { value: p.service!.id, label: p.service!.name }])
      ).values()
    ).sort((a, b) => a.label.localeCompare(b.label)),
  ];

  const designerOptions = [
    { value: "all", label: "Semua Designer" },
    ...designers.map((d) => ({ value: d.id, label: d.name })),
  ];

  const hasActiveFilters =
    filterService !== "all" ||
    filterStatus !== "all" ||
    filterPayment !== "all" ||
    filterDesigner !== "all" ||
    filterWorkerType !== "all" ||
    filterDeadline !== "";

  function handleFilterChange(newPage = 1) {
    setCurrentPage(newPage);
  }

  function handlePageChange(page: number) {
    setCurrentPage(page);
  }

  const handleProjectMove = useMutation({
    mutationFn: async ({ projectId, newStatus }: { projectId: string; newStatus: ProjectStatus }) => {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

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
        queryClient.invalidateQueries({ queryKey: ["projects"] });
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
        queryClient.invalidateQueries({ queryKey: ["projects"] });
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
        // Project yang dihapus juga muncul di halaman lain (form link recap,
        // invoice, keuangan, activity log, workspace designer).
        queryClient.invalidateQueries({ queryKey: ["projects"] });
        queryClient.invalidateQueries({ queryKey: ["form-link-projects"] });
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        queryClient.invalidateQueries({ queryKey: ["financial"] });
        queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
        queryClient.invalidateQueries({ queryKey: ["designer-projects"] });
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

  if (isLoading) {
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
          <Input
            placeholder="Cari project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleFilterChange(); }}
            className="pl-9 h-8 text-sm"
          />
        </div>

        {/* Service filter */}
        <Select value={filterService} options={serviceOptions} onValueChange={(v) => { if (v) { setFilterService(v); handleFilterChange(); } }}>
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
        ]} onValueChange={(v) => { if (v) { setFilterStatus(v); handleFilterChange(); } }}>
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
        ]} onValueChange={(v) => { if (v) { setFilterPayment(v); handleFilterChange(); } }}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="Pembayaran" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Pembayaran</SelectItem>
            <SelectItem value="UNPAID">Belum Bayar</SelectItem>
            <SelectItem value="PARTIALLY_PAID">DP</SelectItem>
            <SelectItem value="PAID">Lunas</SelectItem>
          </SelectContent>
        </Select>

        {/* Designer filter */}
        <Select value={filterDesigner} options={designerOptions} onValueChange={(v) => { if (v) { setFilterDesigner(v); handleFilterChange(); } }}>
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
        ]} onValueChange={(v) => { if (v) { setFilterWorkerType(v); handleFilterChange(); } }}>
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
        ]} onValueChange={(v) => { setFilterDeadline(v ?? ""); handleFilterChange(); }}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="Deadline" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Semua Deadline</SelectItem>
            <SelectItem value="overdue">Terlambat</SelectItem>
            <SelectItem value="today">Hari ini</SelectItem>
            <SelectItem value="week">7 hari ke depan</SelectItem>
            <SelectItem value="month">30 hari ke depan</SelectItem>
          </SelectContent>
        </Select>

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
              handleFilterChange();
            }}
          >
            Reset
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {totalProjects} project
        </span>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {viewMode === "kanban" ? (
          <KanbanBoard
            projects={projects}
            onProjectMove={(projectId, newStatus) => handleProjectMove.mutate({ projectId, newStatus })}
            onAssignDesigner={setAssignDialog}
          />
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
                  {projects.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Tidak ada project
                      </TableCell>
                    </TableRow>
                  ) : (
                    projects.map((p) => {
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t bg-background">
          <span className="text-xs text-muted-foreground">
            Halaman {currentPage} dari {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
              .reduce<{ value: number; el: React.ReactElement }[]>((acc, page, idx, arr) => {
                if (idx > 0 && page - (arr[idx - 1] as number) > 1) {
                  acc.push({ value: -1, el: <span key="ellipsis" className="px-1 text-muted-foreground">…</span> });
                }
                acc.push({
                  value: page,
                  el: (
                    <Button
                      key={page}
                      variant={page === currentPage ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-8"
                      onClick={() => handlePageChange(page)}
                    >
                      {page}
                    </Button>
                  ),
                });
                return acc;
              }, [])
              .map((item) => item.el)}
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

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
