"use client";

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Link as LinkIcon, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReferenceItem {
  id: string;
  type: "image" | "url";
  url: string; // public URL for images, direct URL for type="url"
  caption: string;
  filename?: string;
  file?: File; // local file for preview (uploaded on form submit)
  uploading?: boolean;
  error?: string;
}

interface ReferenceUploaderProps {
  items: ReferenceItem[];
  onChange: (items: ReferenceItem[]) => void;
  maxItems?: number;
  label?: string;
  helperText?: string;
  disabled?: boolean;
}

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];

export function ReferenceUploader({
  items,
  onChange,
  maxItems = 10,
  label = "Referensi Visual",
  helperText = "Upload gambar atau tambahkan link referensi (Pinterest, website, dll)",
  disabled = false,
}: ReferenceUploaderProps) {
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);

  // Keep itemsRef in sync when items change
  useLayoutEffect(() => {
    itemsRef.current = items;
  });

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.type === "image" && item.url.startsWith("blob:")) {
          URL.revokeObjectURL(item.url);
        }
      });
    };
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const newItems: ReferenceItem[] = [];

      for (const file of Array.from(files)) {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) continue;
        if (file.size > 10 * 1024 * 1024) continue;

        const previewUrl = URL.createObjectURL(file);
        newItems.push({
          id: `local-${Date.now()}-${Math.random()}`,
          type: "image",
          url: previewUrl,
          caption: "",
          filename: file.name,
          file,
        });
      }

      onChange([...itemsRef.current, ...newItems]);
    },
    [onChange]
  );

  const handleAddUrl = () => {
    if (!urlValue.trim()) return;
    const newItem: ReferenceItem = {
      id: `url-${Date.now()}`,
      type: "url",
      url: urlValue.trim(),
      caption: "",
    };
    onChange([...itemsRef.current, newItem]);
    setUrlValue("");
    setShowUrlInput(false);
  };

  const removeItem = (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (item?.type === "image" && item.url.startsWith("blob:")) {
      URL.revokeObjectURL(item.url);
    }
    onChange(itemsRef.current.filter((i) => i.id !== id));
  };

  const updateCaption = (id: string, caption: string) => {
    onChange(itemsRef.current.map((item) => (item.id === id ? { ...item, caption } : item)));
  };

  return (
    <div className="space-y-3">
      {label && (
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{label}</Label>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground">{items.length}/{maxItems}</span>
          )}
        </div>
      )}
      {helperText && <p className="text-xs text-muted-foreground -mt-1">{helperText}</p>}

      {/* Upload drop zone */}
      {items.length < maxItems && !disabled && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
          )}
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
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            Seret gambar ke sini, atau klik untuk pilih file
          </p>
          <p className="text-xs text-muted-foreground/70">JPG, PNG, WebP, SVG — maks 10MB</p>
        </div>
      )}

      {/* URL input toggle */}
      {items.length < maxItems && !disabled && (
        <div className="flex gap-2">
          {showUrlInput ? (
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="https://pinterest.com/..."
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddUrl())}
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddUrl} disabled={!urlValue.trim()}>
                Tambah
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowUrlInput(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUrlInput(true)}
              className="w-full"
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Tambah Link Referensi
            </Button>
          )}
        </div>
      )}

      {/* Preview grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden relative group">
              {item.type === "image" ? (
                item.url.startsWith("blob:") ? (
                  // Local preview
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.caption || item.filename || "Preview"}
                    className="aspect-square object-cover w-full h-full"
                  />
                ) : item.uploading ? (
                  // Uploading state (used when uploading on submit)
                  <div className="aspect-square flex flex-col items-center justify-center bg-muted">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground mt-1">Mengupload...</p>
                  </div>
                ) : (
                  // Remote URL
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.caption || "Reference"}
                    className="aspect-square object-cover w-full h-full"
                  />
                )
              ) : (
                <div className="aspect-square flex flex-col items-center justify-center bg-muted/50 p-2">
                  <LinkIcon className="h-6 w-6 text-muted-foreground mb-1" />
                  <p className="text-xs text-muted-foreground text-center line-clamp-2 break-all">
                    {item.url.replace(/^https?:\/\//, "").slice(0, 30)}
                  </p>
                </div>
              )}

              {/* Delete button */}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              )}

              {/* Caption */}
              <div className="p-2">
                <Input
                  placeholder="Keterangan (opsional)"
                  value={item.caption}
                  onChange={(e) => updateCaption(item.id, e.target.value)}
                  className="h-7 text-xs"
                  disabled={disabled}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      {items.length > 0 && !disabled && (
        <p className="text-xs text-muted-foreground">
          {items.length} referensi ditambahkan — akan diupload saat brief dikirim
        </p>
      )}
    </div>
  );
}
