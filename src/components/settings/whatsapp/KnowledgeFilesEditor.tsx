"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, FileText, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownView } from "@/components/ui/markdown-view";
import { cn } from "@/lib/utils";

// File pengetahuan .md di Panduan bot (docs/WHATSAPP_BOT_KNOWLEDGE.md). Selalu ikut di prompt bot,
// jadi total isi semua file dibatasi.

export type FormKnowledgeFile = { key: number; title: string; whenToUse: string; content: string };

export type KnowledgeLimits = {
  knowledgeFilesMaxItems: number;
  knowledgeFileMaxChars: number;
  knowledgeTotalMaxChars: number;
  knowledgeTitleMaxChars: number;
  knowledgeWhenToUseMaxChars: number;
  knowledgeUploadMaxBytes: number;
};

type Props = {
  id?: string;
  files: FormKnowledgeFile[];
  limits: KnowledgeLimits;
  errors: Record<string, string>;
  onChange: (key: number, patch: Partial<Omit<FormKnowledgeFile, "key">>, index: number) => void;
  onRemove: (key: number) => void;
  /** Return key file baru, supaya editornya langsung dibuka. */
  onAdd: (file: Omit<FormKnowledgeFile, "key">) => number;
};

const ACCEPTED = /\.(md|markdown|txt)$/i;

const fmt = (n: number) => n.toLocaleString("id-ID");

/** Judul dari heading Markdown pertama, jika tidak ada dari nama file. */
function titleFrom(text: string, fileName: string, max: number): string {
  const heading = text.match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/m)?.[1];
  const fallback = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  return (heading || fallback).trim().slice(0, max);
}

