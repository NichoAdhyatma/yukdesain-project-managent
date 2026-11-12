"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, Bot, ExternalLink, Headset, Loader2, RotateCcw, Search, Send, UserRound } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MessageList, type ChatMessage } from "./ChatHistory";
import { STATUS_BADGE, formatRelative } from "./labels";
import type { WaIntakeStatus } from "./types";

// Inbox semua chat WhatsApp (docs/OWNER_NOTIFICATIONS_INBOX.md §3), termasuk nomor yang belum punya order.

type InboxFilter = "all" | "needs_admin" | "no_order" | "blocked";

type InboxItem = {
  id: string;
  name: string | null;
  phoneMasked: string;
  mode: "BOT" | "HUMAN";
  blocked: boolean;
  ownerTest: boolean;
  lastMessage: { direction: "INBOUND" | "OUTBOUND"; preview: string; at: string } | null;
  lastInboundAt: string | null;
  outsideServiceWindow: boolean;
  intake: { id: string; status: WaIntakeStatus; serviceName: string | null } | null;
};
type InboxList = { items: InboxItem[]; total: number; page: number; pageSize: number; needsAdmin: number };

type InboxConversation = {
  id: string;
  name: string | null;
  waId: string;
  phoneMasked: string;
  mode: "BOT" | "HUMAN";
  blockedAt: string | null;
  ownerTest: boolean;
  lastInboundAt: string | null;
  outsideServiceWindow: boolean;
  intake: InboxItem["intake"];
  messages: ChatMessage[];
};

const FILTERS: { id: InboxFilter; label: string; empty: string }[] = [
  { id: "all", label: "Semua", empty: "Belum ada chat WhatsApp." },
  { id: "needs_admin", label: "Menunggu admin", empty: "Tidak ada chat yang menunggu admin." },
  { id: "no_order", label: "Belum ada order", empty: "Semua chat sudah punya order." },
  { id: "blocked", label: "Diblokir", empty: "Tidak ada nomor yang diblokir." },
];

const REFRESH_MS = 20_000;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? body.fields?.text ?? "Permintaan gagal");
  return body as T;
}

function StatusBadges({ item }: { item: Pick<InboxItem, "mode" | "blocked" | "ownerTest"> }) {
  return (
    <>
      {item.blocked ? (
        <Badge variant="destructive" className="gap-1">
          <Ban className="h-3 w-3" aria-hidden="true" />
          Diblokir
        </Badge>
      ) : item.mode === "HUMAN" ? (
        <Badge variant="outline" className="gap-1">
          <Headset className="h-3 w-3" aria-hidden="true" />
          Admin
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1">
          <Bot className="h-3 w-3" aria-hidden="true" />
          Bot
        </Badge>
      )}
      {item.ownerTest && <Badge variant="secondary">Tes owner</Badge>}
    </>
  );
}

