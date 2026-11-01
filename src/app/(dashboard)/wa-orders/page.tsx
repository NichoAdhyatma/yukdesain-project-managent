"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, Loader2, RotateCcw, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_BADGE, STATUS_TABS, formatRelative, formatRupiah } from "@/components/wa-orders/labels";
import type { WaIntakeListResponse, WaIntakeStatus } from "@/components/wa-orders/types";
import { cn } from "@/lib/utils";

const EMPTY_TEXT: Record<WaIntakeStatus, string> = {
  DP_REVIEW: "Tidak ada bukti transfer yang menunggu verifikasi.",
  AWAITING_QUOTE: "Tidak ada brief yang menunggu harga.",
  QUOTED: "Tidak ada order yang menunggu pembayaran DP.",
  COLLECTING: "Belum ada klien yang sedang konsultasi lewat WhatsApp.",
  APPROVED: "Belum ada order WhatsApp yang menjadi project.",
  CANCELLED: "Tidak ada order yang dibatalkan.",
};

export default function WaOrdersPage() {
  const [status, setStatus] = useState<WaIntakeStatus>("DP_REVIEW");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<WaIntakeListResponse>({
    queryKey: ["wa-intakes", status, page],
    queryFn: async () => {
      const res = await fetch(`/api/wa-intakes?status=${status}&page=${page}&pageSize=20`);
      if (!res.ok) throw new Error("Gagal memuat order WhatsApp");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-6">
        <h1 className="text-2xl font-semibold">Order WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Brief dari asisten WhatsApp. Harga, deadline, dan validasi DP diputuskan di sini.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        <div role="group" aria-label="Filter status order" className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const count = data?.counts[tab.status] ?? 0;
            const selected = tab.status === status;
            return (
              <button
                key={tab.status}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setStatus(tab.status);
                  setPage(1);
                }}
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-xs leading-5",
                    selected
                      ? "bg-primary-foreground/20"
                      : tab.needsAction && count > 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6" aria-busy="true" aria-label="Memuat order">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : isError || !data ? (
              <div className="flex flex-col items-start gap-3 p-6">
                <p className="text-sm">Order WhatsApp tidak bisa dimuat.</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Coba lagi
                </Button>
              </div>
            ) : data.items.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">{EMPTY_TEXT[status]}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Klien</TableHead>
                      <TableHead>Layanan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Harga / DP</TableHead>
                      <TableHead>Diperbarui</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((item) => (
                      <TableRow key={item.id} className="relative">
                        <TableCell>
                          {/* Link meliputi seluruh baris (after:inset-0) supaya baris bisa diklik & difokus */}
                          <Link
                            href={`/wa-orders/${item.id}`}
                            className="font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
                          >
                            {item.clientName ?? "Tanpa nama"}
                          </Link>
                          <div className="text-xs text-muted-foreground">{item.phoneMasked}</div>
                        </TableCell>
                        <TableCell>{item.service?.name ?? "Belum dipilih"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={STATUS_BADGE[item.status].variant}>{STATUS_BADGE[item.status].label}</Badge>
                            {item.conversationMode === "HUMAN" && (
                              <Badge variant="outline" className="gap-1">
                                <UserRound className="h-3 w-3" aria-hidden="true" />
                                Ditangani admin
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.agreedPrice !== null ? (
                            <>
                              <div>{formatRupiah(item.agreedPrice)}</div>
                              <div className="text-xs text-muted-foreground">DP {formatRupiah(item.dpAmount)}</div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="whitespace-nowrap text-sm">{formatRelative(item.updatedAt)}</div>
                          {item.outsideServiceWindow && (
                            <div
                              className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"
                              title="Klien belum membalas lebih dari 24 jam; pesan berikutnya dikirim lewat template"
                            >
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              Di luar 24 jam
                              <span className="sr-only">, pesan berikutnya dikirim lewat template</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
              Sebelumnya
            </Button>
            <span className="text-sm text-muted-foreground">
              Halaman {page} dari {data.totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
              Berikutnya
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
