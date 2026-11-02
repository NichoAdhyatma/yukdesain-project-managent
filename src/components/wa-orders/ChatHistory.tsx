"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Bot, Clock, Headset, Loader2, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDateTime } from "./labels";
import type { WaIntakeDetail } from "./types";
import { useIntakeAction } from "./use-intake-action";

// Batas teks bebas Cloud API, sama dengan validasi server (MANUAL_REPLY_MAX_LENGTH).
const MAX_LENGTH = 4096;

type Message = WaIntakeDetail["messages"][number];

function SenderLabel({ m }: { m: Message }) {
  if (m.direction === "INBOUND") {
    return (
      <>
        <UserRound className="h-3 w-3" aria-hidden="true" />
        Klien
      </>
    );
  }
  if (m.sentByBot) {
    return (
      <>
        <Bot className="h-3 w-3" aria-hidden="true" />
        Bot
      </>
    );
  }
  if (m.sentByAdmin) {
    return (
      <>
        <Headset className="h-3 w-3" aria-hidden="true" />
        Admin
      </>
    );
  }
  return (
    <>
      <Send className="h-3 w-3" aria-hidden="true" />
      {m.type === "template" ? "Pesan sistem (template)" : "Pesan sistem"}
    </>
  );
}

function ModeButton({ intake }: { intake: WaIntakeDetail }) {
  const human = intake.conversation.mode === "HUMAN";
  const action = useIntakeAction<{ mode: "BOT" | "HUMAN" }>(intake.id, "/mode", "POST", {
    successMessage: human ? "Chat dikembalikan ke bot" : "Chat diambil alih admin",
  });
  return (
    <Button
      variant="outline"
      size="sm"
      className="max-md:h-11"
      disabled={action.isPending}
      onClick={() => action.mutate({ mode: human ? "BOT" : "HUMAN" })}
    >
      {action.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : human ? (
        <Bot className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Headset className="h-4 w-4" aria-hidden="true" />
      )}
      {human ? "Kembalikan ke bot" : "Ambil alih"}
    </Button>
  );
}

function Composer({ intake }: { intake: WaIntakeDetail }) {
  const [text, setText] = useState("");
  const fieldId = useId();
  const send = useIntakeAction<{ text: string }>(intake.id, "/messages", "POST", {
    successMessage: "Pesan terkirim",
    deliveryMessages: { ok: "Pesan terkirim ke klien.", fail: "Pesan gagal terkirim." },
    inlineError: true,
    // Gagal terkirim: teks dibiarkan supaya bisa dikirim ulang.
    onSuccess: (data) => {
      if (data.delivery?.ok) setText("");
    },
  });

  if (intake.conversation.outsideServiceWindow) {
    return (
      <div className="flex w-full gap-2 text-sm">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">
          Sudah lewat 24 jam sejak pesan terakhir klien. WhatsApp hanya mengizinkan pesan template, jadi balasan manual
          baru bisa dikirim setelah klien mengirim pesan lagi. Untuk sekarang, hubungi klien dari nomor lain di{" "}
          <a
            className="font-medium text-foreground underline underline-offset-2"
            href={`https://wa.me/${intake.conversation.waId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            +{intake.conversation.waId}
          </a>
          .
        </p>
      </div>
    );
  }

  const trimmed = text.trim();
  const tooLong = trimmed.length > MAX_LENGTH;
  const canSend = trimmed.length > 0 && !tooLong && !send.isPending;
  const submit = () => {
    if (canSend) send.mutate({ text: trimmed });
  };
  const error = tooLong
    ? `Maksimal ${MAX_LENGTH} karakter (sekarang ${trimmed.length}).`
    : send.error
      ? (send.error.fields.text ?? send.error.message)
      : null;

  return (
    <form
      className="w-full space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Label htmlFor={fieldId}>Balas sebagai admin</Label>
      <Textarea
        id={fieldId}
        value={text}
        rows={3}
        placeholder="Tulis balasan untuk klien"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${fieldId}-hint${error ? ` ${fieldId}-error` : ""}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {error && (
        <p id={`${fieldId}-error`} role="alert" className="flex items-center gap-1 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
          Dikirim dari nomor WhatsApp studio.<span className="max-md:hidden"> Ctrl/⌘ + Enter untuk kirim.</span>
        </p>
        <Button type="submit" size="sm" className="ml-auto max-md:h-11 max-md:px-4" disabled={!canSend}>
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          {send.isPending ? "Mengirim" : "Kirim"}
        </Button>
      </div>
    </form>
  );
}

export function ChatHistory({ intake }: { intake: WaIntakeDetail }) {
  const { messages } = intake;
  const human = intake.conversation.mode === "HUMAN";
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;

  // Pesan terbaru di bawah: gulir ke akhir saat dibuka, saat ada pesan baru, dan saat
  // kolom balas muncul/hilang (tinggi daftar berubah).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, human]);

  return (
    <Card className="flex max-h-[720px] flex-col">
      <CardHeader>
        <CardTitle>Riwayat chat</CardTitle>
        <CardDescription>
          {human
            ? "Ditangani admin. Bot tidak membalas sampai chat dikembalikan ke bot."
            : "Bot sedang melayani klien. Ambil alih untuk membalas sendiri."}
        </CardDescription>
        <CardAction>
          <ModeButton intake={intake} />
        </CardAction>
      </CardHeader>
      <CardContent ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada pesan.</p>
        ) : (
          <ol className="space-y-3">
            {messages.map((m) => {
              const outbound = m.direction === "OUTBOUND";
              const failed = m.deliveryStatus === "failed";
              return (
                <li key={m.id} className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
                      outbound ? "bg-muted" : "bg-background",
                      failed && "border-destructive/60",
                    )}
                  >
                    <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <SenderLabel m={m} />
                      <span aria-hidden="true">·</span>
                      <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
                    </p>
                    {m.type === "image" ? (
                      m.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- presigned URL privat berumur pendek, tidak lewat optimizer
                        <img src={m.imageUrl} alt={m.body || "Gambar dari klien"} className="max-h-48 rounded border" />
                      ) : (
                        <p className="italic text-muted-foreground">[gambar tidak tersedia]</p>
                      )
                    ) : null}
                    {m.type === "unsupported" ? (
                      <p className="italic text-muted-foreground">[pesan suara/video/dokumen]</p>
                    ) : (
                      m.body && <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
                    )}
                    {failed && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                        Gagal terkirim{m.errorCode ? ` (${m.errorCode})` : ""}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
      {human && (
        // Tanpa latar muted bawaan: teks bantuan abu-abu tetap ≥4.5:1 di atas putih.
        <CardFooter className="bg-transparent">
          <Composer intake={intake} />
        </CardFooter>
      )}
    </Card>
  );
}
