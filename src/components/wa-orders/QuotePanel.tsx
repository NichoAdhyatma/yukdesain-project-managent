"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "./labels";
import { PricingRulesNotice } from "./OwnerNotes";
import type { WaIntakeDetail } from "./types";
import { useIntakeAction } from "./use-intake-action";

export function QuotePanel({ intake }: { intake: WaIntakeDetail }) {
  const requote = intake.status === "QUOTED";
  // Harga belum pernah disimpan: isi awal dari katalog Layanan (paket/unit di brief). Admin tetap bisa mengubah.
  const suggested = intake.quote.agreedPrice === null ? intake.quote.suggested : null;
  const [price, setPrice] = useState<number>(intake.quote.agreedPrice ?? suggested?.total ?? 0);
  const [deadline, setDeadline] = useState<Date | undefined>(
    intake.quote.deadline ? new Date(intake.quote.deadline) : undefined,
  );
  const quote = useIntakeAction<{ agreedPrice: number; deadline: string }>(intake.id, "/quote", "POST", {
    successMessage: requote ? "Invoice direvisi" : "Harga disimpan",
    onSuccess: (data) => {
      // Meta di luar 24 jam: klien baru menerima template pembuka; invoice lengkap + QRIS terkirim otomatis saat klien membalas.
      if (data.delivery?.ok && data.delivery.via === "template") {
        toast("Klien di luar 24 jam: baru pesan pembuka yang terkirim. Invoice lengkap dan QRIS dikirim otomatis saat klien membalas.", "error");
        return;
      }
      const failed = data.delivery?.qrisFailed ?? 0;
      if (failed > 0) toast(`${failed} gambar QRIS belum terkirim ke klien. Kirim manual dari chat.`, "error");
    },
  });
  const fields = quote.error?.fields ?? {};
  // Hanya pratinjau; DP final dihitung server dengan persen Operasional yang sama.
  const dpPercent = intake.dpPercentForNewQuote;
  const dpPreview = price > 0 ? Math.ceil((price * dpPercent) / 100) : null;
  const startingPrice = intake.service?.startingPrice || null;
  const mulai = intake.service?.priceMode === "STARTING" ? "mulai " : "";
  const helpIds = [suggested && "quote-price-katalog", startingPrice && "quote-price-patokan"].filter(Boolean).join(" ") || undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{requote ? "Revisi harga & deadline" : "Beri harga & deadline"}</CardTitle>
        <CardDescription>
          {requote
            ? "Invoice baru (nomor sama) dikirim ulang ke klien. Klien belum mengirim bukti transfer."
            : "Brief sudah dikonfirmasi klien. Setelah disimpan, klien menerima invoice beserta semua metode bayar aktif."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!deadline) return;
            quote.mutate({ agreedPrice: price, deadline: format(deadline, "yyyy-MM-dd") });
          }}
        >
          <PricingRulesNotice rules={intake.pricingRulesApplied} />
          {intake.activePaymentMethods === 0 ? (
            <div role="alert" className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              <p>
                Belum ada metode bayar aktif di Pengaturan. Invoice tetap terkirim dengan kalimat &quot;Metode pembayaran akan
                dikirim tim kami&quot;, jadi kirim rekening ke klien secara manual.
              </p>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quote-price">Harga</Label>
              <CurrencyInput
                id="quote-price"
                value={price}
                onChange={setPrice}
                placeholder="Rp0"
                aria-describedby={helpIds}
              />
              {suggested ? (
                <p id="quote-price-katalog" className="text-xs text-muted-foreground">
                  Terisi dari katalog: <span className="tabular-nums">{suggested.breakdown}</span>. Periksa lagi sebelum menyimpan.
                </p>
              ) : null}
              {/* Patokan dari menu Layanan (docs/SERVICES_CATALOG.md): bot mungkin sudah menyebutnya ke klien. */}
              {startingPrice ? (
                <p id="quote-price-patokan" className="text-xs text-muted-foreground">
                  Patokan layanan: {mulai}
                  <span className="tabular-nums">{formatRupiah(startingPrice)}</span>
                  {intake.service?.priceNote ? ` (${intake.service.priceNote})` : ""}
                </p>
              ) : null}
              {fields.agreedPrice && <p className="text-sm text-destructive">{fields.agreedPrice}</p>}
            </div>
            <div className="space-y-2">
              <Label>Deadline</Label>
              <DatePicker value={deadline} onChange={setDeadline} placeholder="Pilih deadline" />
              {fields.deadline && <p className="text-sm text-destructive">{fields.deadline}</p>}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            DP {dpPercent}%: <span className="font-medium tabular-nums text-foreground">{formatRupiah(dpPreview)}</span>
          </p>
          <div className="flex justify-end">
            <Button type="submit" disabled={quote.isPending || price <= 0 || !deadline}>
              {quote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {requote ? "Kirim invoice revisi" : "Simpan & kirim invoice"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
