"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, HelpCircle, Loader2, RotateCcw, Send, UserRound, UsersRound, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BriefReader } from "@/components/forms/brief/BriefReader";
import { STATUS_BADGE } from "@/components/wa-orders/labels";
import { WhatsAppText } from "@/components/wa-orders/WhatsAppText";
import type { WaIntakeStatus } from "@/components/wa-orders/types";
import { cn } from "@/lib/utils";
import { GUIDE_QUERY_KEY } from "./BotGuideCard";

// Uji bot (docs/WHATSAPP_BOT_GUIDE.md §5, docs/WHATSAPP_OWNER_COMMANDS.md): owner berperan sebagai
// klien (bot memakai draft panduan) atau sebagai owner (instruksi → usulan → YA masuk draft).
// Tidak ada pesan WhatsApp yang dikirim; order uji tidak masuk Order WA.

type Role = "client" | "owner";
type Message = { id: string; direction: "INBOUND" | "OUTBOUND"; body: string; createdAt: string };
type SandboxState = {
  client: {
    mode: "BOT" | "HUMAN" | null;
    messages: Message[];
    intake: {
      status: WaIntakeStatus;
      service: { code: string; name: string } | null;
      clientName: string | null;
      briefResponses: { questionId: string; question: string; answer: string }[];
      pricingRules: { ruleId: string; name: string }[];
    } | null;
    pendingOwnerQuery: { id: string; question: string } | null;
  };
  owner: { messages: Message[]; awaitingConfirmation: boolean };
};

const QUERY_KEY = ["settings", "whatsapp", "sandbox"];
const MAX_CHARS = 2000;
const EXAMPLES: Record<Role, string[]> = {
  client: ["Halo, mau bikin logo untuk usaha kopi", "Berapa harga desain feed Instagram?", "Bisa bikin desain kemasan sachet?"],
  owner: [
    "Kalau klien pesan lebih dari 5 desain, kasih diskon 50rb ya",
    "Kalau ada yang butuh cepat, tawarkan paket express, tambah 50% dari total",
    "Aturan apa saja yang berlaku sekarang?",
  ],
};
const ROLE_LABEL: Record<Role, string> = { client: "Anda (sebagai klien)", owner: "Anda (sebagai owner)" };

