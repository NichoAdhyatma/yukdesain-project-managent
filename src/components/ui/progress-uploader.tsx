"use client";

import { useState, useRef, useCallback, useId } from "react";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, X, FileText, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UploadedFile {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  publicUrl: string;
}

interface ProgressUploaderProps {
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  label?: string;
  /** Teks bantuan di bawah label. */
  hint?: string;
  disabled?: boolean;
  uploadCategory?: "progress" | "final" | "revision" | "logo";
  /** Wajib supaya file langsung terunggah dan terhubung ke project. */
  projectId?: string;
  /** Dipanggil saat status unggah berubah, supaya form bisa menahan tombol kirim. */
  onUploadingChange?: (uploading: boolean) => void;
}

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB, sama dengan batas /api/upload

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProgressUploader({
  files,
  onChange,
  maxFiles = 5,
  label = "Lampiran File",
  hint,
  disabled = false,
  uploadCategory = "progress",
  projectId,
  onUploadingChange,
}: ProgressUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [current, setCurrent] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  const uploadFile = useCallback(
    async (file: File): Promise<UploadedFile> => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        throw new Error(`${file.name}: tipe file tidak didukung. Pakai JPG, PNG, GIF, WEBP, SVG, atau PDF.`);
      }
      if (file.size > MAX_SIZE) {
        throw new Error(`${file.name}: ukuran ${formatSize(file.size)}, maksimal 50 MB.`);
      }
      if (!projectId) {
        throw new Error("Project belum dipilih.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);
      formData.append("category", uploadCategory);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(`${file.name}: ${data.error || "upload gagal"}. Coba lagi.`);
      }
      const { attachmentId, publicUrl } = await res.json();
      return {
        id: attachmentId,
        filename: file.name,
        size: file.size,
        mimeType: file.type,
        publicUrl,
      };
    },
    [projectId, uploadCategory]
  );

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const remaining = maxFiles - files.length;
      if (remaining <= 0) return;

      const picked = Array.from(fileList);
      const toUpload = picked.slice(0, remaining);
      const nextErrors: string[] = [];
      if (picked.length > remaining) {
        nextErrors.push(`Maksimal ${maxFiles} file. ${picked.length - remaining} file tidak diunggah.`);
      }

      setErrors([]);
      setUploading(true);
      onUploadingChange?.(true);

      // Kumpulkan hasil di variabel lokal. Memanggil onChange([...files, x]) di dalam
      // loop memakai `files` lama, jadi hanya file terakhir yang tersimpan.
      let accumulated = files;
      for (let i = 0; i < toUpload.length; i++) {
        setCurrent({ done: i, total: toUpload.length });
        try {
          const uploaded = await uploadFile(toUpload[i]);
          accumulated = [...accumulated, uploaded];
          onChange(accumulated);
        } catch (err) {
          nextErrors.push(err instanceof Error ? err.message : "Upload gagal. Coba lagi.");
        }
      }

      setErrors(nextErrors);
      setCurrent(null);
      setUploading(false);
      onUploadingChange?.(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [files, maxFiles, onChange, onUploadingChange, uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (!disabled && !uploading) handleFiles(e.dataTransfer.files);
    },
    [handleFiles, disabled, uploading]
  );

  const removeFile = (id: string) => {
    onChange(files.filter((f) => f.id !== id));
  };

  const canAdd = files.length < maxFiles && !disabled;

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={inputId} className="text-sm font-medium">
            {label}
          </Label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {files.length}/{maxFiles}
          </span>
        </div>
      )}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        multiple={maxFiles > 1}
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={!canAdd || uploading}
        aria-describedby={hint ? hintId : undefined}
        tabIndex={-1}
      />

      {canAdd && (
        <button
          type="button"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-describedby={hint ? hintId : undefined}
          className={cn(
            "flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-progress",
            dragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
          )}
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <Upload className="size-5 text-muted-foreground" aria-hidden />
          )}
          <span className="text-sm font-medium">
            {uploading && current
              ? `Mengunggah file ${current.done + 1} dari ${current.total}…`
              : "Pilih file"}
          </span>
          {!uploading && (
            <span className="text-xs text-muted-foreground">
              Ketuk untuk memilih, atau seret file ke sini. JPG, PNG, GIF, WEBP, SVG, atau PDF, maks. 50 MB.
            </span>
          )}
        </button>
      )}

      <div aria-live="polite" className="sr-only">
        {uploading && current ? `Mengunggah file ${current.done + 1} dari ${current.total}` : ""}
      </div>

      {errors.length > 0 && (
        <div role="alert" className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
          {errors.map((msg) => (
            <p key={msg} className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {msg}
            </p>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file) => {
            const isImage = file.mimeType.startsWith("image/") && !!file.publicUrl;
            return (
              <li key={file.id} className="flex items-center gap-3 rounded-lg border p-2 text-sm">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.publicUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <FileText className="size-5 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" title={file.filename}>
                    {file.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(file.size)}
                    {file.publicUrl && (
                      <>
                        {" · "}
                        <a
                          href={file.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          Buka
                        </a>
                      </>
                    )}
                  </p>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    aria-label={`Hapus ${file.filename}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
