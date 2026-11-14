"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageViewerGroup, ViewableImage } from "@/components/ui/image-viewer";
import type { LatestResult, ResultImage } from "@/lib/client-portal/latest-result";

// Hasil desain terbaru di bagian atas halaman tracking klien (permintaan owner 2026-11-14): sebelumnya hasil hanya
// bisa dilihat dengan scroll ke riwayat, membuka satu langkah, lalu menekan link nama file.

const LONG_NOTE = 220;

const imageUrl = (storageKey: string) => `${process.env.NEXT_PUBLIC_STORAGE_URL || ""}/${storageKey}`;

function sentAt(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const versionAlt = (image: ResultImage) => `Hasil desain ${sentAt(image.createdAt)}`;

export function LatestResultCard({
  result,
  canRevise,
  remainingRevisions,
  onRevise,
}: {
  result: LatestResult;
  canRevise: boolean;
  remainingRevisions: number;
  onRevise: () => void;
}) {
  const { latest, earlier, moreEarlier } = result;
  const [noteOpen, setNoteOpen] = useState(false);
  const longNote = latest.description.length > LONG_NOTE;

  return (
    <Card id="latest-result" className="scroll-mt-4">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle role="heading" aria-level={2} className="text-base font-semibold">
              Hasil desain terbaru
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Dikirim {sentAt(latest.createdAt)} oleh {latest.author}
            </p>
          </div>
          {latest.progress !== null && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary tabular-nums">
              Progres {latest.progress}%
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ImageViewerGroup className="space-y-3">
          <div className="overflow-hidden rounded-lg border bg-muted/40">
            <ViewableImage src={imageUrl(latest.storageKey)} alt={versionAlt(latest)} imgClassName="aspect-[4/3] max-h-[70vh] w-full object-contain" />
          </div>
          {earlier.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Versi sebelumnya</p>
              <div className="grid grid-cols-3 gap-2">
                {earlier.map((image) => (
                  <div key={image.updateId} className="space-y-1">
                    <div className="overflow-hidden rounded-md border bg-muted/40">
                      <ViewableImage src={imageUrl(image.storageKey)} alt={versionAlt(image)} imgClassName="aspect-square w-full object-cover" />
                    </div>
                    <p className="text-[11px] text-muted-foreground tabular-nums">{sentAt(image.createdAt)}</p>
                  </div>
                ))}
              </div>
              {moreEarlier > 0 && <p className="text-xs text-muted-foreground">+{moreEarlier} versi lain ada di riwayat di bawah.</p>}
            </div>
          )}
        </ImageViewerGroup>
        <p className="text-xs text-muted-foreground">Ketuk gambar untuk memperbesar.</p>

        {latest.description && (
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Catatan desainer</p>
            <p className={longNote && !noteOpen ? "line-clamp-4 whitespace-pre-line text-sm" : "whitespace-pre-line text-sm"}>{latest.description}</p>
            {longNote && (
              <button
                type="button"
                onClick={() => setNoteOpen((v) => !v)}
                aria-expanded={noteOpen}
                className="mt-1 min-h-11 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {noteOpen ? "Tutup catatan" : "Baca selengkapnya"}
              </button>
            )}
          </div>
        )}

        {canRevise && (
          <Button type="button" variant="outline" className="h-11 w-full rounded-xl text-sm font-medium" onClick={onRevise}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            Minta revisi ({remainingRevisions}x tersisa)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
