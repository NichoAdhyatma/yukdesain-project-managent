"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, PlugZap, Save, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  SettingsApiError,
  WHATSAPP_SETTINGS_KEY,
  putWhatsAppSettings,
  type AiProviderId,
  type WhatsAppSettings,
} from "./settings-api";

// Provider AI (Anthropic resmi / gateway testing) dan model, dipilih dari daftar
// (docs/WHATSAPP_AI_CHATBOT.md §7). API key tetap di env server.

type Models = { model: string; extractionModel: string }; // "" = default server
type FormState = { provider: AiProviderId; models: Record<AiProviderId, Models> };
type ConnectionResult = {
  model: string;
  provider?: string;
  baseUrlHost: string;
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
};

const DEFAULT = "__default";
const ENV_KEY: Record<AiProviderId, string> = { ANTHROPIC: "ANTHROPIC_API_KEY", GATEWAY: "AI_GATEWAY_API_KEY" };

function toForm(s: WhatsAppSettings): FormState {
  const models = Object.fromEntries(
    s.ai.providers.map((p) => [p.id, { model: p.model ?? "", extractionModel: p.extractionModel ?? "" }]),
  ) as Record<AiProviderId, Models>;
  return { provider: s.ai.provider, models };
}

function ModelSelect({
  id,
  label,
  help,
  value,
  defaultModel,
  options,
  onChange,
  error,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  defaultModel: string;
  options: string[];
  onChange: (v: string) => void;
  error?: string;
}) {
  // Model tersimpan yang tidak ada di daftar tetap ditampilkan supaya tidak hilang diam-diam.
  const ids = [...new Set([...options, ...(value ? [value] : [])])];
  const items = [{ value: DEFAULT, label: `Default server (${defaultModel})` }, ...ids.map((m) => ({ value: m, label: m }))];
  return (
    <div className="space-y-2">
      <Label id={`${id}-label`}>{label}</Label>
      <Select value={value || DEFAULT} options={items} onValueChange={(v) => v && onChange(v === DEFAULT ? "" : v)}>
        <SelectTrigger aria-labelledby={`${id}-label`} aria-describedby={`${id}-help`} className="w-full sm:max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={`${id}-help`} className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {error ?? help}
      </p>
    </div>
  );
}