function downloadMarkdown(file: FormKnowledgeFile) {
  const name =
    file.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "pengetahuan";
  const url = URL.createObjectURL(new Blob([file.content], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function KnowledgeFilesEditor({ id, files, limits, errors, onChange, onRemove, onAdd }: Props) {
  const ids = useId();
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const [openKeys, setOpenKeys] = useState<Set<number>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FormKnowledgeFile | null>(null);
  const [previewKeys, setPreviewKeys] = useState<Set<number>>(new Set());
  const setPreview = (key: number, preview: boolean) =>
    setPreviewKeys((s) => {
      const next = new Set(s);
      if (preview) next.add(key);
      else next.delete(key);
      return next;
    });

  const total = files.reduce((sum, f) => sum + f.content.trim().length, 0);
  const overTotal = total > limits.knowledgeTotalMaxChars;
  const full = files.length >= limits.knowledgeFilesMaxItems;
  const totalError = errors.knowledgeFiles;

  const open = (key: number) => setOpenKeys((s) => new Set(s).add(key));
  const toggle = (key: number) =>
    setOpenKeys((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const focusTitle = (key: number) => requestAnimationFrame(() => document.getElementById(`${ids}-title-${key}`)?.focus());

  const addFile = (file: Omit<FormKnowledgeFile, "key">) => {
    const key = onAdd(file);
    open(key);
    focusTitle(key);
  };

  const onUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (uploadInput.current) uploadInput.current.value = "";
    if (!file) return;
    if (!ACCEPTED.test(file.name)) {
      setUploadError("Pilih file .md atau .txt.");
      return;
    }
    if (file.size > limits.knowledgeUploadMaxBytes) {
      setUploadError(`File terlalu besar. Maksimal ${fmt(Math.round(limits.knowledgeUploadMaxBytes / 1000))} KB.`);
      return;
    }
    let text: string;
    try {
      text = (await file.text()).replace(/\r\n?/g, "\n").trim();
    } catch {
      setUploadError("File tidak bisa dibaca. Coba simpan ulang sebagai .md lalu unggah lagi.");
      return;
    }
    if (!text) {
      setUploadError("File kosong.");
      return;
    }
    if (text.length > limits.knowledgeFileMaxChars) {
      setUploadError(
        `Isi file ${fmt(text.length)} karakter, maksimal ${fmt(limits.knowledgeFileMaxChars)} per file. Pecah menjadi beberapa file lalu unggah satu per satu.`,
      );
      return;
    }
    setUploadError(null);
    addFile({ title: titleFrom(text, file.name, limits.knowledgeTitleMaxChars), whenToUse: "", content: text });
  };

  return (
    <fieldset id={id} className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <legend className="text-sm font-medium">File pengetahuan</legend>
        <span className="text-sm text-muted-foreground tabular-nums">
          {files.length} / {limits.knowledgeFilesMaxItems} file
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Bahan bacaan bot dalam format Markdown: gaya komunikasi, pengetahuan desain, atau kebijakan studio. Semua file
        selalu dibaca bot. Harga dan lama pengerjaan tetap diisi di Aturan harga; angka harga di file tidak disebut bot
        sebelum penawaran.
      </p>

      <p
        id={`${ids}-total`}
        className={cn("text-sm tabular-nums", overTotal || totalError ? "text-destructive" : "text-muted-foreground")}
      >
        Total isi: {fmt(total)} / {fmt(limits.knowledgeTotalMaxChars)} karakter
        {overTotal && ". Melebihi batas: ringkas atau hapus sebagian isi sebelum menyimpan."}
      </p>
      {totalError && !overTotal && (
        <p role="alert" className="text-sm text-destructive">
          {totalError}
        </p>
      )}

      {files.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <p>Belum ada file pengetahuan.</p>
          <p className="mt-1">
            Contoh isi: cara menyapa dan nada bicara, beda logo minimalis dan maskot, atau aturan file mentah.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {files.map((file, index) => {
            const isOpenRaw = openKeys.has(file.key);
            const titleErr = errors[`knowledgeFiles.${index}.title`];
            const whenErr = errors[`knowledgeFiles.${index}.whenToUse`];
            const contentErr = errors[`knowledgeFiles.${index}.content`];
            const hasError = !!(titleErr || whenErr || contentErr);
            // File dengan isian salah selalu terbuka supaya pesan errornya terlihat.
            const isOpen = isOpenRaw || hasError;
            const label = file.title.trim() || `File ${index + 1}`;
            const panelId = `${ids}-panel-${file.key}`;
            return (
              <li key={file.key} className={cn("rounded-lg border", hasError && "border-destructive")}>
                <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4">
                  <div className="flex min-w-0 gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{label}</p>
                      <p className="break-words text-sm text-muted-foreground">
                        {file.whenToUse.trim() ? `Dipakai saat: ${file.whenToUse.trim()}` : "Belum ada keterangan kapan dipakai"}
                        {" · "}
                        <span className="tabular-nums">{fmt(file.content.trim().length)} karakter</span>
                      </p>
                      {hasError && !isOpen && <p className="text-sm text-destructive">Ada isian yang perlu diperbaiki.</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="max-md:h-11"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      disabled={hasError}
                      onClick={() => toggle(file.key)}
                    >
                      {isOpen ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                      {isOpen ? "Tutup" : "Edit"}
                      <span className="sr-only"> {label}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="max-md:h-11"
                      disabled={!file.content.trim()}
                      onClick={() => downloadMarkdown(file)}
                      aria-label={`Unduh ${label} sebagai .md`}
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Unduh</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="max-md:h-11"
                      onClick={() => (file.content.trim() ? setPendingDelete(file) : onRemove(file.key))}
                      aria-label={`Hapus ${label}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Hapus</span>
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div id={panelId} className="space-y-3 border-t p-3 sm:p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`${ids}-title-${file.key}`}>Judul</Label>
                        <Input
                          id={`${ids}-title-${file.key}`}
                          value={file.title}
                          maxLength={limits.knowledgeTitleMaxChars}
                          onChange={(e) => onChange(file.key, { title: e.target.value }, index)}
                          placeholder="Misalnya: Gaya komunikasi"
                          aria-invalid={!!titleErr}
                          aria-describedby={titleErr ? `${ids}-title-err-${file.key}` : undefined}
                        />
                        {titleErr && (
                          <p id={`${ids}-title-err-${file.key}`} className="text-sm text-destructive">
                            {titleErr}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`${ids}-when-${file.key}`}>Dipakai saat (opsional)</Label>
                        <Input
                          id={`${ids}-when-${file.key}`}
                          value={file.whenToUse}
                          maxLength={limits.knowledgeWhenToUseMaxChars}
                          onChange={(e) => onChange(file.key, { whenToUse: e.target.value }, index)}
                          placeholder="Misalnya: klien bingung memilih gaya logo"
                          aria-invalid={!!whenErr}
                          aria-describedby={whenErr ? `${ids}-when-err-${file.key}` : undefined}
                        />
                        {whenErr && (
                          <p id={`${ids}-when-err-${file.key}`} className="text-sm text-destructive">
                            {whenErr}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <Label htmlFor={`${ids}-content-${file.key}`}>Isi (Markdown)</Label>
                        <EditPreviewToggle
                          preview={previewKeys.has(file.key)}
                          onChange={(preview) => setPreview(file.key, preview)}
                          label={label}
                        />
                        <span
                          id={`${ids}-content-count-${file.key}`}
                          className={cn(
                            "tabular-nums",
                            file.content.length > limits.knowledgeFileMaxChars ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {fmt(file.content.length)} / {fmt(limits.knowledgeFileMaxChars)}
                        </span>
                      </div>
                      {previewKeys.has(file.key) ? (
                        <div
                          className="max-h-[28rem] min-h-40 overflow-y-auto rounded-lg border bg-muted/30 p-3"
                          aria-label={`Pratinjau ${label}`}
                          role="region"
                          tabIndex={0}
                        >
                          {file.content.trim() ? (
                            <MarkdownView>{file.content}</MarkdownView>
                          ) : (
                            <p className="text-sm text-muted-foreground">Belum ada isi.</p>
                          )}
                        </div>
                      ) : (
                      <Textarea
                        id={`${ids}-content-${file.key}`}
                        rows={12}
                        maxLength={limits.knowledgeFileMaxChars}
                        value={file.content}
                        onChange={(e) => onChange(file.key, { content: e.target.value }, index)}
                        className="font-mono"
                        placeholder={"# Gaya komunikasi\n\n- Sapa klien dengan \"kak\".\n- Balasan singkat, maksimal 3 paragraf."}
                        aria-invalid={!!contentErr}
                        aria-describedby={`${ids}-content-count-${file.key} ${ids}-total${contentErr ? ` ${ids}-content-err-${file.key}` : ""}`}
                      />
                      )}
                      {contentErr && (
                        <p id={`${ids}-content-err-${file.key}`} className="text-sm text-destructive">
                          {contentErr}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={uploadInput}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => onUpload(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            className="max-md:h-11"
            disabled={full}
            onClick={() => uploadInput.current?.click()}
            aria-describedby={uploadError ? `${ids}-upload-err` : undefined}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Unggah .md
          </Button>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-11"
            disabled={full}
            onClick={() => addFile({ title: "", whenToUse: "", content: "" })}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Tulis file baru
          </Button>
        </div>
        {uploadError && (
          <p id={`${ids}-upload-err`} role="alert" className="text-sm text-destructive">
            {uploadError}
          </p>
        )}
        {full && <p className="text-sm text-muted-foreground">Sudah {limits.knowledgeFilesMaxItems} file. Hapus satu untuk menambah.</p>}
      </div>

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus {pendingDelete?.title.trim() || "file ini"}?</DialogTitle>
            <DialogDescription>
              File dihapus dari draft. Selama draft belum disimpan, Anda masih bisa memakai Batalkan perubahan. Unduh
              dulu jika ingin menyimpan salinannya.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) onRemove(pendingDelete.key);
                setPendingDelete(null);
              }}
            >
              Hapus file
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </fieldset>
  );
}

/** Tombol Edit / Pratinjau untuk isi Markdown. */
export function EditPreviewToggle({
  preview,
  onChange,
  label,
}: {
  preview: boolean;
  onChange: (preview: boolean) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={`Tampilan isi ${label}`} className="inline-flex rounded-md border p-0.5 text-sm">
      {(
        [
          [false, "Edit"],
          [true, "Pratinjau"],
        ] as const
      ).map(([value, text]) => (
        <button
          key={text}
          type="button"
          aria-pressed={preview === value}
          onClick={() => onChange(value)}
          className={cn(
            "min-h-7 rounded px-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:min-h-10",
            preview === value ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
