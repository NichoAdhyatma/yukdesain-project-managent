"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, FolderOpen, MousePointerClick, RotateCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { latestProgress } from "@/lib/projects/progress-update";
import { briefChangedSinceLastUpdate } from "@/lib/projects/brief-change";
import type { ProjectStatus } from "@/types";
import { ProjectDetail } from "@/components/designer/ProjectDetail";
import {
  PRIORITY_STYLE,
  STATUS_BADGE,
  WORK_STATUSES,
  formatDate,
  statusLabel,
  type DesignerProject,
} from "@/components/designer/types";

type StatusFilter = "all" | ProjectStatus;

async function fetchProjects(): Promise<DesignerProject[]> {
  const res = await fetch("/api/designer/projects");
  if (!res.ok) throw new Error("Gagal memuat project.");
  const data = await res.json();
  return data.projects as DesignerProject[];
}

function isOverdue(p: DesignerProject): boolean {
  return !!p.deadline && p.status !== "SELESAI" && new Date(p.deadline).getTime() < Date.now();
}

function ProjectListItem({
  project,
  selected,
  onSelect,
}: {
  project: DesignerProject;
  selected: boolean;
  onSelect: () => void;
}) {
  const priority = PRIORITY_STYLE[project.priority] ?? PRIORITY_STYLE.NORMAL;
  const progress = latestProgress(project.updates);
  const pendingRevisions = project.revisions.filter((r) => r.status === "PENDING").length;
  const overdue = isOverdue(project);
  const briefChanged =
    project.status !== "SELESAI" && !project.finalApprovedAt && briefChangedSinceLastUpdate(project.brief?.clientUpdatedAt, project.updates) !== null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "w-full space-y-2.5 rounded-lg border bg-card p-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "border-primary bg-primary/5 hover:bg-primary/5"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground tabular-nums">{project.projectNumber}</p>
          <p className="truncate font-medium">{project.clientName}</p>
          <p className="truncate text-xs text-muted-foreground">{project.service.name}</p>
        </div>
        <Badge variant={STATUS_BADGE[project.status]} className="shrink-0">
          {statusLabel(project.status)}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress ?? 0}%` }} />
        </div>
        <span className="shrink-0 text-right text-xs whitespace-nowrap tabular-nums text-muted-foreground">
          {progress === null ? "Belum diisi" : `${progress}%`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className={cn("rounded px-1.5 py-0.5 font-medium", priority.className)}>{priority.label}</span>
        {project.deadline && (
          <span className={cn("inline-flex items-center gap-1", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
            <CalendarClock className="size-3.5" aria-hidden />
            {overdue ? "Lewat deadline " : ""}
            {formatDate(project.deadline)}
          </span>
        )}
        {pendingRevisions > 0 && (
          <span className="font-medium text-amber-700 dark:text-amber-300">{pendingRevisions} revisi menunggu</span>
        )}
        {briefChanged && <span className="font-medium text-amber-700 dark:text-amber-300">Klien menambah brief</span>}
      </div>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[118px] animate-pulse rounded-lg border bg-muted/40" />
      ))}
    </div>
  );
}

function DesignerWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("project");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const detailRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["designer-projects"],
    queryFn: fetchProjects,
  });
  const projects = useMemo(() => data ?? [], [data]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.length };
    for (const s of WORK_STATUSES) c[s] = projects.filter((p) => p.status === s).length;
    return c;
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      const matchesSearch =
        !q ||
        p.projectNumber.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q) ||
        p.service.name.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  // Pindahkan fokus ke detail saat project dipilih, supaya pengguna keyboard dan pembaca layar ikut pindah.
  useEffect(() => {
    if (selectedId) detailRef.current?.focus({ preventScroll: false });
  }, [selectedId]);

  function select(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("project", id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearSelection() {
    router.push(pathname, { scroll: false });
  }

  const filters: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: "Semua" },
    ...WORK_STATUSES.map((s) => ({ value: s as StatusFilter, label: statusLabel(s) })),
  ];

  return (
    <div className="flex min-h-full flex-col">
      <header className={cn("border-b px-4 py-4 md:px-6", selected && "max-lg:hidden")}>
        <h1 className="text-xl font-semibold md:text-2xl">Workspace</h1>
        <p className="text-sm text-muted-foreground">
          Project yang ditugaskan ke kamu. Pilih project untuk mengirim update progres.
        </p>
      </header>

      <div className="grid flex-1 lg:grid-cols-[minmax(300px,380px)_1fr]">
        {/* Daftar project */}
        <section
          aria-label="Daftar project"
          className={cn("space-y-3 p-4 md:p-6 lg:border-r", selected && "max-lg:hidden")}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              placeholder="Cari nomor, klien, atau layanan"
              aria-label="Cari project"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-9 text-base md:h-9 md:text-sm"
            />
          </div>

          <div role="group" aria-label="Filter status" className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <Button
                key={f.value}
                type="button"
                variant={statusFilter === f.value ? "default" : "outline"}
                aria-pressed={statusFilter === f.value}
                onClick={() => setStatusFilter(f.value)}
                className="h-11 px-3 text-xs md:h-8"
              >
                {f.label}
                <span className="tabular-nums opacity-70">{counts[f.value] ?? 0}</span>
              </Button>
            ))}
          </div>

          {isLoading ? (
            <ListSkeleton />
          ) : isError ? (
            <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle className="size-4" aria-hidden /> {error.message}
              </p>
              <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => refetch()} disabled={isRefetching}>
                <RotateCw className={cn(isRefetching && "animate-spin")} aria-hidden /> Coba lagi
              </Button>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center">
              <FolderOpen className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">Belum ada project untuk kamu</p>
              <p className="text-xs text-muted-foreground">Project yang ditugaskan owner akan muncul di sini.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center">
              <p className="text-sm font-medium">Tidak ada project yang cocok</p>
              <Button
                type="button"
                variant="outline"
                className="h-11 md:h-9"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
              >
                Hapus filter
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((p) => (
                <li key={p.id}>
                  <ProjectListItem project={p} selected={p.id === selectedId} onSelect={() => select(p.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Detail project */}
        <div
          ref={detailRef}
          tabIndex={-1}
          aria-label="Detail project"
          className={cn("min-w-0 p-4 outline-none md:p-6", !selected && "max-lg:hidden")}
        >
          {selected ? (
            <div className="mx-auto max-w-3xl">
              <ProjectDetail key={selected.id} project={selected} onBack={clearSelection} />
            </div>
          ) : selectedId && !isLoading && !isError ? (
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-12 text-center">
              <p className="text-sm font-medium">Project tidak ditemukan</p>
              <p className="text-xs text-muted-foreground">Mungkin project ini sudah tidak ditugaskan ke kamu.</p>
              <Button type="button" variant="outline" className="h-11 md:h-9" onClick={clearSelection}>
                Kembali ke daftar
              </Button>
            </div>
          ) : (
            <div className="hidden h-full min-h-64 flex-col items-center justify-center gap-2 text-center lg:flex">
              <MousePointerClick className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">Pilih project di sebelah kiri</p>
              <p className="text-xs text-muted-foreground">Detail, brief, dan form update progres akan tampil di sini.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DesignerWorkspacePage() {
  return (
    <Suspense fallback={<div className="p-6"><ListSkeleton /></div>}>
      <DesignerWorkspace />
    </Suspense>
  );
}
