"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";
import type { KopiMenuItem } from "./types";

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
  const addItem = () => {
    onChange([...items, { id: String(Date.now()), name: "", price: "" }]);
  };

  const removeItem = (id: string) => {
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
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={item.id} className="flex gap-2 items-start">
                <Input
                  placeholder={`Nama menu ${idx + 1}`}
                  value={item.name}
                  onChange={(e) => updateItem(item.id, "name", e.target.value)}
                  disabled={disabled}
                  className="flex-1"
                />
                <CurrencyInput
                  value={parseInt(item.price ?? "", 10) || 0}
                  onChange={(v) => updateItem(item.id, "price", String(v))}
                  placeholder="Rp 0"
                />
                {items.length > 1 && !disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(item.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
