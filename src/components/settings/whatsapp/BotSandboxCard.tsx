"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, RotateCcw, Send, UserRound, UsersRound } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BriefReader } from "@/components/forms/brief/BriefReader";
import { STATUS_BADGE } from "@/components/wa-orders/labels";
import type { WaIntakeStatus } from "@/components/wa-orders/types";
import { cn } from "@/lib/utils";

// Uji bot (docs/WHATSAPP_BOT_GUIDE.md §5): owner berperan sebagai klien, bot memakai draft
// panduan. Tidak ada pesan WhatsApp yang dikirim; order uji tidak masuk Order WA.

type SandboxState = {
  mode: "BOT" | "HUMAN" | null;
  messages: { id: string; direction: "INBOUND" | "OUTBOUND"; body: string; createdAt: string }[];
  intake: {
    status: WaIntakeStatus;
    service: { code: string; name: string } | null;
    clientName: string | null;
    briefResponses: { questionId: string; question: string; answer: string }[];
  } | null;
};

const QUERY_KEY = ["settings", "whatsapp", "sandbox"];
const MAX_CHARS = 2000;
const EXAMPLES = [
  "Halo, mau bikin logo untuk usaha kopi",
  "Berapa harga desain feed Instagram?",
  "Bisa minta file mentahnya nanti?",
];

async function call(method: "GET" | "POST" | "DELETE", body?: unknown): Promise<SandboxState> {
  const res = await fetch("/api/settings/whatsapp/sandbox", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.fields?.text ?? data.message ?? "Bot tidak bisa dihubungi. Coba lagi.");
  return data;
}

