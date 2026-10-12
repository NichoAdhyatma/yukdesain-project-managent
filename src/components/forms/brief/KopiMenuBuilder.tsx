"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import type { KopiMenuItem } from "./types";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const MAX_SIZE_MB = 5;

interface KopiMenuBuilderProps {
  items: KopiMenuItem[];
  onChange: (items: KopiMenuItem[]) => void;
  disabled?: boolean;
}

export function KopiMenuBuilder({
  items,
  onChange,
  disabled,
}: KopiMenuBuilderProps) {
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.image?.startsWith("blob:")) {
          URL.revokeObjectURL(item.image);
        }
      });
    };
  }, []);

  const handleFileSelect = (id: string, file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) return;

    const prev = itemsRef.current.find((i) => i.id === id);
    if (prev?.image?.startsWith("blob:")) {
      URL.revokeObjectURL(prev.image);
    }

    const previewUrl = URL.createObjectURL(file);
    onChange(itemsRef.current.map((item) =>
      item.id === id ? { ...item, image: previewUrl, file } : item
    ));
  };

  const removeImage = (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (item?.image?.startsWith("blob:")) {
      URL.revokeObjectURL(item.image);
    }
    onChange(itemsRef.current.map((item) =>
      item.id === id ? { ...item, image: undefined, file: undefined } : item
    ));
  };

  const addItem = () => {
    onChange([...items, { id: String(Date.now()), name: "", price: "" }]);
  };

  const removeItem = (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (item?.image?.startsWith("blob:")) {
      URL.revokeObjectURL(item.image);
    }
    onChange(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: keyof KopiMenuItem, value: string) => {
    onChange(items.map((item) =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Daftar Menu Kopi</Label>
        <p className="text-xs text-muted-foreground -mt-1">
          Tambahkan item menu kopi yang akan ditampilkan di gerobak
        </p>
      </div>

      {items.length === 0 ? (
        <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground text-center">Belum ada item menu</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            disabled={disabled}
          >
            <Plus className="h-4 w-4 mr-2" />
            Tambah Menu
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id} className="flex gap-3 items-start border rounded-lg p-3">
                {/* Image upload */}
                <div className="shrink-0">
                  {item.image ? (
                    <div className="relative w-20 h-20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image}
                        alt={item.name || `Menu ${idx + 1}`}
                        className="w-20 h-20 object-cover rounded-lg border"
                      />
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => removeImage(item.id)}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80"
                          aria-label="Hapus gambar"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <label
                      className={cn(
                        "w-20 h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors",
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
                      <span className="text-[9px] text-muted-foreground text-center px-1">Upload</span>
                    </label>
                  )}
                </div>

                {/* Fields */}
                <div className="flex-1 min-w-0 space-y-2">
                  <Input
                    placeholder={`Nama menu ${idx + 1}`}
                    value={item.name}
                    onChange={(e) => updateItem(item.id, "name", e.target.value)}
                    disabled={disabled}
                    className="text-sm"
                  />
                  <div className="space-y-1">
                    <Label htmlFor={`kopi-harga-${item.id}`} className="text-xs">
                      Harga
                    </Label>
                    <CurrencyInput
                      id={`kopi-harga-${item.id}`}
                      value={item.price ? parseInt(item.price, 10) : undefined}
                      onChange={(v) => updateItem(item.id, "price", v > 0 ? String(v) : "")}
                      placeholder="Harga"
                    />
                  </div>
                  <Input
                    placeholder="Deskripsi (opsional)"
                    value={item.caption || ""}
                    onChange={(e) => updateItem(item.id, "caption", e.target.value)}
                    disabled={disabled}
                    className="text-sm"
                  />
                </div>

                {/* Delete */}
                {items.length > 1 && !disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(item.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    aria-label="Hapus item menu"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
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
              Tambah Menu
            </Button>
          )}
        </>
      )}
    </div>
  );
}
