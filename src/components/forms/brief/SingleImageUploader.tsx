"use client";

import { useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const MAX_SIZE_MB = 10;

interface SingleImageUploaderProps {
  value?: string;
  file?: File;
  onChange: (url: string | undefined) => void;
  onFileChange?: (file: File | undefined) => void;
  label?: string;
  helperText?: string;
  projectId: string;
  clientToken?: string;
  disabled?: boolean;
}

export function SingleImageUploader({
  value,
  file,
  onChange,
  onFileChange,
  label,
  helperText,
  disabled,
}: SingleImageUploaderProps) {
  const [preview, setPreview] = useState<string | undefined>(value);
  const [, setPendingFile] = useState<File | undefined>(file);
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (selectedFile: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(selectedFile.type)) {
      setError("Format file tidak didukung. Gunakan JPG, PNG, WebP, atau SVG.");
      return;
    }
    if (selectedFile.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Ukuran file maksimal ${MAX_SIZE_MB}MB.`);
      return;
    }

    // Revoke previous blob if exists
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }

    // Local blob preview immediately
    const blobUrl = URL.createObjectURL(selectedFile);
    setPreview(blobUrl);
    setPendingFile(selectedFile);
    setError(undefined);
    onChange(blobUrl);
    if (onFileChange) onFileChange(selectedFile);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const remove = () => {
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }
    setPreview(undefined);
    setPendingFile(undefined);
    setError(undefined);
    onChange(undefined);
    if (onFileChange) onFileChange(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-sm font-medium">{label}</Label>
      )}
      {helperText && (
        <p className="text-xs text-muted-foreground -mt-1">{helperText}</p>
      )}

      {preview ? (
        <div className="relative w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt={label || "Preview"}
            className="w-32 h-32 object-cover rounded-lg border"
          />
          {!disabled && (
            <button
              type="button"
              onClick={remove}
              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/80"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={handleFileInput}
            disabled={disabled}
          />
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            Seret gambar ke sini, atau klik untuk pilih
          </p>
          <p className="text-xs text-muted-foreground/70">JPG, PNG, WebP, SVG — maks {MAX_SIZE_MB}MB</p>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
