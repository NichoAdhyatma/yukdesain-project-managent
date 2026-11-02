"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { describePricingRule } from "@/components/wa-orders/labels";

// Aturan harga owner di Panduan bot (docs/WHATSAPP_OWNER_COMMANDS.md §6).

export type FormRule = {
  key: number;
  id?: string;
  kind: "DISCOUNT" | "SURCHARGE";
  name: string;
  condition: string;
  amountType: "FIXED" | "PERCENT";
  amount: number;
  note: string;
};

const KIND_OPTIONS = [
  { value: "DISCOUNT", label: "Potongan harga" },
  { value: "SURCHARGE", label: "Biaya tambahan" },
];
const TYPE_OPTIONS = [
  { value: "FIXED", label: "Rupiah" },
  { value: "PERCENT", label: "Persen dari total" },
];

type Props = {
  rules: FormRule[];
  max: number;
  errors: Record<string, string>;
  onChange: (key: number, patch: Partial<FormRule>, index: number) => void;
  onRemove: (key: number) => void;
  onAdd: () => void;
};

export function PricingRulesEditor({ rules, max, errors, onChange, onRemove, onAdd }: Props) {
  return (
    <fieldset className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <legend className="text-sm font-medium">Aturan harga</legend>
        <span className="text-sm text-muted-foreground tabular-nums">
          {rules.length} / {max}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Potongan atau biaya tambahan yang boleh disebut bot sebelum penawaran, persis seperti tertulis di sini. Bot
        menandai order yang memenuhi syarat; harga akhir tetap Anda isi di Order WA.
      </p>

      {rules.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Belum ada aturan harga.</p>
      ) : (
        <ol className="space-y-4">
          {rules.map((rule, index) => {
            const err = (field: string) => errors[`pricingRules.${index}.${field}`];
            const id = (field: string) => `wa-rule-${field}-${rule.key}`;
            return (
              <li key={rule.key} className="space-y-3 rounded-lg border p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {rule.name.trim() || `Aturan ${index + 1}`}
                    {rule.amount > 0 && (
                      <span className="font-normal text-muted-foreground"> · {describePricingRule(rule)}</span>
                    )}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(rule.key)} aria-label={`Hapus aturan harga ${index + 1}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Hapus</span>
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={id("name")}>Nama</Label>
                    <Input
                      id={id("name")}
                      value={rule.name}
                      maxLength={60}
                      onChange={(e) => onChange(rule.key, { name: e.target.value }, index)}
                      placeholder="Misalnya: Diskon order banyak"
                      aria-invalid={!!err("name")}
                    />
                    {err("name") && <p className="text-sm text-destructive">{err("name")}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label id={id("kind-label")}>Jenis</Label>
                    <Select
                      value={rule.kind}
                      options={KIND_OPTIONS}
                      onValueChange={(v) => v && onChange(rule.key, { kind: v as FormRule["kind"] }, index)}
                    >
                      <SelectTrigger aria-labelledby={id("kind-label")} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KIND_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label id={id("type-label")}>Satuan</Label>
                    <Select
                      value={rule.amountType}
                      options={TYPE_OPTIONS}
                      onValueChange={(v) => v && onChange(rule.key, { amountType: v as FormRule["amountType"], amount: 0 }, index)}
                    >
                      <SelectTrigger aria-labelledby={id("type-label")} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={id("amount")}>Nilai</Label>
                    {rule.amountType === "FIXED" ? (
                      <CurrencyInput id={id("amount")} value={rule.amount} onChange={(v) => onChange(rule.key, { amount: v }, index)} placeholder="Rp0" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          id={id("amount")}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={100}
                          value={rule.amount || ""}
                          onChange={(e) => onChange(rule.key, { amount: Number.parseInt(e.target.value, 10) || 0 }, index)}
                          aria-invalid={!!err("amount")}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">% dari total</span>
                      </div>
                    )}
                    {err("amount") && <p className="text-sm text-destructive">{err("amount")}</p>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={id("condition")}>Syarat</Label>
                  <Input
                    id={id("condition")}
                    value={rule.condition}
                    maxLength={200}
                    onChange={(e) => onChange(rule.key, { condition: e.target.value }, index)}
                    placeholder="Misalnya: klien memesan lebih dari 5 desain"
                    aria-invalid={!!err("condition")}
                  />
                  {err("condition") && <p className="text-sm text-destructive">{err("condition")}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={id("note")}>Cara menyampaikan (opsional)</Label>
                  <Textarea
                    id={id("note")}
                    rows={2}
                    value={rule.note}
                    maxLength={300}
                    onChange={(e) => onChange(rule.key, { note: e.target.value }, index)}
                    placeholder="Misalnya: sampaikan sebagai promo dengan kalimat yang menarik"
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Button type="button" variant="outline" disabled={rules.length >= max} onClick={onAdd}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Tambah aturan harga
      </Button>
    </fieldset>
  );
}
