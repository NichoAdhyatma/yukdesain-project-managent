"use client";

import { useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Upload, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CartReference } from "./types";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const MAX_SIZE_MB = 10;

interface CartReferenceBuilderProps {
  items: CartReference[];
  onChange: (items: CartReference[]) => void;
  projectId: string;
  clientToken?: string;
  disabled?: boolean;
}

export function CartReferenceBuilder({
  items,
  onChange,
  disabled,
}: CartReferenceBuilderProps) {
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.imageUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(item.imageUrl);
        }
      });
    };
  }, []);

  const handleFileSelect = (id: string, file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    onChange(itemsRef.current.map((item) =>
      item.id === id ? { ...item, imageUrl: previewUrl, file } : item
    ));
  };

  const addItem = () => {
    onChange([...items, { id: String(Date.now()), imageUrl: undefined }]);
  };

  const removeItem = (id: string) => {
    const item = itemsRef.current.find((item) => item.id === id);
    if (item?.imageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(item.imageUrl);
    }
    onChange(items.filter((item) => item.id !== id));
  };

  const updateDescription = (id: string, description: string) => {
    onChange(items.map((item) => (item.id === id ? { ...item, description } : item)));
  };

  const removeImage = (id: string) => {
    const item = itemsRef.current.find((item) => item.id === id);
    if (item?.imageUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(item.imageUrl);
    }
    onChange(items.map((item) =>
      item.id === id ? { ...item, imageUrl: undefined, file: undefined } : item
    ));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Referensi Visual Gerobak</Label>
        <p className="text-xs text-muted-foreground -mt-1">
          Upload referensi gerobak kopi keliling yang diinginkan
        </p>
      </div>

      {items.length === 0 ? (
        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 flex flex-col items-center gap-2">
          <ImageIcon className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">Belum ada referensi gerobak</p>
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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {items.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="p-2 space-y-2">
                  {/* Image upload/preview */}
                  {item.imageUrl ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.imageUrl}
                        alt="Cart reference"
                        className="w-full h-24 object-cover rounded-md border"
                      />
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => removeImage(item.id)}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80"
                          aria-label="Hapus gambar"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <label
                      className={cn(
                        "border-2 border-dashed rounded-md p-3 flex flex-col items-center gap-1 cursor-pointer transition-colors",
                        "border-muted-foreground/25 hover:border-muted-foreground/50",
                        disabled && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <input
                        type="file"
                        accept={ACCEPTED_IMAGE_TYPES.join(",")}
                        className="hidden"
                        disabled={disabled}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(item.id, file);
                        }}
                      />
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    </label>
                  )}

                  {/* Description */}
                  <Input
                    placeholder="Keterangan"
                    value={item.description || ""}
                    onChange={(e) => updateDescription(item.id, e.target.value)}
                    disabled={disabled}
                    className="text-xs h-8"
                  />

                  {!disabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.id)}
                      className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-7"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Hapus
                    </Button>
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
    </div>
  );
}
