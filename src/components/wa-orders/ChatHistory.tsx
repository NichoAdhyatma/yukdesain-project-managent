"use client";

import { AlertCircle, Bot, Send, UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDateTime } from "./labels";
import type { WaIntakeDetail } from "./types";

export function ChatHistory({ intake }: { intake: WaIntakeDetail }) {
  const { messages } = intake;
  return (
    <Card className="flex max-h-[720px] flex-col">
      <CardHeader>
        <CardTitle>Riwayat chat</CardTitle>
        <CardDescription>Hanya dibaca. Untuk membalas manual, gunakan WhatsApp Business.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
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
                      {outbound ? (
                        m.sentByBot ? (
                          <>
                            <Bot className="h-3 w-3" aria-hidden="true" />
                            Bot
                          </>
                        ) : (
                          <>
                            <Send className="h-3 w-3" aria-hidden="true" />
                            {m.type === "template" ? "Pesan sistem (template)" : "Pesan sistem"}
                          </>
                        )
                      ) : (
                        <>
                          <UserRound className="h-3 w-3" aria-hidden="true" />
                          Klien
                        </>
                      )}
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
    </Card>
  );
}