export function AiProviderCard({ data }: { data: WhatsAppSettings }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(data));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<ConnectionResult | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- sinkronisasi form dari data server */
  useEffect(() => {
    setForm(toForm(data));
  }, [data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saved = toForm(data);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const provider = data.ai.providers.find((p) => p.id === form.provider)!;
  const current = form.models[form.provider];

  const modelList = useQuery<{ models: string[]; source: "api" | "fallback" }>({
    queryKey: ["settings", "whatsapp", "models", form.provider],
    queryFn: async () => {
      const res = await fetch(`/api/settings/whatsapp/models?provider=${form.provider}`);
      if (!res.ok) throw new Error("Gagal memuat daftar model");
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const save = useMutation({
    mutationFn: () =>
      putWhatsAppSettings({
        aiProvider: form.provider,
        aiModel: form.models.ANTHROPIC.model,
        aiExtractionModel: form.models.ANTHROPIC.extractionModel,
        aiGatewayModel: form.models.GATEWAY.model,
        aiGatewayExtractionModel: form.models.GATEWAY.extractionModel,
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(WHATSAPP_SETTINGS_KEY, next);
      setErrors({});
      setTestResult(null);
      toast(`AI memakai ${next.ai.effective.label}`, "success");
    },
    onError: (error) => {
      const fields = error instanceof SettingsApiError ? error.fields : {};
      setErrors(fields);
      toast(Object.keys(fields).length ? "Periksa kembali isian yang ditandai" : "Gagal menyimpan pengaturan AI", "error");
    },
  });

  const testConnection = useMutation({
    mutationFn: async (): Promise<ConnectionResult> => {
      const res = await fetch("/api/settings/whatsapp/test", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Uji koneksi gagal dijalankan");
      return body;
    },
    onSuccess: (result) => setTestResult(result),
    onError: (error) => toast((error as Error).message, "error"),
  });

  const setModel = (key: keyof Models) => (value: string) =>
    setForm((f) => ({ ...f, models: { ...f.models, [f.provider]: { ...f.models[f.provider], [key]: value } } }));
  const isGateway = form.provider === "GATEWAY";
  const modelErrorKey = isGateway ? "aiGatewayModel" : "aiModel";
  const extractionErrorKey = isGateway ? "aiGatewayExtractionModel" : "aiExtractionModel";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Model AI</CardTitle>
          <Badge variant={data.ai.provider === "GATEWAY" ? "outline" : "secondary"}>Aktif: {data.ai.effective.label}</Badge>
        </div>
        <CardDescription>
          Pilih penyedia AI dan model Claude yang dipakai bot. API key masing-masing penyedia diatur di env server dan
          tidak pernah ditampilkan di sini. Pilihan model disimpan per penyedia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Penyedia AI</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.ai.providers.map((p) => {
                const checked = form.provider === p.id;
                return (
                  <label
                    key={p.id}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-lg border p-3 text-sm",
                      checked && "border-primary bg-primary/5",
                      !p.configured && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name="ai-provider"
                      value={p.id}
                      checked={checked}
                      disabled={!p.configured || save.isPending}
                      onChange={() => {
                        setForm((f) => ({ ...f, provider: p.id }));
                        setErrors({});
                      }}
                      className="mt-1 h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0 space-y-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 font-medium">
                        {p.label}
                        {p.id === "GATEWAY" && <Badge variant="outline">Testing</Badge>}
                      </span>
                      <span className="block break-all text-muted-foreground">{p.baseUrlHost}</span>
                      <span className={cn("block", p.configured ? "text-muted-foreground" : "text-destructive")}>
                        {p.configured ? "Key terpasang di server" : `Key belum diisi (${ENV_KEY[p.id]})`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.aiProvider && <p className="text-sm text-destructive">{errors.aiProvider}</p>}
          </fieldset>

          {isGateway && (
            <p role="note" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Semua isi chat, gambar, dan bukti transfer klien dikirim ke <strong>{provider.baseUrlHost}</strong>, dan
                modelnya belum tentu Claude resmi. Pakai untuk Uji bot saja; jangan nyalakan Balas otomatis untuk klien
                sungguhan selama gateway aktif.
              </span>
            </p>
          )}

          <ModelSelect
            id="wa-ai-model"
            label="Model chat"
            help="Dipakai untuk membalas chat dan instruksi owner."
            value={current.model}
            defaultModel={provider.defaults.model}
            options={modelList.data?.models ?? []}
            onChange={setModel("model")}
            error={errors[modelErrorKey]}
          />
          <ModelSelect
            id="wa-ai-extraction-model"
            label="Model ekstraksi bukti transfer"
            help="Dipakai saat membaca bukti transfer. Sebaiknya model yang lebih teliti."
            value={current.extractionModel}
            defaultModel={provider.defaults.extractionModel}
            options={modelList.data?.models ?? []}
            onChange={setModel("extractionModel")}
            error={errors[extractionErrorKey]}
          />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {modelList.isLoading
              ? "Memuat daftar model…"
              : modelList.data?.source === "api"
                ? `Daftar model dari ${provider.label}.`
                : "Daftar model cadangan (API penyedia tidak bisa dihubungi atau key belum diisi)."}
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={!dirty || save.isPending}
              onClick={() => {
                setForm(saved);
                setErrors({});
              }}
            >
              Batalkan perubahan
            </Button>
            <Button type="submit" disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan
            </Button>
          </div>
        </form>

        <Separator />

        <section aria-labelledby="wa-ai-test-title" className="space-y-3">
          <div className="space-y-1">
            <h3 id="wa-ai-test-title" className="text-sm font-medium">
              Uji koneksi
            </h3>
            <p className="text-sm text-muted-foreground">
              Mengirim beberapa request kecil (tool use, gambar, dan model ekstraksi jika berbeda) memakai pengaturan
              yang sudah disimpan. Tidak memakai data klien.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => testConnection.mutate()} disabled={testConnection.isPending || dirty || !data.aiConfigured}>
              {testConnection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              {testConnection.isPending ? "Menguji…" : "Uji koneksi"}
            </Button>
            {dirty && <p className="text-sm text-muted-foreground">Simpan perubahan dulu sebelum menguji.</p>}
          </div>

          <div aria-live="polite">
            {testResult && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="break-words text-sm">
                  <span className="font-medium">{testResult.ok ? "Koneksi siap dipakai bot." : "Ada pemeriksaan yang gagal."}</span>{" "}
                  <span className="text-muted-foreground">
                    {testResult.provider && `${testResult.provider} · `}Model <code className="break-all">{testResult.model}</code> di{" "}
                    <code className="break-all">{testResult.baseUrlHost}</code>
                  </span>
                </p>
                <ul className="space-y-2">
                  {testResult.checks.map((check) => (
                    <li key={check.name} className="flex gap-2 text-sm">
                      {check.ok ? (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                      )}
                      <span>
                        <span className="font-medium">
                          {check.name}: {check.ok ? "berhasil" : "gagal"}
                        </span>
                        <span className="block break-all text-muted-foreground">{check.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
