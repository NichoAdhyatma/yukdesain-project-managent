"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { SERVICE_BOT_LIMITS as LIMITS } from "@/lib/constants";

// Form layanan untuk tambah dan edit (docs/SERVICES_CATALOG.md). Bagian "Untuk bot WhatsApp" dibaca bot:
// harga mulai boleh disebut ke klien, catatan untuk bot tidak.

export type ServiceFormValues = {
  name: string;
  description: string;
  outputFormat: string;
  startingPrice: number | null;
  priceNote: string;
  suitableFor: string;
  botNotes: string;
};

export const EMPTY_SERVICE_FORM: ServiceFormValues = {
  name: "",
  description: "",
  outputFormat: "",
  startingPrice: null,
  priceNote: "",
  suitableFor: "",
  botNotes: "",
};

type Props = {
  idPrefix: string;
  values: ServiceFormValues;
  onChange: (values: ServiceFormValues) => void;
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

function Counter({ id, length, max }: { id: string; length: number; max: number }) {
  return (
    <span id={id} className={`text-xs tabular-nums ${length > max ? "text-destructive" : "text-muted-foreground"}`}>
      {length}/{max}
    </span>
  );
}

export function ServiceForm({ idPrefix, values, onChange, errors }: Props) {
  const set = <K extends keyof ServiceFormValues>(key: K, value: ServiceFormValues[K]) => onChange({ ...values, [key]: value });
  const id = (name: string) => `${idPrefix}-${name}`;

  const textField = (
    key: "priceNote" | "suitableFor" | "botNotes",
    label: string,
    max: number,
    helper: string,
    multiline: boolean,
    placeholder: string,
  ) => {
    const describedBy = `${id(key)}-help ${id(key)}-count${errors[key] ? ` ${id(key)}-error` : ""}`;
    const common = {
      id: id(key),
      value: values[key],
      placeholder,
      "aria-describedby": describedBy,
      "aria-invalid": !!errors[key] || values[key].length > max,
    };
    return (
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={id(key)}>
            {label} <span className="font-normal text-muted-foreground">(opsional)</span>
          </Label>
          <Counter id={`${id(key)}-count`} length={values[key].length} max={max} />
        </div>
        {multiline ? (
          <Textarea {...common} rows={3} onChange={(e) => set(key, e.target.value)} />
        ) : (
          <Input {...common} className="max-md:h-11" onChange={(e) => set(key, e.target.value)} />
        )}
        <p id={`${id(key)}-help`} className="text-xs text-muted-foreground">
          {helper}
        </p>
        <FieldError id={`${id(key)}-error`} message={errors[key]} />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={id("name")}>Nama layanan</Label>
        <Input
          id={id("name")}
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Contoh: Logo Minimalis"
          className="max-md:h-11"
          required
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? id("name-error") : undefined}
        />
        <FieldError id={id("name-error")} message={errors.name} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("description")}>
          Deskripsi <span className="font-normal text-muted-foreground">(opsional)</span>
        </Label>
        <Input
          id={id("description")}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          className="max-md:h-11"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("outputFormat")}>
          Format file hasil <span className="font-normal text-muted-foreground">(opsional)</span>
        </Label>
        <Input
          id={id("outputFormat")}
          value={values.outputFormat}
          onChange={(e) => set("outputFormat", e.target.value)}
          placeholder="Contoh: AI, PNG, SVG"
          className="max-md:h-11"
        />
      </div>

      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Untuk bot WhatsApp</legend>
        <p className="-mt-2 text-xs text-muted-foreground">
          Bot membaca bagian ini saat melayani klien. Harga final tetap kamu isi di Order WA setelah brief lengkap.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor={id("startingPrice")}>
            Harga mulai <span className="font-normal text-muted-foreground">(opsional)</span>
          </Label>
          <CurrencyInput
            id={id("startingPrice")}
            value={values.startingPrice ?? undefined}
            onChange={(n) => set("startingPrice", n > 0 ? n : null)}
            placeholder="Contoh: 150000"
            className="max-md:h-11"
            aria-describedby={`${id("startingPrice")}-help${errors.startingPrice ? ` ${id("startingPrice")}-error` : ""}`}
            aria-invalid={!!errors.startingPrice}
          />
          <p id={`${id("startingPrice")}-help`} className="text-xs text-muted-foreground">
            Bot menyebutnya sebagai &quot;mulai Rp…&quot;. Kosongkan jika bot tidak boleh menyebut harga layanan ini.
          </p>
          <FieldError id={`${id("startingPrice")}-error`} message={errors.startingPrice} />
        </div>

        {textField(
          "priceNote",
          "Catatan harga",
          LIMITS.priceNoteMaxChars,
          "Ikut disebut bot bersama harga mulai.",
          false,
          "Contoh: ukuran A3 mulai Rp200.000",
        )}
        {textField(
          "suitableFor",
          "Cocok untuk",
          LIMITS.suitableForMaxChars,
          "Dipakai bot saat klien bingung memilih layanan.",
          true,
          "Contoh: brand yang ingin terlihat modern dan mudah dipakai di kemasan kecil",
        )}
        {textField(
          "botNotes",
          "Catatan untuk bot",
          LIMITS.botNotesMaxChars,
          "Hanya untuk bot, tidak dikutip ke klien.",
          true,
          "Contoh: tanyakan dulu logo akan sering dipakai di mana",
        )}
      </fieldset>
    </div>
  );
}
