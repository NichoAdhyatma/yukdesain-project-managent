"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Link2, Loader2, QrCode, RotateCcw, Save, Unplug } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { SettingsApiError, WHATSAPP_SETTINGS_KEY, putWhatsAppSettings, type WaChannelId, type WhatsAppSettings } from "./settings-api";

// Saluran WhatsApp: Meta Cloud API (resmi) atau Fonnte (scan QR, testing) — docs/WHATSAPP_CHANNEL_FONNTE.md.

type FonnteStatus =
  | { configured: false }
  | {
      configured: true;
      connected: boolean;
      device: string | null;
      deviceMasked: string | null;
      name: string | null;
      package: string | null;
      quota: string | null;
      expired: string | null;
      webhookInstalled: boolean;
    };

const FONNTE_KEY = ["settings", "whatsapp", "fonnte"];
const ENV_HINT: Record<WaChannelId, string> = {
  META: "token, Phone Number ID, App Secret, verify token, bucket privat",
  FONNTE: "FONNTE_DEVICE_TOKEN, FONNTE_WEBHOOK_SECRET, bucket privat",
};

async function fonnteAction(action: "qr" | "disconnect" | "install-webhook") {
  const res = await fetch("/api/settings/whatsapp/fonnte", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? "Permintaan ke Fonnte gagal");
  return body;
}

