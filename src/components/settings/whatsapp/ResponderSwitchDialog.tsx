"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { WHATSAPP_SETTINGS_KEY } from "./settings-api";

// Ganti penjawab chat klien: bot portal atau Agen AI Kirimi (docs/WHATSAPP_CHANNEL_KIRIMI.md "Ganti penjawab").

type KirimiAi = "off" | "on" | "unknown" | "not_kirimi";
type HumanChat = { id: string; name: string | null; phone: string; lastInboundAt: string | null; preview: string | null; onlyPhoneReplies: boolean };
type Status = {
  botEnabled: boolean;
  channel: string;
  kirimiAi: KirimiAi;
  publishedVersion: number | null;
  draftDiffers: boolean;
  humanChats: HumanChat[];
};

const STATUS_KEY = ["settings", "whatsapp", "responder"];
const KIRIMI_DASHBOARD = "https://dash.kirimi.id";

async function fetchStatus(): Promise<Status> {
  const res = await fetch("/api/settings/whatsapp/responder", { cache: "no-store" });
  if (!res.ok) throw new Error("Status penjawab tidak bisa dimuat");
  return res.json();
}

async function postSwitch(body: Record<string, unknown>): Promise<{ returned: number; botEnabled: boolean }> {
  const res = await fetch("/api/settings/whatsapp/responder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Gagal mengganti penjawab");
  return data;
}

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }) : "-";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`responder-step-${n}`} className="space-y-2">
      <h3 id={`responder-step-${n}`} className="text-sm font-medium">
        {n}. {title}
      </h3>
      {children}
    </section>
  );
}

