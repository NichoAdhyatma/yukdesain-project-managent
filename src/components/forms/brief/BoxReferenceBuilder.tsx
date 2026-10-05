"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BoxReference } from "./types";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const MAX_SIZE_MB = 10;

interface BoxReferenceBuilderProps {
  items: BoxReference[];
  onChange: (items: BoxReference[]) => void;
  projectId: string;
  clientToken?: string;
  disabled?: boolean;
}

export function BoxReferenceBuilder({
  items,
  onChange,
  projectId,
  clientToken,
  disabled,
}: BoxReferenceBuilderProps) {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const addItem = () => {
    onChange([...items, { id: String(Date.now()), description: "" }]);
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const updateDescription = (id: string, description: string) => {
    onChange(items.map((item) => (item.id === id ? { ...item, description } : item)));
  };

  const uploadImage = async (id: string, file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Format file tidak didukung. Gunakan JPG, PNG, WebP, atau SVG.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Ukuran file maksimal ${MAX_SIZE_MB}MB.`);
      return;
    }

    setError(undefined);
    setUploadingId(id);

    const uploadUrl = clientToken
      ? `/api/client-links/${clientToken}/upload`
      : "/api/upload";

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);
      formData.append("category", "brief-box-reference");

      const res = await fetch(uploadUrl, { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload gagal");
        return;
      }

      onChange(items.map((item) =>
        item.id === id ? { ...item, imageUrl: data.publicUrl } : item
      ));
    } catch {
      setError("Upload gagal. Coba lagi.");
    } finally {
      setUploadingId(null);
    }
  };

  const removeImage = (id: string) => {
    onChange(items.map((item) =>
      item.id === id ? { ...item, imageUrl: undefined } : item
    ));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Referensi Box</Label>
        <p className="text-xs text-muted-foreground -mt-1">
          Tambahkan referensi visual box yang diinginkan (warna, bentuk, style)
        </p>
      </div>

      {items.length === 0 ? (
        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 flex flex-col items-center gap-2">
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">Belum ada referensi</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            disabled={disabled}
          >
            <Plus className="h-4 w-4 mr-2" />
            Tambah Referensi
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="p-3 space-y-3">
                  {/* Image upload/preview */}
                  {item.imageUrl ? (
                    <div className="relative w-fit">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt="Box reference"
                        className="w-40 h-40 object-cover rounded-lg border"
                      />
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => removeImage(item.id)}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <label
                      className={cn(
                        "border-2 border-dashed rounded-lg p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors",
                        "border-muted-foreground/25 hover:border-muted-foreground/50",
                        disabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <input
                        type="file"
                        accept={ACCEPTED_IMAGE_TYPES.join(",")}
                        className="hidden"
                        disabled={disabled || uploadingId === item.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadImage(item.id, file);
                        }}
                      />
                      {uploadingId === item.id ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Mengupload...</p>
                        </>
                      ) : (
                        <>
                          <Upload className="h-5 w-5 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground text-center">
                            Seret gambar atau klik untuk upload
                          </p>
                        </>
                      )}
                    </label>
                  )}

                  {/* Description */}
                  <Input
                    placeholder="Deskripsi singkat (opsional)"
                    value={item.description}
                    onChange={(e) => updateDescription(item.id, e.target.value)}
                    disabled={disabled}
                  />

                  {/* Actions */}
                  {!disabled && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Hapus
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
            >
              <Plus className="h-4 w-4 mr-2" />
              Tambah Referensi
            </Button>
          )}
        </>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
