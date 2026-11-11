"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BRIEF_FIELD_LABELS } from "./field-labels";
import type { BriefResponses } from "./types";

// Isian teks generik untuk layanan tanpa bagian form khusus (SVC-12..15) dan isian paket/jumlah
// yang ditambahkan ke layanan lama (spec 2026-11-11-kb-merge-design §4.4).

type Key = keyof BriefResponses;

export const COUNT_KEYS: readonly Key[] = ["page_count", "variant_count", "pose_count"];
const LONG_TEXT_KEYS: readonly Key[] = ["business_desc", "main_text", "mandatory_info", "sticker_text"];

const PLACEHOLDERS: Partial<Record<Key, string>> = {
  brand_name: "Contoh: Kedai Kopi Nusantara",
  package_choice: "Tulis nama paket yang dipilih",
  page_count: "Contoh: 6",
  variant_count: "Contoh: 3",
  pose_count: "Contoh: 2",
  size: "Contoh: A5 (14.8 x 21 cm)",
  style: "Contoh: minimalis hangat, warna earth tone",
  sosmed_platform: "Contoh: Instagram dan TikTok",
  sosmed_vibe: "Contoh: santai, playful, banyak foto produk",
  dimensions: "Contoh: box 20 x 20 x 10 cm, sticker diameter 6 cm",
  sticker_text: "Teks yang tampil di sticker",
  mandatory_info: "Contoh: komposisi, PIRT/BPOM, tanggal kedaluwarsa",
  business_desc: "Ceritakan singkat usaha dan target pelanggan Anda",
  main_text: "Teks utama yang ingin ditampilkan",
};

/** Kunci isian teks/angka (bukan daftar *_json atau URL) yang dirender generik. */
export function genericTextKeys(keys: Key[]): Key[] {
  return keys.filter((k) => !k.endsWith("_json") && !k.endsWith("_url"));
}

type Props = {
  keys: Key[];
  required: ReadonlySet<Key>;
  values: BriefResponses;
  onChange: (key: Key, value: string) => void;
  disabled?: boolean;
};

export function GenericBriefFields({ keys, required, values, onChange, disabled }: Props) {
  return (
    <>
      {keys.map((key) => {
        const isRequired = required.has(key);
        const isCount = COUNT_KEYS.includes(key);
        const value = values[key] === undefined ? "" : String(values[key]);
        const common = {
          id: key,
          value,
          placeholder: PLACEHOLDERS[key],
          required: isRequired,
          disabled,
        };
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>
              {BRIEF_FIELD_LABELS[key] ?? key}{" "}
              {isRequired ? <span className="text-destructive">*</span> : <span className="font-normal text-muted-foreground">(opsional)</span>}
            </Label>
            {LONG_TEXT_KEYS.includes(key) ? (
              <Textarea {...common} onChange={(e) => onChange(key, e.target.value)} />
            ) : (
              <Input
                {...common}
                inputMode={isCount ? "numeric" : undefined}
                pattern={isCount ? "[0-9]*" : undefined}
                onChange={(e) => onChange(key, isCount ? e.target.value.replace(/\D/g, "") : e.target.value)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
