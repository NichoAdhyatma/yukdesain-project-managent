"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SERVICE_BOT_LIMITS as LIMITS } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Harga layanan untuk bot (spec 2026-11-11-kb-merge-design §4.1): mode harga, paket, harga per unit, estimasi.

export type PriceModeValue = "FIXED" | "STARTING";
export type PackageRow = { name: string; price: number | null; note: string };
export type UnitPricingValues = {
  enabled: boolean;
  unitLabel: string;
  includedUnits: number | null;
  extraUnitPrice: number | null;
  minUnits: number | null;
};

export type PricingValues = {
  priceMode: PriceModeValue;
  startingPrice: number | null;
  packages: PackageRow[];
  unit: UnitPricingValues;
  estimate: string;
};

export const EMPTY_UNIT: UnitPricingValues = { enabled: false, unitLabel: "", includedUnits: null, extraUnitPrice: null, minUnits: null };

const MODES: { id: PriceModeValue; label: string; help: string }[] = [
  { id: "FIXED", label: "Harga pasti", help: 'Bot menyebut angkanya langsung, mis. "Rp135.000".' },
  { id: "STARTING", label: "Mulai dari", help: 'Bot menyebut "mulai Rp…", harga final setelah brief.' },
];

type Props = {
  id: (name: string) => string;
  values: PricingValues;
  onChange: (patch: Partial<PricingValues>) => void;
  errors: Record<string, string>;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

const optional = <span className="font-normal text-muted-foreground">(opsional)</span>;

/** Angka bulat ≥ 0 dari isian teks; kosong = null. */
function toCount(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

export function ServicePricingFields({ id, values, onChange, errors }: Props) {
  const { priceMode, packages, unit } = values;
  const hasPackages = packages.length > 0;
  const setPackage = (index: number, patch: Partial<PackageRow>) =>
    onChange({ packages: packages.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  const setUnit = (patch: Partial<UnitPricingValues>) => onChange({ unit: { ...unit, ...patch } });
  const priceLabel = priceMode === "FIXED" ? "Harga" : "Harga mulai";
  const packagePrices = packages.map((p) => p.price).filter((n): n is number => n !== null);
  const shownPrice = hasPackages ? (packagePrices.length ? Math.min(...packagePrices) : undefined) : (values.startingPrice ?? undefined);

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-labelledby={id("priceMode-label")} className="space-y-1.5">
        <p id={id("priceMode-label")} className="text-sm font-medium">
          Cara bot menyebut harga
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {MODES.map((m) => (
            <label
              key={m.id}
              className={cn(
                "flex min-h-11 cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors",
                priceMode === m.id && "border-primary bg-primary/5",
              )}
            >
              <input
                type="radio"
                id={id(`priceMode-${m.id}`)}
                name={id("priceMode")}
                value={m.id}
                checked={priceMode === m.id}
                onChange={() => onChange({ priceMode: m.id })}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span className="min-w-0 space-y-0.5">
                <span className="block font-medium">{m.label}</span>
                <span className="block text-muted-foreground">{m.help}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id={id("priceMode-error")} message={errors.priceMode} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("startingPrice")}>
          {priceLabel} {optional}
        </Label>
        <CurrencyInput
          id={id("startingPrice")}
          value={shownPrice}
          onChange={(n) => onChange({ startingPrice: n > 0 ? n : null })}
          disabled={hasPackages}
          placeholder="Contoh: 135000"
          className="max-md:h-11"
          aria-describedby={`${id("startingPrice")}-help${errors.startingPrice ? ` ${id("startingPrice")}-error` : ""}`}
          aria-invalid={!!errors.startingPrice}
        />
        <p id={`${id("startingPrice")}-help`} className="text-xs text-muted-foreground">
          {hasPackages
            ? "Terisi otomatis dari paket termurah."
            : unit.enabled
              ? "Harga dasar sudah termasuk jumlah di bawah. Kosongkan bila dihitung per unit saja (mis. per halaman)."
              : "Kosongkan jika bot tidak boleh menyebut harga layanan ini."}
        </p>
        <FieldError id={`${id("startingPrice")}-error`} message={errors.startingPrice} />
      </div>

      <fieldset className="space-y-2" aria-describedby={`${id("packages")}-help`}>
        <legend className="text-sm font-medium">
          Paket {optional}
        </legend>
        <p id={`${id("packages")}-help`} className="text-xs text-muted-foreground">
          Untuk layanan dengan pilihan paket berharga beda (mis. Newspaper / Photostrips). Maksimal {LIMITS.packagesMax} paket.
        </p>
        {packages.map((p, i) => {
          const rowId = (f: string) => id(`package-${i}-${f}`);
          return (
            <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_9rem_auto] sm:items-start">
              <div className="space-y-1">
                <Label htmlFor={rowId("name")} className="text-xs">
                  Nama paket {i + 1}
                </Label>
                <Input
                  id={rowId("name")}
                  value={p.name}
                  maxLength={LIMITS.packageNameMaxChars}
                  onChange={(e) => setPackage(i, { name: e.target.value })}
                  placeholder="Contoh: Newspaper"
                  className="max-md:h-11"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={rowId("price")} className="text-xs">
                  Harga
                </Label>
                <CurrencyInput
                  id={rowId("price")}
                  value={p.price ?? undefined}
                  onChange={(n) => setPackage(i, { price: n > 0 ? n : null })}
                  placeholder="85000"
                  className="max-md:h-11"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="self-end max-md:h-11 max-md:w-11"
                aria-label={`Hapus paket ${p.name || i + 1}`}
                onClick={() => onChange({ packages: packages.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor={rowId("note")} className="text-xs">
                  Catatan paket {optional}
                </Label>
                <Input
                  id={rowId("note")}
                  value={p.note}
                  maxLength={LIMITS.packageNoteMaxChars}
                  onChange={(e) => setPackage(i, { note: e.target.value })}
                  placeholder="Contoh: termasuk 2 pilihan layout"
                  className="max-md:h-11"
                />
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-11"
          disabled={packages.length >= LIMITS.packagesMax}
          onClick={() => onChange({ packages: [...packages, { name: "", price: null, note: "" }] })}
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Tambah paket
        </Button>
        <FieldError id={id("packages-error")} message={errors.packages} />
      </fieldset>

      <div className="space-y-2">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Label htmlFor={id("unitEnabled")} className="flex-1">
            Dihitung per unit
            <span className="block text-xs font-normal text-muted-foreground">Item, halaman, varian, atau pose di atas jumlah yang termasuk harga.</span>
          </Label>
          <Switch id={id("unitEnabled")} aria-label="Dihitung per unit" checked={unit.enabled} onCheckedChange={(checked) => setUnit({ enabled: checked })} />
        </div>
        {unit.enabled && (
          <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={id("unitLabel")}>Satuan</Label>
              <Input
                id={id("unitLabel")}
                value={unit.unitLabel}
                maxLength={LIMITS.unitLabelMaxChars}
                onChange={(e) => setUnit({ unitLabel: e.target.value })}
                placeholder="item / halaman / varian / pose"
                className="max-md:h-11"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={id("extraUnitPrice")}>Tambahan per unit</Label>
              <CurrencyInput
                id={id("extraUnitPrice")}
                value={unit.extraUnitPrice ?? undefined}
                onChange={(n) => setUnit({ extraUnitPrice: n > 0 ? n : null })}
                placeholder="5000"
                className="max-md:h-11"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={id("includedUnits")}>Termasuk harga</Label>
              <Input
                id={id("includedUnits")}
                inputMode="numeric"
                value={unit.includedUnits ?? ""}
                onChange={(e) => setUnit({ includedUnits: toCount(e.target.value) })}
                placeholder="35"
                className="max-md:h-11"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={id("minUnits")}>Minimal {optional}</Label>
              <Input
                id={id("minUnits")}
                inputMode="numeric"
                value={unit.minUnits ?? ""}
                onChange={(e) => setUnit({ minUnits: toCount(e.target.value) })}
                placeholder="5"
                className="max-md:h-11"
              />
            </div>
            <FieldError id={id("unitPricing-error")} message={errors.unitPricing} />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("estimate")}>Estimasi pengerjaan {optional}</Label>
        <Input
          id={id("estimate")}
          value={values.estimate}
          maxLength={LIMITS.estimateMaxChars}
          onChange={(e) => onChange({ estimate: e.target.value })}
          placeholder="Contoh: 3 hari"
          className="max-md:h-11"
          aria-describedby={`${id("estimate")}-help${errors.estimate ? ` ${id("estimate")}-error` : ""}`}
          aria-invalid={!!errors.estimate}
        />
        <p id={`${id("estimate")}-help`} className="text-xs text-muted-foreground">
          Satu-satunya lama pengerjaan yang boleh disebut bot. Express tetap ditanyakan ke owner.
        </p>
        <FieldError id={`${id("estimate")}-error`} message={errors.estimate} />
      </div>
    </div>
  );
}
