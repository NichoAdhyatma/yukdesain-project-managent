"use client";

import { useRef } from "react";
import { Paperclip, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadingFile {
  id: string;
  file: File;
  preview?: string;
}

interface FileUploadFieldProps {
  files: UploadingFile[];
  onChange: (files: UploadingFile[]) => void;
  maxFiles?: number;
  label?: string;
  hint?: string;
  disabled?: boolean;
  accept?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploadField({
  files,
  onChange,
  maxFiles = 5,
  label = "Lampiran File",
  hint,
  disabled = false,
  accept = "image/*",
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const remaining = maxFiles - files.length;

  function handleFiles(fileList: FileList | null) {
    if (!fileList || remaining <= 0) return;

    const newFiles: UploadingFile[] = [];
    const toAdd = Array.from(fileList).slice(0, remaining);

    for (const file of toAdd) {
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (file.type.startsWith("image/")) {
        const preview = URL.createObjectURL(file);
        newFiles.push({ id, file, preview });
      } else {
        newFiles.push({ id, file });
      }
    }

    onChange([...files, ...newFiles]);
  }

  function removeFile(id: string) {
    const removed = files.find((f) => f.id === id);
    if (removed?.preview) {
      URL.revokeObjectURL(removed.preview);
    }
    onChange(files.filter((f) => f.id !== id));
  }

  return (
    <div className="space-y-2">
      {/* Label row */}
      <div className="flex items-center justify-between">
        {label && (
          <label className="text-sm font-medium text-foreground">{label}</label>
        )}
        {files.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {files.length}/{maxFiles}
          </span>
        )}
      </div>

      {/* Drop zone */}
      {remaining > 0 && !disabled && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all",
            "hover:border-primary/40 hover:bg-muted/30",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground text-center">
            Klik untuk upload{hint ? ` ${hint}` : ""}
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            JPG, PNG, GIF, WebP — maks 10MB per file
          </p>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {item.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    className="w-8 h-8 rounded object-cover shrink-0"
                  />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate text-sm flex-1 min-w-0">{item.file.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatSize(item.file.size)}
                </span>
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeFile(item.id)}
                  className="text-muted-foreground hover:text-destructive ml-2 shrink-0 p-1 rounded transition-colors"
                  aria-label={`Hapus ${item.file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