function FonntePanel() {
  const queryClient = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const status = useQuery<FonnteStatus>({
    queryKey: FONNTE_KEY,
    queryFn: async () => {
      const res = await fetch("/api/settings/whatsapp/fonnte");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Status Fonnte tidak bisa dimuat");
      return body;
    },
    // Selama QR tampil, cek status tiap 5 detik supaya langsung tahu saat nomor tersambung.
    refetchInterval: qr ? 5000 : false,
  });
  const connected = status.data?.configured === true && status.data.connected;

  const showQr = useMutation({
    mutationFn: () => fonnteAction("qr") as Promise<{ qrPngBase64: string | null; alreadyConnected: boolean }>,
    onSuccess: (r) => {
      if (r.alreadyConnected) {
        setQr(null);
        queryClient.invalidateQueries({ queryKey: FONNTE_KEY });
        toast("Nomor sudah terhubung", "success");
      } else setQr(r.qrPngBase64);
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  // QR WhatsApp kedaluwarsa dalam hitungan detik: minta yang baru selama belum terhubung.
  useEffect(() => {
    if (!qr || connected) return;
    const timer = setInterval(() => showQr.mutate(), 20_000);
    return () => clearInterval(timer);
    // showQr stabil per render; cukup bergantung pada qr & connected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr, connected]);

  /* eslint-disable react-hooks/set-state-in-effect -- tutup QR saat nomor sudah tersambung */
  useEffect(() => {
    if (connected && qr) {
      setQr(null);
      toast("Nomor terhubung. Pasang webhook supaya pesan masuk diteruskan ke bot.", "success");
    }
  }, [connected, qr]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const install = useMutation({
    mutationFn: () => fonnteAction("install-webhook") as Promise<FonnteStatus>,
    onSuccess: (next) => {
      queryClient.setQueryData(FONNTE_KEY, next);
      toast("Webhook terpasang. Pesan ke nomor ini sekarang diteruskan ke bot.", "success");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const disconnect = useMutation({
    mutationFn: () => fonnteAction("disconnect") as Promise<FonnteStatus>,
    onSuccess: (next) => {
      queryClient.setQueryData(FONNTE_KEY, next);
      setConfirmDisconnect(false);
      toast("Nomor diputuskan dari Fonnte", "success");
    },
    onError: (e) => {
      setConfirmDisconnect(false);
      toast((e as Error).message, "error");
    },
  });

  if (status.isLoading) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" aria-busy="true" />;
  }
  if (status.isError || !status.data) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive">{(status.error as Error)?.message ?? "Status Fonnte tidak bisa dimuat."}</p>
        <Button variant="outline" size="sm" onClick={() => status.refetch()} disabled={status.isRefetching}>
          <RotateCcw className="h-4 w-4" />
          Coba lagi
        </Button>
      </div>
    );
  }
  if (!status.data.configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Isi <code>FONNTE_DEVICE_TOKEN</code> dan <code>FONNTE_WEBHOOK_SECRET</code> di env server dulu, lalu restart.
      </p>
    );
  }

  const s = status.data;
  const busy = showQr.isPending || install.isPending || disconnect.isPending;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge variant={s.connected ? "secondary" : "outline"}>{s.connected ? "Terhubung" : "Belum terhubung"}</Badge>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Nomor</dt>
          <dd className="tabular-nums">{s.deviceMasked ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Paket</dt>
          <dd>{s.package ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Kuota / aktif s.d.</dt>
          <dd className="tabular-nums">
            {s.quota ?? "-"} · {s.expired ?? "-"}
          </dd>
        </div>
      </dl>

      {s.connected && (
        <p className={cn("flex gap-2 text-sm", s.webhookInstalled ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300")}>
          {s.webhookInstalled ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          {s.webhookInstalled
            ? "Webhook terpasang: pesan ke nomor ini diteruskan ke bot."
            : "Webhook belum terpasang: pesan ke nomor ini belum sampai ke bot."}
        </p>
      )}

      {qr && !s.connected && (
        <div className="flex flex-col items-center gap-3 rounded-lg border p-4 text-center sm:flex-row sm:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL dari Fonnte, tidak lewat optimizer */}
          <img src={`data:image/png;base64,${qr}`} alt="QR untuk menghubungkan nomor WhatsApp ke Fonnte" className="h-48 w-48 rounded bg-white p-2" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">Scan dari HP nomor yang akan dipakai bot</p>
            <p className="text-muted-foreground">
              WhatsApp › Perangkat tertaut › Tautkan perangkat. QR diperbarui otomatis; halaman ini mendeteksi saat nomor
              sudah tersambung.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!s.connected && (
          <Button type="button" variant="outline" onClick={() => showQr.mutate()} disabled={busy}>
            {showQr.isPending && !qr ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" aria-hidden="true" />}
            {qr ? "Perbarui QR" : "Tampilkan QR"}
          </Button>
        )}
        {s.connected && (
          <Button type="button" variant={s.webhookInstalled ? "outline" : "default"} onClick={() => install.mutate()} disabled={busy}>
            {install.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
            {s.webhookInstalled ? "Pasang ulang webhook" : "Pasang webhook"}
          </Button>
        )}
        {s.connected && (
          <Button type="button" variant="outline" onClick={() => setConfirmDisconnect(true)} disabled={busy}>
            <Unplug className="h-4 w-4" aria-hidden="true" />
            Putuskan nomor
          </Button>
        )}
      </div>

      <Dialog open={confirmDisconnect} onOpenChange={(o) => !disconnect.isPending && setConfirmDisconnect(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Putuskan nomor {s.deviceMasked}?</DialogTitle>
            <DialogDescription>
              Bot berhenti menerima dan membalas pesan lewat nomor ini. Untuk memakai nomor lain, tampilkan QR lagi lalu
              scan dari HP nomor tersebut, kemudian pasang webhook.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDisconnect(false)} disabled={disconnect.isPending}>
              Batal
            </Button>
            <Button variant="destructive" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
              {disconnect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Putuskan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ChannelCard({ data }: { data: WhatsAppSettings }) {
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<WaChannelId>(data.channel.active);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- sinkronisasi pilihan dari data server */
  useEffect(() => {
    setChannel(data.channel.active);
  }, [data.channel.active]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useMutation({
    mutationFn: () => putWhatsAppSettings({ channel }),
    onSuccess: (next) => {
      queryClient.setQueryData(WHATSAPP_SETTINGS_KEY, next);
      setError(null);
      toast(`Saluran WhatsApp: ${next.channel.options.find((o) => o.id === next.channel.active)?.label}`, "success");
    },
    onError: (e) => {
      const fields = e instanceof SettingsApiError ? e.fields : {};
      setError(fields.channel ?? "Gagal menyimpan saluran");
    },
  });

  const dirty = channel !== data.channel.active;
  const activeLabel = data.channel.options.find((o) => o.id === data.channel.active)?.label;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Saluran WhatsApp</CardTitle>
          <Badge variant={data.channel.active === "FONNTE" ? "outline" : "secondary"}>Aktif: {activeLabel}</Badge>
        </div>
        <CardDescription>
          Jalur kirim dan terima pesan bot. Fonnte dipakai sementara untuk testing selama nomor di Meta belum disetujui;
          semua fitur bot tetap sama.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Saluran</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.channel.options.map((o) => (
              <label
                key={o.id}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 text-sm",
                  channel === o.id && "border-primary bg-primary/5",
                  !o.configured && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="wa-channel"
                  value={o.id}
                  checked={channel === o.id}
                  disabled={!o.configured || save.isPending}
                  onChange={() => {
                    setChannel(o.id);
                    setError(null);
                  }}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-medium">{o.label}</span>
                  <span className={cn("block", o.configured ? "text-muted-foreground" : "text-destructive")}>
                    {o.configured ? "Siap dipakai" : `Env belum lengkap (${ENV_HINT[o.id]})`}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </fieldset>

        {channel === "FONNTE" && (
          <p role="note" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Fonnte bukan jalur resmi Meta: nomor yang dihubungkan bisa diblokir WhatsApp, dan isi chat lewat server Fonnte.
              Pakai nomor khusus testing. Tanpa template dan aturan 24 jam; foto masuk hanya di paket Fonnte yang
              menyertakan lampiran.
            </span>
          </p>
        )}

        {dirty && (
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan saluran
            </Button>
          </div>
        )}

        {(channel === "FONNTE" || data.channel.active === "FONNTE") && (
          <>
            <Separator />
            <section aria-labelledby="wa-fonnte-title" className="space-y-3">
              <h3 id="wa-fonnte-title" className="text-sm font-medium">
                Perangkat Fonnte
              </h3>
              <FonntePanel />
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