const formatTime = (d: string) =>
  new Date(d).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export function BotSandboxCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<SandboxState>({
    queryKey: QUERY_KEY,
    queryFn: () => call("GET"),
  });
  const [text, setText] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = useMutation({
    mutationFn: (message: string) => call("POST", { text: message }),
    onMutate: (message) => {
      setPendingText(message);
      setText("");
    },
    onSuccess: (next) => queryClient.setQueryData(QUERY_KEY, next),
    onError: (error, message) => {
      // Pesan dikembalikan ke kotak input supaya bisa dikirim ulang.
      setText(message);
      toast((error as Error).message, "error");
    },
    onSettled: () => {
      setPendingText(null);
      inputRef.current?.focus();
    },
  });

  const reset = useMutation({
    mutationFn: () => call("DELETE"),
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      toast("Percakapan uji dihapus", "success");
    },
    onError: () => toast("Gagal memulai ulang", "error"),
  });

  // Gulir ke pesan terbaru saat ada pesan baru atau bot sedang membalas.
  const messageCount = data?.messages.length ?? 0;
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount, pendingText]);

  const submit = () => {
    const message = text.trim();
    if (!message || send.isPending) return;
    send.mutate(message);
  };

  if (isLoading) {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <CardTitle>Uji bot</CardTitle>
          <CardDescription>Memuat percakapan uji…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Uji bot</CardTitle>
          <CardDescription>Percakapan uji tidak bisa dimuat.</CardDescription>
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

  const handedOff = data.mode === "HUMAN";
  const empty = data.messages.length === 0 && !pendingText;
  const intake = data.intake;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Uji bot</CardTitle>
            <CardDescription>
              Anda berperan sebagai klien; bot memakai draft panduan yang sudah disimpan. Tidak ada pesan WhatsApp yang
              dikirim, dan order uji tidak masuk Order WA. Setiap pesan memakai kuota API Claude seperti chat biasa.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => reset.mutate()}
            disabled={reset.isPending || send.isPending || data.messages.length === 0}
          >
            {reset.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Mulai ulang
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-3">
            <div ref={logRef} className="h-[26rem] overflow-y-auto rounded-lg border bg-muted/30 p-3">
              {empty ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Belum ada percakapan uji. Ketik pesan seperti klien, atau mulai dengan salah satu contoh:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {EXAMPLES.map((example) => (
                      <Button
                        key={example}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto whitespace-normal py-1.5 text-left"
                        onClick={() => {
                          setText(example);
                          inputRef.current?.focus();
                        }}
                      >
                        {example}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <ol className="space-y-3" role="log" aria-live="polite" aria-label="Percakapan uji">
                  {data.messages.map((m) => {
                    const fromBot = m.direction === "OUTBOUND";
                    return (
                      <li key={m.id} className={cn("flex", fromBot ? "justify-start" : "justify-end")}>
                        <div
                          className={cn(
                            "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
                            fromBot ? "bg-background" : "bg-primary/10",
                          )}
                        >
                          <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                            {fromBot ? <Bot className="h-3 w-3" aria-hidden="true" /> : <UserRound className="h-3 w-3" aria-hidden="true" />}
                            {fromBot ? "Bot" : "Anda (sebagai klien)"}
                            <span aria-hidden="true">·</span>
                            <time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
                          </p>
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        </div>
                      </li>
                    );
                  })}
                  {pendingText && (
                    <>
                      <li className="flex justify-end">
                        <div className="max-w-[85%] rounded-lg border bg-primary/10 px-3 py-2 text-sm">
                          <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <UserRound className="h-3 w-3" aria-hidden="true" />
                            Anda (sebagai klien)
                          </p>
                          <p className="whitespace-pre-wrap break-words">{pendingText}</p>
                        </div>
                      </li>
                      <li className="flex justify-start">
                        <p className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Bot sedang membalas…
                        </p>
                      </li>
                    </>
                  )}
                </ol>
              )}
            </div>

            {handedOff && (
              <p role="status" className="flex gap-2 rounded-lg border p-3 text-sm">
                <UsersRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Bot menyerahkan percakapan ke admin, sama seperti di WhatsApp. Klik Mulai ulang untuk menguji lagi.
              </p>
            )}

            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <Label htmlFor="wa-sandbox-input">Pesan sebagai klien</Label>
              <div className="flex items-end gap-2">
                <Textarea
                  id="wa-sandbox-input"
                  ref={inputRef}
                  rows={2}
                  maxLength={MAX_CHARS}
                  value={text}
                  disabled={handedOff}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  aria-describedby="wa-sandbox-help"
                  className="min-h-[2.75rem] resize-none"
                />
                <Button type="submit" className="h-11 shrink-0" disabled={!text.trim() || send.isPending || handedOff}>
                  {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                  <span className="sr-only sm:not-sr-only">Kirim</span>
                </Button>
              </div>
              <p id="wa-sandbox-help" className="text-xs text-muted-foreground">
                Enter untuk mengirim, Shift+Enter untuk baris baru. Gambar belum bisa diuji di sini.
              </p>
            </form>
          </div>

          <aside aria-labelledby="wa-sandbox-summary" className="space-y-3 rounded-lg border p-4 text-sm">
            <h3 id="wa-sandbox-summary" className="font-medium">
              Yang dicatat bot
            </h3>
            {intake ? (
              <dl className="space-y-3">
                <div>
                  <dt className="text-muted-foreground">Status order</dt>
                  <dd className="mt-1">
                    <Badge variant={STATUS_BADGE[intake.status].variant}>{STATUS_BADGE[intake.status].label}</Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Layanan</dt>
                  <dd>{intake.service?.name ?? "Belum dipilih"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Nama klien</dt>
                  <dd>{intake.clientName ?? "Belum diisi"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Brief</dt>
                  <dd className="mt-1">
                    {intake.briefResponses.length > 0 ? (
                      <BriefReader responses={intake.briefResponses} serviceCode={intake.service?.code ?? ""} />
                    ) : (
                      "Masih kosong"
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground">
                Belum ada order. Order uji dibuat saat bot mulai mencatat kebutuhan klien.
              </p>
            )}
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}
