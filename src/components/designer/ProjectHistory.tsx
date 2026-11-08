"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Loader2, MessageSquareWarning, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ImageViewerGroup, ViewableImage } from "@/components/ui/image-viewer";
import {
  REVISION_STATUS,
  formatDate,
  formatDateTime,
  isImage,
  type DesignerAttachment,
  type DesignerRevision,
  type DesignerUpdate,
} from "./types";

function FileLink({ attachment }: { attachment: DesignerAttachment }) {
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-md border px-3 text-sm text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <FileText className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{attachment.filename}</span>
    </a>
  );
}

function AttachmentPreview({ attachment }: { attachment: DesignerAttachment }) {
  if (!attachment.url) {
    return <p className="text-xs text-muted-foreground">{attachment.filename} (storage belum dikonfigurasi)</p>;
  }
  if (isImage(attachment)) {
    return (
      <div className="w-full max-w-xs overflow-hidden rounded-lg border bg-muted/40">
        <ViewableImage
          src={attachment.url}
          alt={attachment.filename}
          imgClassName="h-40 w-full object-cover"
        />
      </div>
    );
  }
  return <FileLink attachment={attachment} />;
}

export function UpdateTimeline({ updates }: { updates: DesignerUpdate[] }) {
  if (updates.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
        <History className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Belum ada update</p>
        <p className="text-xs text-muted-foreground">Update pertama yang kamu kirim akan muncul di sini.</p>
      </div>
    );
  }

  return (
    <ImageViewerGroup>
      <ol className="space-y-3">
        {updates.map((update) => (
          <li key={update.id} className="space-y-2.5 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{update.author.name}</span> ·{" "}
                <time dateTime={update.createdAt}>{formatDateTime(update.createdAt)}</time>
              </p>
              {update.progress !== null && (
                <span className="text-sm font-semibold tabular-nums">{update.progress}%</span>
              )}
            </div>
            {update.progress !== null && (
              <div
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={update.progress}
                aria-label="Progres pada update ini"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${update.progress}%` }} />
              </div>
            )}
            <p className="whitespace-pre-wrap break-words text-sm">{update.description}</p>
            {update.attachment && <AttachmentPreview attachment={update.attachment} />}
          </li>
        ))}
      </ol>
    </ImageViewerGroup>
  );
}

export function RevisionList({ projectId, revisions, closed }: { projectId: string; revisions: DesignerRevision[]; closed: boolean }) {
  if (revisions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
        <MessageSquareWarning className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Belum ada permintaan revisi</p>
        <p className="text-xs text-muted-foreground">Permintaan revisi dari klien akan muncul di sini.</p>
      </div>
    );
  }

  return (
    <ImageViewerGroup>
      <ol className="space-y-3">
        {revisions.map((rev) => {
          const st = REVISION_STATUS[rev.status] ?? REVISION_STATUS.PENDING;
          const images = rev.attachments.filter(isImage);
          const others = rev.attachments.filter((a) => !isImage(a));
          return (
            <li key={rev.id} className="space-y-2.5 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">Revisi #{rev.number}</p>
                {rev.completedAt ? (
                  <Badge variant="default">
                    <CheckCircle2 aria-hidden /> Selesai dikerjakan
                  </Badge>
                ) : (
                  <Badge variant={st.variant}>{st.label}</Badge>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{rev.description}</p>
              {images.length > 0 && (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label={`Lampiran revisi #${rev.number}`}>
                  {images.map((a) => (
                    <li key={a.id} className="overflow-hidden rounded-lg border bg-muted/40">
                      <ViewableImage src={a.url} alt={`Revisi #${rev.number}: ${a.filename}`} imgClassName="aspect-square w-full object-cover" />
                    </li>
                  ))}
                </ul>
              )}
              {others.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {others.map((a) => (
                    <FileLink key={a.id} attachment={a} />
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Diminta <time dateTime={rev.requestedAt}>{formatDate(rev.requestedAt)}</time>
                {rev.completedAt && (
                  <>
                    {" · "}selesai <time dateTime={rev.completedAt}>{formatDate(rev.completedAt)}</time>
                  </>
                )}
              </p>
              {!rev.completedAt && !closed && <CompleteRevisionButton projectId={projectId} revision={rev} />}
            </li>
          );
        })}
      </ol>
    </ImageViewerGroup>
  );
}

/** Tandai revisi selesai dikerjakan; klien dikabari lewat WhatsApp (docs/CLIENT_NOTIFICATIONS.md). */
function CompleteRevisionButton({ projectId, revision }: { projectId: string; revision: DesignerRevision }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/designer/projects/${projectId}/revisions/${revision.id}/complete`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal menandai revisi. Coba lagi.");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["designer-projects"] });
      toast(`Revisi #${revision.number} ditandai selesai. Kabar ke klien lewat WhatsApp diproses.`, "success");
    },
    onError: (err: Error) => {
      setConfirming(false);
      toast(err.message, "error");
    },
  });

  if (!confirming) {
    return (
      <Button type="button" variant="outline" size="sm" className="h-11 md:h-8" onClick={() => setConfirming(true)}>
        <CheckCircle2 aria-hidden /> Tandai revisi selesai
      </Button>
    );
  }
  return (
    <div role="group" aria-label={`Konfirmasi revisi #${revision.number} selesai`} className="space-y-2 rounded-md border bg-muted/40 p-3">
      <p className="text-sm">Tandai revisi #{revision.number} selesai? Klien akan dikabari lewat WhatsApp.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="h-11 md:h-8" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />}
          Ya, tandai selesai
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-11 md:h-8" disabled={mutation.isPending} onClick={() => setConfirming(false)}>
          Batal
        </Button>
      </div>
    </div>
  );
}
