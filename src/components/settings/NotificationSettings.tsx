"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, BellRing, Loader2, RotateCcw, Send, Smartphone } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

// Notifikasi web push untuk owner (docs/OWNER_NOTIFICATIONS_INBOX.md §2). Gratis; tidak memakai kuota pesan WhatsApp.

type NotifyConfig = {
  configured: boolean;
  publicKey: string | null;
  devices: number;
  events: { id: string; label: string; description: string; enabled: boolean }[];
};

const CONFIG_KEY = ["notifications", "config"];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? "Permintaan gagal");
  return body as T;
}

/** Kunci VAPID (base64url) → Uint8Array untuk PushManager.subscribe. */
function vapidKeyToBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = (key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type DeviceState =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "ios-install" }
  | { kind: "blocked" }
  | { kind: "off" }
  | { kind: "on"; endpoint: string };

function isIosNotInstalled(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone === true);
  return ios && !standalone;
}

async function readDeviceState(): Promise<DeviceState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIosNotInstalled() ? { kind: "ios-install" } : { kind: "unsupported" };
  }
  if (Notification.permission === "denied") return { kind: "blocked" };
  const registration = await navigator.serviceWorker.getRegistration("/");
  const sub = await registration?.pushManager.getSubscription();
  return sub ? { kind: "on", endpoint: sub.endpoint } : { kind: "off" };
}

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<NotifyConfig>({
    queryKey: CONFIG_KEY,
    queryFn: () => api<NotifyConfig>("/api/notifications"),
  });
  const [device, setDevice] = useState<DeviceState>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;
    readDeviceState()
      .then((state) => !cancelled && setDevice(state))
      .catch(() => !cancelled && setDevice({ kind: "unsupported" }));
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useMutation({
    mutationFn: async () => {
      if (!data?.publicKey) throw new Error("Kunci notifikasi belum diisi di server");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(permission === "denied" ? "Izin notifikasi ditolak di browser" : "Izin notifikasi belum diberikan");
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const sub =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(data.publicKey) }));
      await api("/api/notifications/subscription", { method: "POST", body: JSON.stringify(sub.toJSON()) });
      return sub.endpoint;
    },
    onSuccess: (endpoint) => {
      setDevice({ kind: "on", endpoint });
      queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
      toast("Notifikasi aktif di perangkat ini", "success");
    },
    onError: (e) => {
      if (Notification.permission === "denied") setDevice({ kind: "blocked" });
      toast(e.message || "Gagal mengaktifkan notifikasi", "error");
    },
  });

  const disable = useMutation({
    mutationFn: async () => {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await api("/api/notifications/subscription", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
    },
    onSuccess: () => {
      setDevice({ kind: "off" });
      queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
      toast("Notifikasi dimatikan di perangkat ini", "success");
    },
    onError: (e) => toast(e.message || "Gagal mematikan notifikasi", "error"),
  });

  const test = useMutation({
    mutationFn: () => api<{ sent: number }>("/api/notifications/test", { method: "POST" }),
    onSuccess: ({ sent }) =>
      toast(sent > 0 ? `Notifikasi uji dikirim ke ${sent} perangkat` : "Belum ada perangkat yang aktif", sent > 0 ? "success" : "error"),
    onError: (e) => toast(e.message || "Gagal mengirim notifikasi uji", "error"),
  });

  const prefs = useMutation({
    mutationFn: (disabled: string[]) => api<NotifyConfig>("/api/notifications", { method: "PUT", body: JSON.stringify({ disabled }) }),
    onSuccess: (next) => queryClient.setQueryData(CONFIG_KEY, next),
    onError: (e) => toast(e.message || "Gagal menyimpan pengaturan", "error"),
  });

  const header = (
    <CardHeader>
      <CardTitle>Notifikasi</CardTitle>
      <CardDescription>
        Pemberitahuan di HP atau laptop saat ada yang perlu ditangani di Order WA, walaupun portal tidak sedang dibuka.
        Gratis dan tidak memakai kuota pesan WhatsApp. Aktifkan di setiap perangkat yang ingin menerima.
      </CardDescription>
    </CardHeader>
  );

  if (isLoading) {
    return (
      <Card aria-busy="true">
        {header}
        <CardContent className="space-y-3">
          <div className="h-10 w-48 animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        {header}
        <CardContent className="space-y-3">
          <p className="text-sm text-destructive">Pengaturan notifikasi tidak bisa dimuat.</p>
          <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  const busy = enable.isPending || disable.isPending;

  return (
    <Card>
      {header}
      <CardContent className="space-y-6">
        <section aria-labelledby="notify-device-title" className="space-y-3">
          <h3 id="notify-device-title" className="flex items-center gap-2 text-sm font-medium">
            <Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Perangkat ini
          </h3>

          {!data.configured ? (
            <p className="text-sm text-muted-foreground">
              Server belum disiapkan untuk notifikasi (kunci VAPID belum diisi). Hubungi pengelola server.
            </p>
          ) : device.kind === "checking" ? (
            <div className="h-10 w-48 animate-pulse rounded bg-muted" />
          ) : device.kind === "ios-install" ? (
            <div className="space-y-1 text-sm">
              <p>Di iPhone/iPad, notifikasi hanya bisa dari portal yang dipasang di Layar Utama:</p>
              <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
                <li>Buka portal ini di Safari.</li>
                <li>Ketuk tombol Bagikan, lalu pilih Tambah ke Layar Utama.</li>
                <li>Buka portal dari ikon di Layar Utama, lalu kembali ke halaman ini.</li>
              </ol>
            </div>
          ) : device.kind === "unsupported" ? (
            <p className="text-sm text-muted-foreground">
              Browser ini tidak mendukung notifikasi. Coba Chrome, Edge, Firefox, atau Safari versi terbaru.
            </p>
          ) : device.kind === "blocked" ? (
            <p className="text-sm text-destructive">
              Notifikasi diblokir di pengaturan browser untuk situs ini. Izinkan notifikasi dari ikon gembok di bilah
              alamat, lalu muat ulang halaman.
            </p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {device.kind === "on" ? (
                <>
                  <p className="flex items-center gap-2 text-sm">
                    <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
                    Aktif di perangkat ini
                  </p>
                  <Button variant="outline" className="max-md:h-11" disabled={test.isPending} onClick={() => test.mutate()}>
                    {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                    Kirim notifikasi uji
                  </Button>
                  <Button variant="ghost" className="max-md:h-11" disabled={busy} onClick={() => disable.mutate()}>
                    {disable.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" aria-hidden="true" />}
                    Matikan di perangkat ini
                  </Button>
                </>
              ) : (
                <Button className="max-md:h-11" disabled={busy} onClick={() => enable.mutate()}>
                  {enable.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
                  Aktifkan di perangkat ini
                </Button>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {data.devices > 0
              ? `${data.devices} perangkat Anda menerima notifikasi.`
              : "Belum ada perangkat Anda yang menerima notifikasi."}
          </p>
        </section>

        <Separator />

        <section aria-labelledby="notify-events-title" className="space-y-4">
          <h3 id="notify-events-title" className="text-sm font-medium">
            Kirim notifikasi saat
          </h3>
          {data.events.map((event) => {
            const id = `notify-${event.id}`;
            return (
              <div key={event.id} className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label id={`${id}-label`} htmlFor={id}>
                    {event.label}
                  </Label>
                  <p id={`${id}-help`} className="text-sm text-muted-foreground">
                    {event.description}
                  </p>
                </div>
                <Switch
                  id={id}
                  aria-labelledby={`${id}-label`}
                  aria-describedby={`${id}-help`}
                  checked={event.enabled}
                  disabled={prefs.isPending}
                  onCheckedChange={(checked) =>
                    prefs.mutate(
                      data.events.filter((e) => (e.id === event.id ? !checked : !e.enabled)).map((e) => e.id),
                    )
                  }
                />
              </div>
            );
          })}
          <p className="text-sm text-muted-foreground">
            Tidak dikirim untuk Uji bot, order tes owner (#klien), dan nomor yang diblokir.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
