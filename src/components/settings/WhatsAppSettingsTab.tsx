"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { OwnerNumberCard } from "./whatsapp/OwnerNumberCard";
import { ChannelCard } from "./whatsapp/ChannelCard";
import {
  SettingsApiError,
  WHATSAPP_SETTINGS_KEY,
  fetchWhatsAppSettings,
  putWhatsAppSettings,
  type WhatsAppSettings,
  type WhatsAppUsage,
} from "./whatsapp/settings-api";

export type { WhatsAppUsage } from "./whatsapp/settings-api";

const formatMonth = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

/** Banner saat pesan keluar mendekati kuota gratis Meta (§5.3, §17). Dipakai juga di Order WA. */
export function UsageWarning({ usage }: { usage: WhatsAppUsage }) {
  if (usage.brakeActive) {
    // Rem bulanan aktif (docs/WHATSAPP_SPAM_GUARD.md §3): bot berhenti membalas otomatis.
    return (
      <div role="alert" className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Rem bulanan aktif: {usage.botReplies.toLocaleString("id-ID")} dari {usage.monthlyReplyCap.toLocaleString("id-ID")}{" "}
          balasan bot {formatMonth(usage.month)} sudah terpakai. Bot berhenti membalas otomatis sampai awal bulan depan;
          pesan klien tetap masuk di Order WA dan bisa dibalas admin. Batas bisa dinaikkan di Settings › WhatsApp ›
          Pemakaian.
        </p>
      </div>
    );
  }
  if (!usage.nearLimit) return null;
  return (
    <div role="status" className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        Pesan keluar {formatMonth(usage.month)} sudah {usage.outboundSent.toLocaleString("id-ID")} dari kuota gratis{" "}
        {usage.freeTier.toLocaleString("id-ID")}. Pastikan metode pembayaran di akun Meta aktif; tanpa itu, pesan di atas
        kuota tidak terkirim.
      </p>
    </div>
  );
}

function UsageCard({ usage }: { usage: WhatsAppUsage }) {
  const pct = Math.min(100, Math.round((usage.outboundSent / usage.freeTier) * 100));
  const rows: [string, number][] = [
    ["Balasan bot", usage.botReplies],
    ["Lewat template", usage.templatesSent],
    ["Gagal terkirim", usage.outboundFailed],
    ["Pesan masuk", usage.inbound],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pemakaian {formatMonth(usage.month)}</CardTitle>
        <CardDescription>
          Meta memberi {usage.freeTier.toLocaleString("id-ID")} pesan layanan gratis per bulan; pesan template selalu
          berbayar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span id="wa-usage-label">Pesan keluar terkirim</span>
            <span className="tabular-nums">
              <span className="font-semibold">{usage.outboundSent.toLocaleString("id-ID")}</span>
              <span className="text-muted-foreground"> / {usage.freeTier.toLocaleString("id-ID")}</span>
            </span>
          </div>
          <div
            role="meter"
            aria-labelledby="wa-usage-label"
            aria-valuemin={0}
            aria-valuemax={usage.freeTier}
            aria-valuenow={usage.outboundSent}
            className="h-2 overflow-hidden rounded-full bg-muted"
          >
            <div
              className={usage.nearLimit ? "h-full bg-amber-500" : "h-full bg-primary"}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value.toLocaleString("id-ID")}</dd>
            </div>
          ))}
        </dl>
        <MonthlyBrakeSetting usage={usage} />
      </CardContent>
    </Card>
  );
}