async function request(url: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<SandboxState> {
  const res = await fetch(url, {
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

function Bubble({ fromBot, label, time, children }: { fromBot: boolean; label: string; time?: string; children: React.ReactNode }) {
  return (
    <li className={cn("flex", fromBot ? "justify-start" : "justify-end")}>
      <div className={cn("max-w-[85%] rounded-lg border px-3 py-2 text-sm", fromBot ? "bg-background" : "bg-primary/10")}>
        <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
          {fromBot ? <Bot className="h-3 w-3" aria-hidden="true" /> : <UserRound className="h-3 w-3" aria-hidden="true" />}
          {label}
          {time && (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={time}>{formatTime(time)}</time>
            </>
          )}
        </p>
        {children}
      </div>
    </li>
  );
}

export function BotSandboxCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<SandboxState>({
    queryKey: QUERY_KEY,
    queryFn: () => request("/api/settings/whatsapp/sandbox", "GET"),
  });
  const [role, setRole] = useState<Role>("client");
  const [text, setText] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [ownerNote, setOwnerNote] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const onState = (next: SandboxState) => {
    queryClient.setQueryData(QUERY_KEY, next);
    // Usulan owner yang dibalas YA mengubah draft panduan.
    if (role === "owner") queryClient.invalidateQueries({ queryKey: GUIDE_QUERY_KEY });
  };

  const send = useMutation({
    mutationFn: (message: string) => request("/api/settings/whatsapp/sandbox", "POST", { text: message, role }),
    onMutate: (message) => {
      setPendingText(message);
      setText("");
    },
    onSuccess: onState,
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

  const answer = useMutation({
    mutationFn: (p: { queryId: string; approved: boolean }) =>
      request("/api/settings/whatsapp/sandbox/owner-answer", "POST", { ...p, note: ownerNote.trim() || undefined }),
    onSuccess: (next) => {
      onState(next);
      setOwnerNote("");
    },
    onError: (error) => toast((error as Error).message, "error"),
  });

  const reset = useMutation({
    mutationFn: () => request(`/api/settings/whatsapp/sandbox?role=${role}`, "DELETE"),
    onSuccess: (next) => {
      onState(next);
      toast("Percakapan uji dihapus", "success");
    },
    onError: () => toast("Gagal memulai ulang", "error"),
  });

  // Gulir ke pesan terbaru saat ada pesan baru, peran berganti, atau bot sedang membalas.
  const messages = data ? data[role].messages : [];
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pendingText, role, answer.isPending]);

  const busy = send.isPending || answer.isPending || reset.isPending;
  const submit = (message = text) => {
    const m = message.trim();
    if (!m || busy) return;
    send.mutate(m);
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

  const client = data.client;
  const handedOff = role === "client" && client.mode === "HUMAN";
  const empty = messages.length === 0 && !pendingText;
  const intake = client.intake;
  const query = role === "client" ? client.pendingOwnerQuery : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Uji bot</CardTitle>
            <CardDescription>
              {role === "client"
                ? "Anda berperan sebagai klien; bot memakai draft panduan yang sudah disimpan. Order uji tidak masuk Order WA."
                : "Anda berperan sebagai owner yang chat ke bot. Usulan yang Anda balas YA masuk ke draft panduan, belum ke klien; coba hasilnya sebagai klien lalu terbitkan."}{" "}
              Tidak ada pesan WhatsApp yang dikirim. Setiap pesan memakai kuota API Claude seperti chat biasa.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => reset.mutate()} disabled={busy || messages.length === 0}>
            {reset.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Mulai ulang
          </Button>
        </div>
        <div role="group" aria-label="Peran Anda di percakapan uji" className="flex w-fit gap-1 rounded-lg border p-1">
          {(["client", "owner"] as const).map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={role === r ? "secondary" : "ghost"}
              aria-pressed={role === r}
              disabled={busy}
              onClick={() => {
                setRole(r);
                setText("");
              }}
            >
              {r === "client" ? "Sebagai klien" : "Sebagai owner"}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("grid gap-6", role === "client" && "lg:grid-cols-[minmax(0,1fr)_18rem]")}>
          <div className="flex min-w-0 flex-col gap-3">
            <div ref={logRef} className="h-[26rem] overflow-y-auto rounded-lg border bg-muted/30 p-3">
              {empty ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {role === "client"
                      ? "Belum ada percakapan uji. Ketik pesan seperti klien, atau mulai dengan salah satu contoh:"
                      : "Ketik instruksi seperti chat ke bot dari nomor owner, misalnya:"}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {EXAMPLES[role].map((example) => (
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
                  {messages.map((m) => (
                    <Bubble key={m.id} fromBot={m.direction === "OUTBOUND"} label={m.direction === "OUTBOUND" ? "Bot" : ROLE_LABEL[role]} time={m.createdAt}>
                      <WhatsAppText text={m.body} />
                    </Bubble>
                  ))}
                  {pendingText && (
                    <Bubble fromBot={false} label={ROLE_LABEL[role]}>
                      <WhatsAppText text={pendingText} />
                    </Bubble>
                  )}
                  {(pendingText || answer.isPending) && (
                    <li className="flex justify-start">
                      <p className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Bot sedang membalas…
                      </p>
                    </li>
                  )}
                </ol>
              )}
            </div>

            {query && (
              <div role="status" className="space-y-3 rounded-lg border p-3 text-sm">
                <p className="flex gap-2">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-medium">Bot bertanya ke owner:</span> {query.question}
                    <span className="block text-muted-foreground">
                      Di WhatsApp sungguhan, pertanyaan ini dikirim ke nomor owner. Jawab di sini sebagai owner.
                    </span>
                  </span>
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="wa-sandbox-owner-note">Catatan owner untuk bot (opsional)</Label>
                  <Input
                    id="wa-sandbox-owner-note"
                    value={ownerNote}
                    maxLength={1000}
                    onChange={(e) => setOwnerNote(e.target.value)}
                    placeholder="Misalnya: bisa, pakai layanan yang paling mirip"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={busy} onClick={() => answer.mutate({ queryId: query.id, approved: true })}>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Bisa
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => answer.mutate({ queryId: query.id, approved: false })}>
                    <X className="h-4 w-4" aria-hidden="true" />
                    Tidak bisa
                  </Button>
                </div>
              </div>
            )}

            {handedOff && (
              <p role="status" className="flex gap-2 rounded-lg border p-3 text-sm">
                <UsersRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Bot menyerahkan percakapan ke admin, sama seperti di WhatsApp. Klik Mulai ulang untuk menguji lagi.
              </p>
            )}

            {role === "owner" && data.owner.awaitingConfirmation && (
              <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Usulan menunggu jawaban Anda:</span>
                <Button type="button" size="sm" disabled={busy} onClick={() => submit("YA")}>
                  Balas YA
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => submit("BATAL")}>
                  Balas BATAL
                </Button>
              </div>
            )}

            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <Label htmlFor="wa-sandbox-input">{role === "client" ? "Pesan sebagai klien" : "Pesan sebagai owner"}</Label>
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
                <Button type="submit" className="h-11 shrink-0" disabled={!text.trim() || busy || handedOff}>
                  {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                  <span className="sr-only sm:not-sr-only">Kirim</span>
                </Button>
              </div>
              <p id="wa-sandbox-help" className="text-xs text-muted-foreground">
                Enter untuk mengirim, Shift+Enter untuk baris baru. Gambar belum bisa diuji di sini.
              </p>
            </form>
          </div>

          {role === "client" && (
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
                  {intake.pricingRules.length > 0 && (
                    <div>
                      <dt className="text-muted-foreground">Aturan harga untuk tim</dt>
                      <dd>
                        <ul className="list-inside list-disc">
                          {intake.pricingRules.map((r) => (
                            <li key={r.ruleId}>{r.name}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
