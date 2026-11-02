"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, Loader2, RotateCcw, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BriefSection } from "@/components/wa-orders/BriefSection";
import { ChatHistory } from "@/components/wa-orders/ChatHistory";
import { DpReviewPanel } from "@/components/wa-orders/DpReviewPanel";
import { QuotePanel } from "@/components/wa-orders/QuotePanel";
import {
  ApprovedPanel,
  CancelButton,
  CancelledPanel,
  CollectingPanel,
  DeliveryAlert,
  QuotedSummary,
} from "@/components/wa-orders/StatusPanels";
import { PROOF_FLAG_LABELS, STATUS_BADGE, formatDateTime, formatRupiah } from "@/components/wa-orders/labels";
import type { WaIntakeDetail } from "@/components/wa-orders/types";

const PROOF_STATUS: Record<string, string> = { PENDING: "Menunggu", APPROVED: "Valid", REJECTED: "Ditolak" };

export default function WaOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: intake, isLoading, isError, error, refetch, isFetching } = useQuery<WaIntakeDetail>({
    queryKey: ["wa-intake", id],
    queryFn: async () => {
      const res = await fetch(`/api/wa-intakes/${id}`);
      if (res.status === 404) throw new Error("NOT_FOUND");
      if (!res.ok) throw new Error("Gagal memuat order");
      return res.json();
    },
    // Saat admin yang membalas (HUMAN), pesan klien perlu cepat terlihat. Selain itu cukup
    // muat ulang sebelum presigned URL gambar (10 menit) kedaluwarsa.
    refetchInterval: (query) => (query.state.data?.conversation.mode === "HUMAN" ? 15_000 : 5 * 60_000),
  });

  const back = (
    <Link href="/wa-orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Order WhatsApp
    </Link>
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center" aria-busy="true">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Memuat order" />
      </div>
    );
  }

  if (isError || !intake) {
    return (
      <div className="space-y-4 p-6">
        {back}
        <p className="text-sm">
          {(error as Error | null)?.message === "NOT_FOUND" ? "Order tidak ditemukan." : "Order tidak bisa dimuat."}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RotateCcw className="h-4 w-4" />
          Coba lagi
        </Button>
      </div>
    );
  }

  const status = STATUS_BADGE[intake.status];
  const name = intake.clientName ?? intake.conversation.profileName ?? "Tanpa nama";
  const history = intake.proofs.filter((p) => p.status !== "PENDING");

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b p-6">
        {back}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={status.variant}>{status.label}</Badge>
              <span>{intake.service?.name ?? "Layanan belum dipilih"}</span>
              <span aria-hidden="true">·</span>
              <span>+{intake.conversation.waId}</span>
              {intake.conversation.mode === "HUMAN" && (
                <Badge variant="outline" className="gap-1">
                  <UserRound className="h-3 w-3" aria-hidden="true" />
                  Ditangani admin, bot tidak membalas
                </Badge>
              )}
              {intake.conversation.outsideServiceWindow && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  Di luar 24 jam
                </span>
              )}
            </div>
          </div>
          <CancelButton intake={intake} />
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-auto p-6">
        <DeliveryAlert intake={intake} />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            {intake.status === "COLLECTING" && <CollectingPanel />}
            {(intake.status === "AWAITING_QUOTE" || intake.status === "QUOTED") && (
              <div className="space-y-2">
                {intake.status === "QUOTED" && <QuotedSummary intake={intake} />}
                <QuotePanel key={`${intake.status}-${intake.quote.quotedAt}`} intake={intake} />
              </div>
            )}
            {intake.status === "DP_REVIEW" && <DpReviewPanel key={intake.proofs[0]?.id} intake={intake} />}
            {intake.status === "APPROVED" && <ApprovedPanel intake={intake} />}
            {intake.status === "CANCELLED" && <CancelledPanel intake={intake} />}

            <BriefSection intake={intake} />

            {history.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Riwayat bukti transfer</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y text-sm">
                    {history.map((p) => (
                      <li key={p.id} className="py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {formatDateTime(p.createdAt)} · {PROOF_STATUS[p.status]}
                            {p.verifiedAmount !== null && ` · ${formatRupiah(p.verifiedAmount)}`}
                          </span>
                          {p.imageUrl && (
                            <a href={p.imageUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                              Lihat gambar
                            </a>
                          )}
                        </div>
                        {p.rejectReason && <p className="text-muted-foreground">Alasan: {p.rejectReason}</p>}
                        {p.flags.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Perlu dicek: {p.flags.map((f) => PROOF_FLAG_LABELS[f] ?? f).join("; ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          <ChatHistory intake={intake} />
        </div>
      </div>
    </div>
  );
}
