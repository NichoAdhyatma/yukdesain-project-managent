"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LogoItem {
  id: string;
  url: string;
  caption: string;
  file?: File;
  filename?: string;
  uploading?: boolean;
}

interface LogoUploaderProps {
  items: LogoItem[];
  onChange: (items: LogoItem[]) => void;
  maxItems?: number;
  label?: string;
  helperText?: string;
  disabled?: boolean;
}

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

export function LogoUploader({
  items,
  onChange,
  maxItems = 5,
  label = "Logo",
  helperText,
  disabled = false,
}: LogoUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0 || items.length >= maxItems) return;

      const newItems: LogoItem[] = [];

      for (const file of Array.from(files)) {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) continue;
        if (file.size > 10 * 1024 * 1024) continue;

        const previewUrl = URL.createObjectURL(file);
        newItems.push({
          id: `local-${Date.now()}-${Math.random()}`,
          url: previewUrl,
          caption: "",
          filename: file.name,
          file,
        });

        if (items.length + newItems.length >= maxItems) break;
      }

      if (newItems.length > 0) {
        onChange([...items, ...newItems]);
      }
    },
    [items, maxItems, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const updateItem = useCallback(
    (id: string, changes: Partial<LogoItem>) => {
      onChange(items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
    },
    [items, onChange]
  );

  const removeItem = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (item?.url.startsWith("blob:")) {
        URL.revokeObjectURL(item.url);
      }
      onChange(items.filter((i) => i.id !== id));
    },
    [items, onChange]
  );

  useEffect(() => {
    return () => {
      items.forEach((item) => {
        if (item.url.startsWith("blob:")) {
          URL.revokeObjectURL(item.url);
        }
      });
    };
  }, []);

  return (
    <div className="space-y-3">
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="relative aspect-square bg-muted/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.caption || item.filename || "Logo"}
                  className="w-full h-full object-contain"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-1 right-1 h-6 w-6"
                  onClick={() => removeItem(item.id)}
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="p-2 space-y-1">
                <Input
                  placeholder="Keterangan (opsional)"
                  value={item.caption}
                  onChange={(e) => updateItem(item.id, { caption: e.target.value })}
                  disabled={disabled}
                  className="text-xs h-7"
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {items.length < maxItems && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
            dragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-muted-foreground/50",
            disabled && "opacity-50 pointer-events-none"
          )}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={disabled}
          />
          <div className="flex flex-col items-center gap-1">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Klik atau drag & drop untuk upload logo
            </p>
            <p className="text-[10px] text-muted-foreground/60">
              JPG, PNG, WebP, SVG — max 10MB per file
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