/** Batas balasan bot per bulan (docs/WHATSAPP_SPAM_GUARD.md §3). */
function MonthlyBrakeSetting({ usage }: { usage: WhatsAppUsage }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(usage.monthlyReplyCap));
  const [error, setError] = useState<string | null>(null);
  const parsed = Number(value);
  const dirty = value.trim() !== "" && parsed !== usage.monthlyReplyCap;
  const save = useMutation({
    mutationFn: () => putWhatsAppSettings({ monthlyReplyCap: parsed }),
    onSuccess: (next) => {
      queryClient.setQueryData(WHATSAPP_SETTINGS_KEY, next);
      setError(null);
      toast(`Rem bulanan diatur ke ${parsed.toLocaleString("id-ID")} balasan bot`, "success");
    },
    onError: (e) => {
      const message = e instanceof SettingsApiError ? (e.fields.monthlyReplyCap ?? e.message) : "Gagal menyimpan batas";
      setError(message);
    },
  });
  const remaining = Math.max(0, usage.monthlyReplyCap - usage.botReplies);
  return (
    <form
      className="space-y-2 border-t pt-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!Number.isInteger(parsed) || parsed < 50) {
          setError("Isi bilangan bulat minimal 50");
          return;
        }
        save.mutate();
      }}
    >
      <Label htmlFor="wa-monthly-cap">Rem bulanan: batas balasan bot per bulan</Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id="wa-monthly-cap"
          type="number"
          inputMode="numeric"
          min={50}
          step={50}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          className="sm:w-40"
          aria-invalid={!!error}
          aria-describedby="wa-monthly-cap-help"
        />
        <Button type="submit" variant="outline" disabled={!dirty || save.isPending} className="max-md:h-11">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Simpan batas
        </Button>
      </div>
      <p id="wa-monthly-cap-help" className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {error ??
          (usage.brakeActive
            ? "Batas tercapai: bot berhenti membalas otomatis sampai awal bulan depan. Naikkan batas untuk menyalakan lagi."
            : `Sisa ${remaining.toLocaleString("id-ID")} balasan bulan ini. Jika habis, bot berhenti membalas otomatis dan klien diarahkan ke admin.`)}
      </p>
    </form>
  );
}

export function WhatsAppSettingsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<WhatsAppSettings>({
    queryKey: WHATSAPP_SETTINGS_KEY,
    queryFn: fetchWhatsAppSettings,
  });

  const toggleBot = useMutation({
    mutationFn: (botEnabled: boolean) => putWhatsAppSettings({ botEnabled }),
    onSuccess: (next) => {
      queryClient.setQueryData(WHATSAPP_SETTINGS_KEY, next);
      toast(next.botEnabled ? "Bot WhatsApp diaktifkan" : "Bot WhatsApp dimatikan", "success");
    },
    onError: () => toast("Gagal mengubah status bot", "error"),
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

  return (
    <div className="space-y-6">
      {!data.whatsappConfigured && (
        <div role="status" className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            Saluran WhatsApp yang aktif belum siap: env di server belum lengkap, jadi bot belum menerima pesan.
            {data.aiConfigured
              ? " Uji bot dan uji koneksi AI di menu Bot AI sudah bisa dipakai."
              : " API key penyedia AI yang dipilih juga belum diisi."}
          </p>
        </div>
      )}

      <UsageWarning usage={data.usage} />

      <Card>
        <CardHeader>
          <CardTitle>Bot WhatsApp</CardTitle>
          <CardDescription>
            Asisten AI yang melayani konsultasi dan brief order lewat WhatsApp. Harga, deadline, dan validasi DP
            tetap diputuskan admin di portal. Pengetahuan, panduan, uji coba, dan model AI bot diatur di menu{" "}
            <Link href="/bot" className="font-medium text-foreground underline underline-offset-2">
              Bot AI
            </Link>
            .
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
          {data.ai.provider === "GATEWAY" && (
            <p role="note" className="mt-3 flex gap-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                AI sedang memakai {data.ai.effective.label} (testing). Chat klien sungguhan akan dikirim ke gateway ini;
                pindah ke Anthropic resmi di{" "}
                <Link href="/bot?tab=model" className="font-medium underline underline-offset-2">
                  Bot AI › Model AI
                </Link>{" "}
                sebelum menyalakan balas otomatis untuk klien.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <ChannelCard data={data} />

      <OwnerNumberCard />

      <UsageCard usage={data.usage} />
    </div>
  );
}