export function WaInbox() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("chat");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const searchId = useId();

  // Pencarian dikirim setelah berhenti mengetik sebentar.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const list = useQuery<InboxList>({
    queryKey: ["wa-inbox", filter, search],
    queryFn: () => api<InboxList>(`/api/wa-conversations?filter=${filter}&q=${encodeURIComponent(search)}`),
    refetchInterval: REFRESH_MS,
  });

  const select = (id: string | null) =>
    router.replace(id ? `/wa-orders?tab=inbox&chat=${id}` : "/wa-orders?tab=inbox", { scroll: false });

  const listPane = (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={searchId} className="sr-only">
          Cari nama atau nomor
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama atau nomor"
            className="pl-8"
          />
        </div>
        <div role="group" aria-label="Filter chat" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:min-h-11",
                filter === f.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {f.label}
              {f.id === "needs_admin" && (list.data?.needsAdmin ?? 0) > 0 && (
                <span className="tabular-nums">({list.data?.needsAdmin})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : list.isError || !list.data ? (
        <div className="space-y-2 rounded-lg border p-4 text-sm">
          <p className="text-destructive">Inbox tidak bisa dimuat.</p>
          <Button variant="outline" size="sm" onClick={() => list.refetch()}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Coba lagi
          </Button>
        </div>
      ) : list.data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {search ? "Tidak ada chat yang cocok dengan pencarian." : FILTERS.find((f) => f.id === filter)?.empty}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border" aria-label="Daftar chat">
          {list.data.items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => select(item.id)}
                aria-current={item.id === selectedId ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col gap-1 px-3 py-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50",
                  item.id === selectedId && "bg-muted",
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{item.name ?? item.phoneMasked}</span>
                  {item.lastMessage && (
                    <time className="shrink-0 text-xs text-muted-foreground" dateTime={item.lastMessage.at}>
                      {formatRelative(item.lastMessage.at)}
                    </time>
                  )}
                </span>
                {item.name && <span className="text-xs text-muted-foreground">{item.phoneMasked}</span>}
                {item.lastMessage && (
                  <span className="line-clamp-2 break-words text-muted-foreground">
                    {item.lastMessage.direction === "OUTBOUND" && <span className="font-medium">Balasan: </span>}
                    {item.lastMessage.preview}
                  </span>
                )}
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusBadges item={item} />
                  {item.intake ? (
                    <Badge variant={STATUS_BADGE[item.intake.status].variant}>{STATUS_BADGE[item.intake.status].label}</Badge>
                  ) : (
                    <Badge variant="outline">Belum ada order</Badge>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.data && list.data.total > list.data.items.length && (
        <p className="text-xs text-muted-foreground">
          Menampilkan {list.data.items.length} dari {list.data.total} chat terbaru. Gunakan pencarian untuk chat lama.
        </p>
      )}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
      {/* Layar kecil: daftar atau detail; layar lebar: keduanya berdampingan. */}
      <div className={cn(selectedId && "max-lg:hidden")}>{listPane}</div>
      <div className={cn(!selectedId && "max-lg:hidden")}>
        {selectedId ? (
          <ConversationPanel id={selectedId} onBack={() => select(null)} />
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">Pilih chat untuk melihat riwayatnya.</p>
        )}
      </div>
    </div>
  );
}

function ConversationPanel({ id, onBack }: { id: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const key = ["wa-inbox", "chat", id];
  const { data, isLoading, isError, refetch } = useQuery<{ conversation: InboxConversation }>({
    queryKey: key,
    queryFn: () => api(`/api/wa-conversations/${id}`),
    refetchInterval: REFRESH_MS,
  });
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = data?.conversation.messages.at(-1)?.id;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const onUpdated = (next: { conversation: InboxConversation }) => {
    queryClient.setQueryData(key, next);
    queryClient.invalidateQueries({ queryKey: ["wa-inbox"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["wa-intakes"], exact: false });
  };
  const mode = useMutation({
    mutationFn: (next: "BOT" | "HUMAN") => api<{ conversation: InboxConversation }>(`/api/wa-conversations/${id}/mode`, { method: "POST", body: JSON.stringify({ mode: next }) }),
    onSuccess: (next, value) => {
      onUpdated(next);
      toast(value === "HUMAN" ? "Chat diambil alih admin" : "Chat dikembalikan ke bot. Pesan klien yang belum terbalas dijawab bot, bila ada.", "success");
    },
    onError: (e) => toast(e.message, "error"),
  });
  const [confirmBlock, setConfirmBlock] = useState(false);
  const block = useMutation({
    mutationFn: (blocked: boolean) => api<{ conversation: InboxConversation }>(`/api/wa-conversations/${id}/block`, { method: "POST", body: JSON.stringify({ blocked }) }),
    onSuccess: (next, blocked) => {
      onUpdated(next);
      setConfirmBlock(false);
      toast(blocked ? "Nomor diblokir. Bot tidak membalas nomor ini." : "Blokir nomor dibuka.", "success");
    },
    onError: (e) => {
      setConfirmBlock(false);
      toast(e.message, "error");
    },
  });

  const back = (
    <Button variant="ghost" size="sm" className="lg:hidden max-md:h-11" onClick={onBack}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Kembali ke daftar
    </Button>
  );

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {back}
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="space-y-2">
        {back}
        <div className="space-y-2 rounded-lg border p-4 text-sm">
          <p className="text-destructive">Chat tidak bisa dimuat. Mungkin sudah dihapus atau bukan chat WhatsApp sungguhan.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  const c = data.conversation;
  const human = c.mode === "HUMAN";
  const blocked = !!c.blockedAt;

  return (
    <div className="space-y-2">
      {back}
      <Card className="flex max-h-[720px] flex-col">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {c.name ?? c.phoneMasked}
            <StatusBadges item={{ mode: c.mode, blocked, ownerTest: c.ownerTest }} />
          </CardTitle>
          <CardDescription>
            {c.name && <span className="tabular-nums">{c.waId} · </span>}
            {blocked
              ? "Nomor ini diblokir. Pesan tetap tersimpan, tetapi bot tidak membalas."
              : human
                ? "Ditangani admin. Bot tidak membalas sampai chat dikembalikan ke bot."
                : "Bot sedang melayani. Ambil alih untuk membalas sendiri."}
          </CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2">
            {c.intake && (
              <Link href={`/wa-orders/${c.intake.id}`} className={buttonVariants({ variant: "outline", size: "sm", className: "max-md:h-11" })}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Buka order
              </Link>
            )}
            {!blocked && (
              <Button variant="outline" size="sm" className="max-md:h-11" disabled={mode.isPending} onClick={() => mode.mutate(human ? "BOT" : "HUMAN")}>
                {mode.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : human ? (
                  <Bot className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Headset className="h-4 w-4" aria-hidden="true" />
                )}
                {human ? "Kembalikan ke bot" : "Ambil alih"}
              </Button>
            )}
            {!c.ownerTest && (
              <Button
                variant={blocked ? "outline" : "ghost"}
                size="sm"
                className="max-md:h-11"
                disabled={block.isPending}
                onClick={() => (blocked ? block.mutate(false) : setConfirmBlock(true))}
              >
                <Ban className="h-4 w-4" aria-hidden="true" />
                {blocked ? "Buka blokir" : "Blokir nomor"}
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          <MessageList messages={c.messages} />
        </CardContent>
        {human && !blocked && (
          <CardFooter className="bg-transparent">
            <InboxComposer conversation={c} onSent={onUpdated} />
          </CardFooter>
        )}
      </Card>

      <Dialog open={confirmBlock} onOpenChange={(o) => !block.isPending && setConfirmBlock(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Blokir {c.name ?? c.phoneMasked}?</DialogTitle>
            <DialogDescription>
              Pesan dari nomor ini tetap tersimpan, tetapi bot tidak membalas dan tidak memakai AI. Klien tidak diberi
              tahu. Blokir bisa dibuka kapan saja.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBlock(false)} disabled={block.isPending}>
              Batal
            </Button>
            <Button variant="destructive" onClick={() => block.mutate(true)} disabled={block.isPending}>
              {block.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Blokir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InboxComposer({ conversation, onSent }: { conversation: InboxConversation; onSent: (next: { conversation: InboxConversation }) => void }) {
  const [text, setText] = useState("");
  const fieldId = useId();
  const send = useMutation({
    mutationFn: () =>
      api<{ conversation: InboxConversation; delivery: { ok: boolean } }>(`/api/wa-conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    onSuccess: (next) => {
      onSent(next);
      if (next.delivery.ok) {
        setText("");
        toast("Pesan terkirim", "success");
      } else {
        toast("Pesan tersimpan tetapi gagal terkirim ke WhatsApp", "error");
      }
    },
    onError: (e) => toast(e.message, "error"),
  });

  if (conversation.outsideServiceWindow) {
    return (
      <p className="text-sm text-muted-foreground">
        Sudah lewat 24 jam sejak pesan terakhir klien. WhatsApp hanya mengizinkan pesan template, jadi balasan manual
        belum bisa dikirim sampai klien menulis lagi.
      </p>
    );
  }
  return (
    <form
      className="w-full space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) send.mutate();
      }}
    >
      <Label htmlFor={fieldId}>Balas sebagai admin</Label>
      <Textarea id={fieldId} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis balasan untuk klien" />
      <div className="flex justify-end">
        <Button type="submit" className="max-md:h-11" disabled={!text.trim() || send.isPending}>
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
          Kirim
        </Button>
      </div>
    </form>
  );
}
