"use client";

import { useState, useRef, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, X, Paperclip } from "lucide-react";
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
  disabled?: boolean;
  uploadCategory?: "progress" | "final" | "revision" | "logo";
  /** If provided, files will be uploaded immediately with this projectId. Otherwise, stores metadata only. */
  projectId?: string;
}

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

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
  disabled = false,
  uploadCategory = "progress",
  projectId,
}: ProgressUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File): Promise<UploadedFile | null> => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        alert(`Tipe file ${file.type} tidak didukung`);
        return null;
      }
      if (file.size > MAX_SIZE) {
        alert("Ukuran file maksimal 50MB");
        return null;
      }

      if (!projectId) {
        alert("Project ID tidak tersedia");
        return null;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", projectId);
        formData.append("category", uploadCategory);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload gagal");
        }

        const { attachmentId, publicUrl } = await res.json();
        return {
          id: attachmentId,
          filename: file.name,
          size: file.size,
          mimeType: file.type,
          publicUrl,
        };
      } catch (err) {
        alert(err instanceof Error ? err.message : "Upload gagal");
        return null;
      }
    },
    [projectId, uploadCategory]
  );

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const remaining = maxFiles - files.length;
      if (remaining <= 0) return;

      setUploading(true);
      const toUpload = Array.from(fileList).slice(0, remaining);

      for (let i = 0; i < toUpload.length; i++) {
        setProgress(((i + 1) / toUpload.length) * 100);
        const uploaded = await uploadFile(toUpload[i]);
        if (uploaded) {
          onChange([...files, uploaded]);
        }
      }

      setUploading(false);
      setProgress(0);
    },
    [files, maxFiles, onChange, uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (!disabled) handleFiles(e.dataTransfer.files);
    },
    [handleFiles, disabled]
  );

  const removeFile = (id: string) => {
    onChange(files.filter((f) => f.id !== id));
  };

  const removeUnuploadedFile = async (id: string) => {
    onChange(files.filter((f) => f.id !== id));
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{label}</Label>
          {files.length > 0 && (
            <span className="text-xs text-muted-foreground">{files.length}/{maxFiles}</span>
          )}
        </div>
      )}

      {/* Drop zone */}
      {files.length < maxFiles && !disabled && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={disabled}
          />
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" />
          )}
          <p className="text-xs text-muted-foreground text-center">
            {uploading ? `Mengupload... ${Math.round(progress)}%` : "Klik atau drag file ke sini"}
          </p>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="truncate">{file.filename}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatSize(file.size)}
                </span>
                {file.publicUrl && (
                  <a
                    href={file.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary shrink-0 hover:underline"
                  >
                    Lihat
                  </a>
                )}
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => {
                    if (file.id.startsWith("local-")) {
                      removeUnuploadedFile(file.id);
                    } else {
                      removeFile(file.id);
                    }
                  }}
                  className="text-muted-foreground hover:text-destructive ml-2 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
