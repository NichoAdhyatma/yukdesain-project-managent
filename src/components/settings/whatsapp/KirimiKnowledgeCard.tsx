"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Download, FileText, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// Knowledge .md untuk Agen AI Kirimi (docs/WHATSAPP_CHANNEL_KIRIMI.md): dibuat dari katalog Layanan, Operasional,
// dan Panduan portal; owner menyalin atau mengunduhnya lalu menempelkannya di Kirimi.

type Source = "published" | "draft";
type Knowledge = { source: Source; version: number | null; markdown: string; chars: number };

const SOURCES: [Source, string][] = [
  ["published", "Versi terbit"],
  ["draft", "Draft"],
];

async function fetchKnowledge(source: Source): Promise<Knowledge> {
  const res = await fetch(`/api/settings/whatsapp/kirimi-knowledge?source=${source}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Knowledge tidak bisa dibuat");
  return res.json();
}

const fmt = (n: number) => n.toLocaleString("id-ID");

export function KirimiKnowledgeCard() {
  const [source, setSource] = useState<Source>("published");
  const generate = useMutation({ mutationFn: fetchKnowledge });
  const data = generate.data && generate.data.source === source ? generate.data : null;

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.markdown);
      toast("Knowledge disalin. Tempel di pengaturan Agen AI Kirimi.", "success");
    } catch {
      toast("Tidak bisa menyalin. Pilih teks lalu salin manual.", "error");
    }
  };

  const download = () => {
    if (!data) return;
    const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).replaceAll("-", "");
    const url = URL.createObjectURL(new Blob([data.markdown], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `knowledge-kirimi-${data.source === "draft" ? "draft" : `v${data.version ?? 0}`}-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Knowledge untuk Agen AI Kirimi</CardTitle>
        <CardDescription>
          Buat file .md dari katalog Layanan, Operasional, dan Panduan untuk ditempel di Agen AI Kirimi. Agen Kirimi tidak punya
          kalkulator dan penjaga harga portal, jadi aturannya ikut ditulis di file. Buat ulang setiap kali harga atau Panduan berubah.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="group" aria-label="Sumber knowledge" className="inline-flex w-fit rounded-lg border p-0.5">
            {SOURCES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={source === value}
                onClick={() => setSource(value)}
                className={cn(
                  "min-h-9 rounded-md px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:min-h-11",
                  source === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button type="button" className="max-md:h-11" onClick={() => generate.mutate(source)} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
            {data ? "Buat ulang" : "Buat knowledge"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {source === "draft"
            ? "Draft: Panduan draft dan semua layanan, termasuk yang nonaktif (ditandai jangan ditawarkan)."
            : "Versi terbit: Panduan yang sedang dipakai bot portal dan layanan aktif saja."}
        </p>

        {generate.isError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <span className="text-destructive">Knowledge tidak bisa dibuat. Periksa koneksi lalu coba lagi.</span>
            <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={() => generate.mutate(source)}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Coba lagi
            </Button>
          </div>
        )}

        {generate.isPending && !data && <div aria-busy="true" className="h-64 w-full animate-pulse rounded-lg bg-muted" />}

        {data && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={data.source === "draft" ? "outline" : "secondary"}>
                {data.source === "draft" ? "Dari draft" : data.version ? `Dari versi ${data.version}` : "Belum ada versi terbit"}
              </Badge>
              <span className="text-muted-foreground tabular-nums">{fmt(data.chars)} karakter</span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={copy}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Salin
                </Button>
                <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={download}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Unduh .md
                </Button>
              </div>
            </div>
            <label htmlFor="kirimi-knowledge-preview" className="sr-only">
              Isi knowledge
            </label>
            <textarea
              id="kirimi-knowledge-preview"
              readOnly
              value={data.markdown}
              className="h-96 w-full resize-y rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
