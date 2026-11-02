"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageViewer } from "@/components/ui/image-viewer";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PROOF_FLAG_LABELS, formatDateTime, formatReceiptDate, formatRupiah } from "./labels";
import type { WaIntakeDetail } from "./types";
import { useIntakeAction } from "./use-intake-action";

const CHECKLIST = [
  {
    key: "fundsReceived",
    label: "Dana sudah masuk di mutasi rekening/e-wallet studio",
    help: "Cek langsung di m-banking, bukan dari gambar bukti.",
  },
  { key: "amountMatches", label: "Nominal yang masuk sama dengan \"nominal diterima\" di atas", help: null },
  { key: "briefReviewed", label: "Brief sudah dibaca dan sesuai", help: null },
] as const;

type ChecklistKey = (typeof CHECKLIST)[number]["key"];

export function DpReviewPanel({ intake }: { intake: WaIntakeDetail }) {
  const proof = intake.proofs.find((p) => p.status === "PENDING");
  const ex = proof?.extraction ?? null;
  const [amount, setAmount] = useState<number>(ex?.amount ?? intake.quote.dpAmount ?? 0);
  const [checked, setChecked] = useState<Record<ChecklistKey, boolean>>({
    fundsReceived: false,
    amountMatches: false,
    briefReviewed: false,
  });
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const approve = useIntakeAction<{ proofId: string; verifiedAmount: number; checklist: Record<ChecklistKey, true> }>(
    intake.id,
    "/approve",
    "POST",
    { successMessage: "DP valid, project dibuat" },
  );
  const reject = useIntakeAction<{ proofId: string; reason: string }>(intake.id, "/reject", "POST", {
    successMessage: "Bukti ditolak",
    onSuccess: () => {
      setRejectOpen(false);
      setReason("");
    },
  });

  if (!proof) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verifikasi DP</CardTitle>
          <CardDescription>Tidak ada bukti transfer yang menunggu pemeriksaan.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const allChecked = CHECKLIST.every((c) => checked[c.key]);
  const overPrice = intake.quote.agreedPrice !== null && amount > intake.quote.agreedPrice;
  const belowDp = intake.quote.dpAmount !== null && amount > 0 && amount < intake.quote.dpAmount;
  const busy = approve.isPending || reject.isPending;

  const rows: [string, string][] = ex
    ? [
        ["Nominal", formatRupiah(ex.amount)],
        ["Tanggal", formatReceiptDate(ex.transferDate)],
        ["Pengirim", ex.senderName ?? "-"],
        ["Penerima", [ex.recipientName, ex.recipientAccount].filter(Boolean).join(" · ") || "-"],
        ["Bank / e-wallet", ex.bankOrWallet ?? "-"],
        ["No. referensi", ex.referenceNo ?? "-"],
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verifikasi DP</CardTitle>
        <CardDescription>
          Bukti dikirim {formatDateTime(proof.createdAt)}. DP yang ditagih{" "}
          <span className="font-medium text-foreground tabular-nums">{formatRupiah(intake.quote.dpAmount)}</span> dari harga{" "}
          <span className="tabular-nums">{formatRupiah(intake.quote.agreedPrice)}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-5 md:grid-cols-[minmax(0,220px)_1fr]">
          <div>
            {proof.imageUrl ? (
              <ImageViewer
                src={proof.imageUrl}
                alt="Bukti transfer dari klien"
                imgClassName="max-h-80 w-full rounded-lg border bg-muted/50 object-contain"
              />
            ) : (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                Gambar bukti tidak bisa ditampilkan (storage belum dikonfigurasi).
              </p>
            )}
          </div>

          <div className="space-y-4">
            {proof.flags.length > 0 && (
              <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Perlu dicek
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-6">
                  {proof.flags.map((f) => (
                    <li key={f}>{PROOF_FLAG_LABELS[f] ?? f}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-sm font-medium">Hasil baca otomatis</p>
              {ex ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Bukti tidak terbaca otomatis. Periksa gambar secara manual.</p>
              )}
              <p className="mt-1.5 text-xs text-muted-foreground">Hasil baca hanya bantuan, bukan keputusan.</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="verified-amount">Nominal diterima</Label>
          <CurrencyInput id="verified-amount" value={amount} onChange={setAmount} />
          {overPrice && <p className="text-sm text-destructive">Tidak boleh melebihi harga order.</p>}
          {belowDp && !overPrice && (
            <p className="text-sm text-amber-700 dark:text-amber-300">Nominal di bawah DP yang ditagih.</p>
          )}
          {approve.error?.fields.verifiedAmount && (
            <p className="text-sm text-destructive">{approve.error.fields.verifiedAmount}</p>
          )}
        </div>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">Checklist sebelum validasi</legend>
          {CHECKLIST.map((item) => (
            <label key={item.key} className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                checked={checked[item.key]}
                onChange={(e) => setChecked((c) => ({ ...c, [item.key]: e.target.checked }))}
              />
              <span>
                {item.label}
                {item.help && <span className="block text-xs text-muted-foreground">{item.help}</span>}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={busy} onClick={() => setRejectOpen(true)}>
            <XCircle className="h-4 w-4" />
            Tolak bukti
          </Button>
          <Button
            disabled={!allChecked || amount <= 0 || overPrice || busy}
            onClick={() =>
              approve.mutate({
                proofId: proof.id,
                verifiedAmount: amount,
                checklist: { fundsReceived: true, amountMatches: true, briefReviewed: true },
              })
            }
          >
            {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            DP valid, buat project
          </Button>
        </div>
        {!allChecked && (
          <p className="text-right text-xs text-muted-foreground">Centang semua checklist untuk memvalidasi.</p>
        )}
      </CardContent>

      <Dialog open={rejectOpen} onOpenChange={(open) => !reject.isPending && setRejectOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak bukti transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Alasan (dikirim ke klien)</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: nominal transfer kurang dari DP Rp750.000"
              rows={3}
              maxLength={500}
            />
            {reject.error?.fields.reason && <p className="text-sm text-destructive">{reject.error.fields.reason}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={reject.isPending}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || reject.isPending}
              onClick={() => reject.mutate({ proofId: proof.id, reason: reason.trim() })}
            >
              {reject.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Tolak & kirim alasan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