function Note({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : AlertTriangle;
  return (
    <div
      role={tone === "error" ? "alert" : "note"}
      className={cn(
        "flex gap-2 rounded-lg border p-3 text-sm",
        tone === "ok" && "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
        tone === "warn" && "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
        tone === "error" && "border-destructive/40 bg-destructive/5 text-destructive",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

export function ResponderSwitchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const status = useQuery<Status>({ queryKey: STATUS_KEY, queryFn: fetchStatus, enabled: open, refetchOnWindowFocus: false });
  // null = pilihan awal: chat yang balasan admin-nya hanya dari HP/Kirimi (pantulan Agen AI Kirimi).
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const data = status.data;
  const selected = picked ?? new Set(data?.humanChats.filter((c) => c.onlyPhoneReplies).map((c) => c.id) ?? []);
  const setSelected = (next: Set<string>) => setPicked(next);
  const close = (next: boolean) => {
    if (!next) {
      setPicked(null);
      setConfirmed(false);
      // Dibuka lagi = data segar (status AI Kirimi dan daftar chat bisa berubah kapan saja).
      queryClient.resetQueries({ queryKey: STATUS_KEY });
    }
    onOpenChange(next);
  };

  const toPortal = data ? !data.botEnabled : true;
  const save = useMutation({
    mutationFn: () => postSwitch(toPortal ? { to: "PORTAL", returnConversationIds: [...selected], kirimiOffConfirmed: confirmed } : { to: "KIRIMI" }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: WHATSAPP_SETTINGS_KEY });
      queryClient.invalidateQueries({ queryKey: STATUS_KEY });
      toast(
        result.botEnabled
          ? `Bot portal aktif${result.returned ? `; ${result.returned} chat dikembalikan ke bot` : ""}.`
          : "Bot portal dimatikan. Lanjutkan dengan menyalakan Agen AI di dashboard Kirimi.",
        "success",
      );
      close(false);
    },
    onError: (error: Error) => {
      toast(error.message, "error");
      status.refetch();
    },
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const blocked = toPortal && !!data && (data.kirimiAi === "on" || data.kirimiAi === "unknown") && !confirmed;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{toPortal ? "Ganti penjawab ke bot portal" : "Ganti penjawab ke Agen AI Kirimi"}</DialogTitle>
          <DialogDescription>
            Bot portal dan Agen AI Kirimi tidak boleh aktif bersamaan: klien menerima dua balasan dan balasan Kirimi
            terbaca sebagai ketikan admin.
          </DialogDescription>
        </DialogHeader>

        {status.isLoading && <div aria-busy="true" className="h-48 w-full animate-pulse rounded-lg bg-muted" />}

        {status.isError && (
          <Note tone="error">
            <p>Status penjawab tidak bisa dimuat.</p>
            <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={() => status.refetch()}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Coba lagi
            </Button>
          </Note>
        )}

        {data && toPortal && (
          <div className="space-y-5">
            <Step n={1} title="Matikan Agen AI Kirimi">
              {data.kirimiAi === "off" && <Note tone="ok">Agen AI Kirimi sudah mati di perangkat ini.</Note>}
              {data.kirimiAi === "not_kirimi" && <Note tone="ok">Saluran aktif bukan Kirimi, langkah ini tidak perlu.</Note>}
              {(data.kirimiAi === "on" || data.kirimiAi === "unknown") && (
                <Note tone="warn">
                  <p>
                    {data.kirimiAi === "on"
                      ? "Kirimi masih melaporkan Agen AI aktif. Status ini kadang tidak ikut berubah setelah Agen AI dimatikan, jadi pastikan sendiri di dashboard Kirimi bahwa tidak ada agen yang aktif di perangkat ini."
                      : "Status Agen AI Kirimi tidak terbaca dari server. Pastikan sendiri di dashboard Kirimi."}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a href={KIRIMI_DASHBOARD} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "max-md:h-11")}>
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      Buka dashboard Kirimi
                    </a>
                    <Button type="button" variant="outline" size="sm" className="max-md:h-11" onClick={() => status.refetch()} disabled={status.isFetching}>
                      {status.isFetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                      Cek ulang
                    </Button>
                  </div>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                    Sudah saya matikan di dashboard Kirimi
                  </label>
                </Note>
              )}
            </Step>

            <Step n={2} title="Periksa Panduan bot">
              {data.draftDiffers ? (
                <Note tone="warn">
                  <p>
                    Draft Panduan belum diterbitkan; bot memakai {data.publishedVersion ? `versi ${data.publishedVersion}` : "Panduan kosong"}.{" "}
                    <Link href="/bot?tab=panduan" className="font-medium underline underline-offset-2">
                      Buka Panduan
                    </Link>
                  </p>
                </Note>
              ) : (
                <Note tone="ok">Bot memakai Panduan versi {data.publishedVersion}.</Note>
              )}
            </Step>

            <Step n={3} title={`Kembalikan chat ke bot (${selected.size} dari ${data.humanChats.length} dipilih)`}>
              {data.humanChats.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada chat yang sedang ditangani admin.</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Tercentang otomatis: chat yang balasan admin-nya hanya dari HP atau Agen AI Kirimi. Chat yang pernah dibalas admin dari
                    portal tidak dicentang.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" className="max-md:h-11" onClick={() => setSelected(new Set(data.humanChats.map((c) => c.id)))}>
                      Pilih semua
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="max-md:h-11" onClick={() => setSelected(new Set())}>
                      Kosongkan
                    </Button>
                  </div>
                  <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                    {data.humanChats.map((c) => (
                      <li key={c.id}>
                        <label className="flex min-h-11 cursor-pointer gap-3 p-3 text-sm hover:bg-muted/50">
                          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                          <span className="min-w-0 flex-1 space-y-0.5">
                            <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                              <span className="font-medium">{c.name ?? c.phone}</span>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {c.name ? `${c.phone} · ` : ""}
                                {formatDate(c.lastInboundAt)}
                              </span>
                            </span>
                            {c.preview && <span className="block truncate text-muted-foreground">{c.preview}</span>}
                            <span className="block text-xs text-muted-foreground">
                              {c.onlyPhoneReplies ? "Balasan hanya dari HP / Agen AI Kirimi" : "Pernah dibalas admin dari portal atau belum dibalas"}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Step>
          </div>
        )}

        {data && !toPortal && (
          <div className="space-y-3 text-sm">
            <p>Balas otomatis portal akan dimatikan. Pesan klien tetap tersimpan di Inbox dan Order WA, dan invoice tetap terkirim saat admin menyimpan harga.</p>
            <p className="font-medium">Setelah itu:</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Buat knowledge terbaru di{" "}
                <Link href="/bot?tab=otak" className="font-medium underline underline-offset-2">
                  Bot AI › Otak bot
                </Link>{" "}
                lalu tempel di Agen AI Kirimi.
              </li>
              <li>
                Nyalakan Agen AI di{" "}
                <a href={KIRIMI_DASHBOARD} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                  dashboard Kirimi
                </a>
                .
              </li>
            </ol>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" className="max-md:h-11" onClick={() => close(false)}>
            Batal
          </Button>
          <Button type="button" className="max-md:h-11" disabled={!data || blocked || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {toPortal ? "Nyalakan bot portal" : "Matikan bot portal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
