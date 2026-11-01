"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, PlugZap, RotateCcw, Save, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

type WhatsAppSettings = {
  botEnabled: boolean;
  whatsappConfigured: boolean;
  ai: {
    model: string | null;
    extractionModel: string | null;
    baseUrl: string | null;
    defaults: { model: string; extractionModel: string; baseUrl: string } | null;
    effective: { model: string | null; extractionModel: string | null; baseUrl: string | null };
    modelRecognized: boolean;
  };
};

type ConnectionResult = {
  model: string;
  baseUrlHost: string;
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
};

type FormState = { aiModel: string; aiExtractionModel: string; aiBaseUrl: string };
type FieldErrors = Partial<Record<keyof FormState, string>>;

const QUERY_KEY = ["settings", "whatsapp"];

class ApiError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function putSettings(body: Record<string, unknown>): Promise<WhatsAppSettings> {
  const res = await fetch("/api/settings/whatsapp", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Gagal menyimpan", data.fields);
  return data;
}

function toForm(s: WhatsAppSettings): FormState {
  return { aiModel: s.ai.model ?? "", aiExtractionModel: s.ai.extractionModel ?? "", aiBaseUrl: s.ai.baseUrl ?? "" };
}

export function WhatsAppSettingsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<WhatsAppSettings>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/settings/whatsapp");
      if (!res.ok) throw new Error("Gagal memuat pengaturan WhatsApp");
      return res.json();
    },
  });

  const [form, setForm] = useState<FormState>({ aiModel: "", aiExtractionModel: "", aiBaseUrl: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [testResult, setTestResult] = useState<ConnectionResult | null>(null);

  // Isi form saat data pertama kali dimuat / setelah disimpan.
  /* eslint-disable react-hooks/set-state-in-effect -- sinkronisasi form dari data server */
  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saved = data ? toForm(data) : form;
  const dirty =
    form.aiModel.trim() !== saved.aiModel ||
    form.aiExtractionModel.trim() !== saved.aiExtractionModel ||
    form.aiBaseUrl.trim() !== saved.aiBaseUrl;

  const toggleBot = useMutation({
    mutationFn: (botEnabled: boolean) => putSettings({ botEnabled }),
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      toast(next.botEnabled ? "Bot WhatsApp diaktifkan" : "Bot WhatsApp dimatikan", "success");
    },
    onError: () => toast("Gagal mengubah status bot", "error"),
  });

  const saveAi = useMutation({
    mutationFn: () =>
      putSettings({
        aiModel: form.aiModel.trim(),
        aiExtractionModel: form.aiExtractionModel.trim(),
        aiBaseUrl: form.aiBaseUrl.trim(),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      setErrors({});
      setTestResult(null);
      toast("Pengaturan AI disimpan", "success");
    },
    onError: (error) => {
      const fields = error instanceof ApiError ? error.fields : {};
      setErrors(fields as FieldErrors);
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

  if (isLoading) {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <CardTitle>Bot WhatsApp</CardTitle>
          <CardDescription>Memuat pengaturan…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded bg-muted" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bot WhatsApp</CardTitle>
          <CardDescription>Pengaturan tidak bisa dimuat.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  const defaults = data.ai.defaults;
  const update = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
  };

  return (
    <div className="space-y-6">
      {!data.whatsappConfigured && (
        <div role="status" className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Env WhatsApp/AI di server belum lengkap. Bot tidak akan berjalan sampai token WhatsApp,
            <code className="mx-1">ANTHROPIC_API_KEY</code>, dan bucket privat diisi.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bot WhatsApp</CardTitle>
          <CardDescription>
            Asisten AI yang melayani konsultasi dan brief order lewat WhatsApp. Harga, deadline, dan validasi DP
            tetap diputuskan admin di portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label id="wa-bot-enabled-label" htmlFor="wa-bot-enabled">
                Balas otomatis
              </Label>
              <p id="wa-bot-enabled-help" className="text-sm text-muted-foreground">
                {data.botEnabled
                  ? "Aktif. Pesan klien dibalas oleh bot."
                  : "Nonaktif. Pesan tetap tersimpan, tapi tidak dibalas otomatis."}
              </p>
            </div>
            <Switch
              id="wa-bot-enabled"
              // Base UI menaruh id di input tersembunyi; elemen role="switch" butuh nama sendiri.
              aria-labelledby="wa-bot-enabled-label"
              aria-describedby="wa-bot-enabled-help"
              checked={data.botEnabled}
              disabled={toggleBot.isPending}
              onCheckedChange={(checked) => toggleBot.mutate(checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model AI</CardTitle>
          <CardDescription>
            Hanya model Claude. Kosongkan isian untuk memakai default server. API key tetap diatur di env server dan
            tidak pernah ditampilkan di sini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              saveAi.mutate();
            }}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="wa-ai-model">Model chat</Label>
                {data.ai.effective.model && (
                  <Badge variant={data.ai.modelRecognized ? "secondary" : "outline"}>
                    {data.ai.modelRecognized ? "Profil model dikenali" : "Model tidak dikenali: mode aman"}
                  </Badge>
                )}
              </div>
              <Input
                id="wa-ai-model"
                value={form.aiModel}
                onChange={update("aiModel")}
                placeholder={defaults?.model ?? "claude-haiku-5-5"}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!errors.aiModel}
                aria-describedby="wa-ai-model-help"
              />
              <p id="wa-ai-model-help" className={errors.aiModel ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                {errors.aiModel ?? `Dipakai untuk membalas chat. Default server: ${defaults?.model ?? "-"}`}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wa-ai-extraction-model">Model ekstraksi bukti transfer</Label>
              <Input
                id="wa-ai-extraction-model"
                value={form.aiExtractionModel}
                onChange={update("aiExtractionModel")}
                placeholder={defaults?.extractionModel ?? "claude-sonnet-5-5"}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!errors.aiExtractionModel}
                aria-describedby="wa-ai-extraction-help"
              />
              <p
                id="wa-ai-extraction-help"
                className={errors.aiExtractionModel ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
              >
                {errors.aiExtractionModel ?? `Dipakai saat membaca bukti transfer. Default server: ${defaults?.extractionModel ?? "-"}`}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="wa-ai-base-url">Base URL API</Label>
              <Input
                id="wa-ai-base-url"
                type="url"
                inputMode="url"
                value={form.aiBaseUrl}
                onChange={update("aiBaseUrl")}
                placeholder={defaults?.baseUrl ?? "https://api.anthropic.com"}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!errors.aiBaseUrl}
                aria-describedby="wa-ai-base-url-help wa-ai-base-url-warning"
              />
              <p id="wa-ai-base-url-help" className={errors.aiBaseUrl ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                {errors.aiBaseUrl ?? `Endpoint format Anthropic Messages API, harus https. Default server: ${defaults?.baseUrl ?? "-"}`}
              </p>
              <p id="wa-ai-base-url-warning" className="flex gap-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Semua isi chat, gambar, dan bukti transfer klien dikirim ke server ini. Gunakan hanya penyedia yang
                dipercaya, dan pastikan API key di server cocok dengan penyedia ini.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={!dirty || saveAi.isPending}
                onClick={() => {
                  setForm(saved);
                  setErrors({});
                }}
              >
                Batalkan perubahan
              </Button>
              <Button type="submit" disabled={!dirty || saveAi.isPending}>
                {saveAi.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uji koneksi</CardTitle>
          <CardDescription>
            Mengirim dua request kecil (tool use dan gambar) memakai pengaturan yang sudah disimpan. Tidak memakai data
            klien.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => testConnection.mutate()}
              disabled={testConnection.isPending || dirty || !data.whatsappConfigured}
            >
              {testConnection.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlugZap className="h-4 w-4" />
              )}
              {testConnection.isPending ? "Menguji…" : "Uji koneksi"}
            </Button>
            {dirty && <p className="text-sm text-muted-foreground">Simpan perubahan dulu sebelum menguji.</p>}
          </div>

          <div aria-live="polite">
            {testResult && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm break-words">
                  <span className="font-medium">{testResult.ok ? "Koneksi siap dipakai bot." : "Ada pemeriksaan yang gagal."}</span>{" "}
                  <span className="text-muted-foreground">
                    Model <code className="break-all">{testResult.model}</code> di{" "}
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
        </CardContent>
      </Card>
    </div>
  );
}
