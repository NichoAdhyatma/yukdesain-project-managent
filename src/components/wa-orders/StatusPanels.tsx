"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Loader2, MessageSquareX, RotateCcw, Send } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deliveryErrorText, formatDate, formatRupiah } from "./labels";
import type { WaIntakeDetail } from "./types";
import { useIntakeAction } from "./use-intake-action";

/** Pesan keluar terakhir gagal → admin perlu menghubungi klien manual. */
export function DeliveryAlert({ intake }: { intake: WaIntakeDetail }) {
  const lastOutbound = [...intake.messages].reverse().find((m) => m.direction === "OUTBOUND");
  const resend = useIntakeAction<Record<string, never>>(intake.id, "/resend", "POST", {
    successMessage: "Link dikirim ulang",
    deliveryMessages: { ok: "Kode project dan link tracking terkirim ke klien.", fail: "Link tracking gagal terkirim." },
  });
  if (!lastOutbound || lastOutbound.deliveryStatus !== "failed") return null;

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <MessageSquareX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-medium">Pesan terakhir gagal terkirim ke klien.</p>
          <p className="text-muted-foreground">
            {deliveryErrorText(lastOutbound.errorCode ?? "SEND_FAILED")} Hubungi klien manual di{" "}
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
      </div>
      {intake.status === "APPROVED" && (
        <Button variant="outline" size="sm" disabled={resend.isPending} onClick={() => resend.mutate({})}>
          {resend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Kirim ulang link
        </Button>
      )}
    </div>
  );
}

export function ApprovedPanel({ intake }: { intake: WaIntakeDetail }) {
  const approved = intake.proofs.find((p) => p.status === "APPROVED");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sudah jadi project</CardTitle>
        <CardDescription>
          DP {formatRupiah(approved?.verifiedAmount)} divalidasi. Project masuk kanban sebagai &quot;Belum Dikerjakan&quot;.
        </CardDescription>
      </CardHeader>
      {intake.project && (
        <CardContent className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            Kode project <span className="font-medium">{intake.project.projectNumber}</span>
          </span>
          <Link href="/projects" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ExternalLink className="h-4 w-4" />
            Buka Projects
          </Link>
        </CardContent>
      )}
    </Card>
  );
}

export function QuotedSummary({ intake }: { intake: WaIntakeDetail }) {
  return (
    <p className="text-sm text-muted-foreground">
      Penawaran terakhir: <span className="font-medium text-foreground tabular-nums">{formatRupiah(intake.quote.agreedPrice)}</span>
      , DP <span className="tabular-nums">{formatRupiah(intake.quote.dpAmount)}</span>, deadline {formatDate(intake.quote.deadline)}.
    </p>
  );
}

export function CancelledPanel({ intake }: { intake: WaIntakeDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Order dibatalkan</CardTitle>
        <CardDescription>{intake.cancelReason ? `Alasan: ${intake.cancelReason}` : "Tanpa alasan tercatat."}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function CollectingPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sedang konsultasi</CardTitle>
        <CardDescription>
          Bot masih menggali brief dengan klien. Harga bisa diisi setelah klien mengonfirmasi ringkasan brief.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export function CancelButton({ intake }: { intake: WaIntakeDetail }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const cancel = useIntakeAction<{ reason: string }>(intake.id, "/cancel", "POST", {
    successMessage: "Order dibatalkan",
    onSuccess: () => setOpen(false),
  });
  if (intake.status === "APPROVED" || intake.status === "CANCELLED") return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Batalkan order
      </Button>
      <Dialog open={open} onOpenChange={(o) => !cancel.isPending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan order ini?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="flex gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              Order tidak bisa diaktifkan lagi. Bukti transfer yang belum diperiksa ikut ditutup.
            </p>
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Alasan (dikirim ke klien)</Label>
              <Textarea
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={cancel.isPending}>
              Kembali
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || cancel.isPending}
              onClick={() => cancel.mutate({ reason: reason.trim() })}
            >
              {cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Batalkan & kabari klien
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
