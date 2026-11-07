"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Nomor WhatsApp owner yang login (docs/WHATSAPP_OWNER_COMMANDS.md §3).

const QUERY_KEY = ["settings", "whatsapp", "owner-number"];

// 6281234567890 → 0812-3456-7890 (tampilan saja)
const display = (n: string | null) => (n ? `0${n.slice(2)}`.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3") : "");

export function OwnerNumberCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<{ waNumber: string | null }>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/settings/whatsapp/owner-number");
      if (!res.ok) throw new Error("Gagal memuat nomor owner");
      return res.json();
    },
  });
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- sinkronisasi form dari data server */
  useEffect(() => {
    if (data) setValue(display(data.waNumber));
  }, [data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useMutation({
    mutationFn: async (waNumber: string | null) => {
      const res = await fetch("/api/settings/whatsapp/owner-number", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waNumber }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.fields?.waNumber ?? "Gagal menyimpan nomor");
      return body as { waNumber: string | null };
    },
    onSuccess: (next) => {
      queryClient.setQueryData(QUERY_KEY, next);
      setError(null);
      toast(next.waNumber ? "Nomor WhatsApp owner disimpan" : "Nomor WhatsApp owner dihapus", "success");
    },
    onError: (e) => setError((e as Error).message),
  });

  if (isLoading) {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <CardTitle>Nomor WhatsApp owner</CardTitle>
          <CardDescription>Memuat…</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nomor WhatsApp owner</CardTitle>
          <CardDescription>Nomor tidak bisa dimuat.</CardDescription>
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

  const dirty = value.trim() !== display(data.waNumber);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nomor WhatsApp owner</CardTitle>
        <CardDescription>
          Chat dari nomor ini ke nomor bot dianggap instruksi owner: bot merangkumnya jadi aturan dan meminta Anda
          membalas YA sebelum berlaku. Bot juga mengirim pertanyaan klien di luar katalog ke nomor ini. Gunakan nomor
          pribadi Anda, bukan nomor bot. Untuk mencoba order seperti klien dari nomor ini, kirim <strong>#klien</strong>;
          kirim <strong>#owner</strong> untuk kembali memberi instruksi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(value.trim() || null);
          }}
        >
          <Label htmlFor="wa-owner-number">Nomor WhatsApp saya</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="wa-owner-number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="0812-3456-7890"
              aria-invalid={!!error}
              aria-describedby="wa-owner-number-help"
              className="sm:max-w-xs"
            />
            <Button type="submit" disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {value.trim() ? "Simpan nomor" : "Hapus nomor"}
            </Button>
          </div>
          <p id="wa-owner-number-help" className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {error ??
              (data.waNumber
                ? "Tersimpan. Hanya Anda yang bisa mengubah nomor ini."
                : "Belum diisi: instruksi lewat WhatsApp dan pertanyaan luar katalog belum aktif.")}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
