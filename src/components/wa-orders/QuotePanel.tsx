"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { DP_PERCENT } from "@/lib/constants";
import { formatRupiah } from "./labels";
import type { WaIntakeDetail } from "./types";
import { useIntakeAction } from "./use-intake-action";

export function QuotePanel({ intake }: { intake: WaIntakeDetail }) {
  const requote = intake.status === "QUOTED";
  const [price, setPrice] = useState<number>(intake.quote.agreedPrice ?? 0);
  const [deadline, setDeadline] = useState<Date | undefined>(
    intake.quote.deadline ? new Date(intake.quote.deadline) : undefined,
  );
  const quote = useIntakeAction<{ agreedPrice: number; deadline: string }>(intake.id, "/quote", "POST", {
    successMessage: requote ? "Penawaran direvisi" : "Harga disimpan",
  });
  const fields = quote.error?.fields ?? {};
  // Hanya pratinjau; DP final dihitung server dengan rumus yang sama.
  const dpPreview = price > 0 ? Math.ceil((price * DP_PERCENT) / 100) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{requote ? "Revisi harga & deadline" : "Beri harga & deadline"}</CardTitle>
        <CardDescription>
          {requote
            ? "Penawaran baru dikirim ulang ke klien. Klien belum mengirim bukti transfer."
            : "Brief sudah dikonfirmasi klien. Setelah disimpan, bot mengirim penawaran beserta rekening pembayaran."}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quote-price">Harga</Label>
              <CurrencyInput id="quote-price" value={price} onChange={setPrice} placeholder="Rp0" />
              {fields.agreedPrice && <p className="text-sm text-destructive">{fields.agreedPrice}</p>}
            </div>
            <div className="space-y-2">
              <Label>Deadline</Label>
              <DatePicker value={deadline} onChange={setDeadline} placeholder="Pilih deadline" />
              {fields.deadline && <p className="text-sm text-destructive">{fields.deadline}</p>}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            DP {DP_PERCENT}%: <span className="font-medium tabular-nums text-foreground">{formatRupiah(dpPreview)}</span>
          </p>
          <div className="flex justify-end">
            <Button type="submit" disabled={quote.isPending || price <= 0 || !deadline}>
              {quote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {requote ? "Kirim penawaran baru" : "Simpan & kirim penawaran"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
