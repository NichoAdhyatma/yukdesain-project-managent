"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_PROVIDERS_KEY, AiApiError, USAGE_LABELS, saveUsage, type AiProvidersData, type AiTarget, type AiUsage } from "./api";

// Pilih model untuk Chat, Baca bukti transfer, dan Cadangan; hanya model yang lulus tes yang relevan.

const NONE = "__none";
const USAGES: AiUsage[] = ["chat", "proof", "fallback"];
const HELP: Record<AiUsage, string> = {
  chat: "Bot klien dan perintah owner lewat WhatsApp. Wajib lulus tes Koneksi + Tool use.",
  proof: "Membaca gambar bukti transfer. Wajib lulus tes Koneksi + Tool use + Gambar.",
  fallback: "Dipakai otomatis bila provider Chat gagal (koneksi, kuota, key ditolak). Wajib lulus tes Koneksi + Tool use.",
};

const encode = (t: AiTarget | null) => (t ? `${t.providerKey}|${t.model}` : NONE);
const decode = (v: string): AiTarget | null => {
  if (v === NONE) return null;
  const i = v.indexOf("|");
  return { providerKey: v.slice(0, i), model: v.slice(i + 1) };
};

export function AiUsageCard({ data }: { data: AiProvidersData }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<AiUsage, string>>({
    chat: encode(data.usage.chat),
    proof: encode(data.usage.proof),
    fallback: encode(data.usage.fallback),
  });
  const nameOf = (key: string) => data.providers.find((p) => p.key === key)?.name ?? key;

  const optionsFor = (usage: AiUsage) => {
    const passed = data.providers.flatMap((p) =>
      (data.tests[p.key] ?? []).filter((t) => !t.stale && t.usages.includes(usage)).map((t) => ({ value: `${p.key}|${t.model}`, label: `${p.name} · ${t.model}` })),
    );
    const defaultLabel =
      usage === "fallback" ? "Tanpa cadangan" : `Bawaan server (${nameOf(usage === "chat" ? data.effective.chat.providerKey : data.effective.proof.providerKey)})`;
    const current = form[usage];
    // Pilihan tersimpan yang tidak lagi lulus (mis. key diganti) tetap tampil supaya tidak hilang diam-diam.
    const extra = current !== NONE && !passed.some((o) => o.value === current) ? [{ value: current, label: `${nameOf(decode(current)!.providerKey)} · ${decode(current)!.model}` }] : [];
    return [{ value: NONE, label: defaultLabel }, ...passed, ...extra];
  };

  const needsRetest = (usage: AiUsage) => {
    const current = data.usage[usage];
    if (!current) return false;
    const test = (data.tests[current.providerKey] ?? []).find((t) => t.model === current.model);
    return !test || test.stale || !test.usages.includes(usage);
  };

  const save = useMutation({
    mutationFn: () => saveUsage({ chat: decode(form.chat), proof: decode(form.proof), fallback: decode(form.fallback) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
      toast("Pemakaian model disimpan. Bot langsung memakainya.", "success");
    },
  });
  const fields = save.error instanceof AiApiError ? save.error.fields : {};

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pemakaian model</CardTitle>
        <CardDescription>
          Sedang dipakai bot: <span className="font-mono">{data.effective.chat.model}</span> ({nameOf(data.effective.chat.providerKey)}). Hanya model yang
          lulus tes yang muncul di pilihan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {USAGES.map((usage) => {
            const options = optionsFor(usage);
            const id = `usage-${usage}`;
            return (
              <div key={usage} className="space-y-1.5">
                <Label id={`${id}-label`}>{USAGE_LABELS[usage]}</Label>
                <Select value={form[usage]} options={options} onValueChange={(v) => v && setForm((f) => ({ ...f, [usage]: v }))}>
                  <SelectTrigger
                    aria-labelledby={`${id}-label`}
                    aria-describedby={`${id}-help${fields[usage] ? ` ${id}-error` : ""}`}
                    aria-invalid={!!fields[usage]}
                    className="w-full max-md:h-11 sm:max-w-md"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id={`${id}-help`} className="text-xs text-muted-foreground">
                  {HELP[usage]}
                </p>
                {needsRetest(usage) && (
                  <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Perlu dites ulang: key atau base URL provider berubah sejak tes terakhir. Bot tetap memakainya.
                  </p>
                )}
                {fields[usage] && (
                  <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
                    {fields[usage]}
                  </p>
                )}
              </div>
            );
          })}
          {save.error && !Object.keys(fields).length && (
            <p className="text-sm text-destructive" role="alert">
              {save.error.message}
            </p>
          )}
          <Button type="submit" className="max-md:h-11" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            Simpan pemakaian
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
