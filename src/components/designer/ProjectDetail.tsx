"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProgressUploader, type UploadedFile } from "@/components/ui/progress-uploader";
import { BriefReader } from "@/components/forms/brief/BriefReader";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { latestProgress } from "@/lib/projects/progress-update";
import type { ProjectStatus } from "@/types";
import { ProgressUpdateForm } from "./ProgressUpdateForm";
import { RevisionList, UpdateTimeline } from "./ProjectHistory";
import {
  PRIORITY_STYLE,
  STATUS_BADGE,
  WORK_STATUSES,
  formatDate,
  statusLabel,
  type DesignerProject,
} from "./types";

function StatusControl({ project }: { project: DesignerProject }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (status: ProjectStatus) => {
      const res = await fetch(`/api/projects/${project.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Gagal mengubah status. Coba lagi.");
      }
      return res.json();
    },
    onSuccess: (_d, status) => {
      queryClient.invalidateQueries({ queryKey: ["designer-projects"] });
      toast(`Status diubah ke ${statusLabel(status)}`, "success");
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="space-y-2">
      <p id={`status-${project.id}`} className="text-sm font-medium">
        Status pengerjaan
      </p>
      <div role="group" aria-labelledby={`status-${project.id}`} className="grid grid-cols-3 gap-2">
        {WORK_STATUSES.map((s) => {
          const active = project.status === s;
          const pending = mutation.isPending && mutation.variables === s;
          return (
            <Button
              key={s}
              type="button"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              disabled={mutation.isPending || active}
              onClick={() => mutation.mutate(s)}
              className={cn("h-11 whitespace-normal px-2 text-xs leading-tight md:h-9 md:text-sm", active && "disabled:opacity-100")}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {statusLabel(s)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function FinalSection({ project }: { project: DesignerProject }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/designer/projects/${project.id}/submit-final`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc.trim(), attachmentIds: files.map((f) => f.id) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Gagal mengirim hasil akhir. Coba lagi.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["designer-projects"] });
      setOpen(false);
      setDesc("");
      setFiles([]);
      toast("Hasil akhir terkirim ke klien", "success");
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  if (project.finalApprovedAt) {
    return (
      <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
        <p className="flex items-center gap-1.5 text-sm font-medium text-blue-800 dark:text-blue-200">
          <CheckCircle2 className="size-4" aria-hidden /> Hasil akhir disetujui klien
        </p>
        <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">Disetujui {formatDate(project.finalApprovedAt)}.</p>
      </div>
    );
  }

  if (project.finalSubmittedAt) {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/40">
        <p className="flex items-center gap-1.5 text-sm font-medium text-green-800 dark:text-green-200">
          <CheckCircle2 className="size-4" aria-hidden /> Hasil akhir sudah dikirim
        </p>
        <p className="mt-1 text-xs text-green-700 dark:text-green-300">Menunggu persetujuan klien.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">Hasil akhir</p>
        <p className="text-xs text-muted-foreground">Kirim kalau desain sudah final, untuk direview dan di-approve klien.</p>
      </div>
      <Button type="button" variant="outline" className="h-11 shrink-0 md:h-9" onClick={() => setOpen(true)}>
        <CheckCircle2 aria-hidden /> Kirim hasil akhir
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && mutation.isPending) return;
          setOpen(next);
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kirim hasil akhir</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Klien akan mendapat notifikasi dan bisa approve atau minta revisi.
            </p>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (desc.trim()) mutation.mutate();
            }}
          >
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Setelah dikirim, klien bisa approve atau meminta revisi sesuai kuota project. Pastikan hasilnya sudah final.
            </p>
            <div className="space-y-2">
              <Label htmlFor={`final-desc-${project.id}`}>
                Catatan hasil akhir <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Textarea
                id={`final-desc-${project.id}`}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Jelaskan file yang dikirim, misalnya format dan ukurannya."
                rows={4}
                required
                disabled={mutation.isPending}
                className="text-base md:text-sm"
              />
            </div>
            <ProgressUploader
              files={files}
              onChange={setFiles}
              onUploadingChange={setUploading}
              maxFiles={10}
              label="File hasil akhir"
              disabled={mutation.isPending}
              uploadCategory="final"
              projectId={project.id}
            />
            {mutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="h-11 md:h-9" disabled={mutation.isPending} onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" className="h-11 md:h-9" disabled={mutation.isPending || uploading || !desc.trim()}>
                {mutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden /> Mengirim…
                  </>
                ) : (
                  "Kirim hasil akhir"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProjectDetail({ project, onBack }: { project: DesignerProject; onBack: () => void }) {
  const priority = PRIORITY_STYLE[project.priority] ?? PRIORITY_STYLE.NORMAL;
  const progress = latestProgress(project.updates);
  const pendingRevisions = project.revisions.filter((r) => r.status === "PENDING").length;

  return (
    <article aria-labelledby={`detail-${project.id}`} className="space-y-5">
      <div className="space-y-3">
        <Button type="button" variant="ghost" onClick={onBack} className="-ml-2 h-11 lg:hidden">
          <ArrowLeft aria-hidden /> Semua project
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground tabular-nums">{project.projectNumber}</p>
            <h2 id={`detail-${project.id}`} className="text-lg font-semibold leading-tight break-words">
              {project.clientName}
            </h2>
            <p className="text-sm text-muted-foreground">{project.service.name}</p>
          </div>
          <Badge variant={STATUS_BADGE[project.status]}>{statusLabel(project.status)}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className={cn("border-transparent", priority.className)}>
            Prioritas {priority.label}
          </Badge>
          {project.deadline && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden /> Deadline {formatDate(project.deadline)}
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progres terakhir</span>
            <span className="font-medium text-foreground tabular-nums">{progress === null ? "Belum diisi" : `${progress}%`}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ?? 0}
            aria-label="Progres terakhir"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress ?? 0}%` }} />
          </div>
        </div>
      </div>

      <Tabs defaultValue="progress" className="w-full">
        <TabsList className="grid h-auto! w-full grid-cols-3">
          <TabsTrigger value="progress" className="h-11! text-xs sm:text-sm md:h-8!">Update progres</TabsTrigger>
          <TabsTrigger value="brief" className="h-11! text-xs sm:text-sm md:h-8!">
            Brief{!project.brief && <span className="sr-only"> (belum ada)</span>}
          </TabsTrigger>
          <TabsTrigger value="revisions" className="h-11! text-xs sm:text-sm md:h-8!">
            Revisi
            {pendingRevisions > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800 tabular-nums dark:bg-amber-950 dark:text-amber-200">
                {pendingRevisions}
                <span className="sr-only"> menunggu</span>
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="space-y-6 pt-3">
          <section className="rounded-lg border bg-card p-4">
            <ProgressUpdateForm key={project.id} project={project} />
          </section>
          <StatusControl project={project} />
          <FinalSection project={project} />
          <section className="space-y-3" aria-labelledby={`history-${project.id}`}>
            <h3 id={`history-${project.id}`} className="text-sm font-semibold">
              Riwayat update
            </h3>
            <UpdateTimeline updates={project.updates} />
          </section>
        </TabsContent>

        <TabsContent value="brief" className="pt-3">
          {project.brief ? (
            <BriefReader responses={project.brief.responses} serviceCode={project.service.code} />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
              <FileText className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">Brief belum tersedia</p>
              <p className="text-xs text-muted-foreground">Klien belum mengisi brief untuk project ini.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="revisions" className="pt-3">
          <RevisionList revisions={project.revisions} />
        </TabsContent>
      </Tabs>
    </article>
  );
}
