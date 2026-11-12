"use client";

import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { formatSameDayCutoff, formatWorkingHours, studioOperationsSchema, type StudioOperations } from "@/lib/studio-operations-rules";
import {
  OPERATIONS_QUERY_KEY,
  OperationsSaveError,
  fetchOperations,
  saveOperations,
  type OperationsFieldErrors,
} from "./operations-api";

// Form Operasional studio (docs/STUDIO_OPERATIONS.md). Angka disimpan sebagai teks selama diketik supaya kolom
// boleh kosong sementara; dikonversi dan divalidasi saat Simpan (skema yang sama dengan server).

type Draft = Omit<StudioOperations, "dpPercent" | "revisionQuota"> & { dpPercent: string; revisionQuota: string };

const DAYS = [
  { value: 1, short: "Sen", label: "Senin" },
  { value: 2, short: "Sel", label: "Selasa" },
  { value: 3, short: "Rab", label: "Rabu" },
  { value: 4, short: "Kam", label: "Kamis" },
  { value: 5, short: "Jum", label: "Jumat" },
  { value: 6, short: "Sab", label: "Sabtu" },
  { value: 7, short: "Min", label: "Minggu" },
];

const toDraft = (ops: StudioOperations): Draft => ({ ...ops, dpPercent: String(ops.dpPercent), revisionQuota: String(ops.revisionQuota) });
const toNumber = (text: string) => (text.trim() === "" ? Number.NaN : Number(text));
const fromDraft = (d: Draft) => ({ ...d, dpPercent: toNumber(d.dpPercent), revisionQuota: toNumber(d.revisionQuota) });

export function OperationsForm() {
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({ queryKey: OPERATIONS_QUERY_KEY, queryFn: fetchOperations });

  if (isLoading) {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <CardTitle>Operasional studio</CardTitle>
          <CardDescription>Memuat pengaturan…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-40 w-full animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Operasional studio</CardTitle>
          <CardDescription>Pengaturan tidak bisa dimuat. Periksa koneksi, lalu coba lagi.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="max-md:h-11" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    );
  }
  // key: form diisi ulang dari data server setelah tersimpan
  return <OperationsEditor key={JSON.stringify(data)} saved={data} />;
}

function OperationsEditor({ saved }: { saved: StudioOperations }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(saved));
  const [errors, setErrors] = useState<OperationsFieldErrors>({});
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved));

  // Perubahan belum disimpan: peringatan browser saat menutup / memuat ulang, dan konfirmasi saat pindah lewat link
  // di dalam portal (menu sidebar memakai <a>, navigasi klien Next.js tidak memicu beforeunload).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const confirmLeave = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      if (anchor.pathname === window.location.pathname) return;
      if (!window.confirm("Perubahan operasional belum disimpan. Tinggalkan halaman ini?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", confirmLeave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", confirmLeave, true);
    };
  }, [dirty]);

  const save = useMutation({
    mutationFn: saveOperations,
    onSuccess: (next) => {
      setErrors({});
      queryClient.setQueryData(OPERATIONS_QUERY_KEY, next);
      toast("Operasional studio disimpan. Berlaku untuk order dan project baru.", "success");
    },
    onError: (error) => {
      const fields = error instanceof OperationsSaveError ? error.fields : {};
      setErrors(fields);
      toast(Object.keys(fields).length ? "Periksa kembali isian yang ditandai" : error.message, "error");
    },
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = studioOperationsSchema.safeParse(fromDraft(draft));
    if (!parsed.success) {
      const fields: OperationsFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof StudioOperations;
        // Angka kosong / bukan angka → pesan yang jelas, bukan "expected number".
        const message = issue.code === "invalid_type" ? "Wajib diisi dengan angka" : issue.message;
        (fields[key] ??= []).push(message);
      }
      setErrors(fields);
      document.getElementById(`ops-${Object.keys(fields)[0]}`)?.focus();
      toast("Periksa kembali isian yang ditandai", "error");
      return;
    }
    save.mutate(parsed.data);
  };

  const preview = studioOperationsSchema.safeParse(fromDraft(draft));

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Pembayaran</CardTitle>
          <CardDescription>
            Dipakai untuk menghitung DP saat admin mengisi harga di Order WA. Order yang sudah diberi harga tetap memakai persen
            lamanya.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field id="ops-dpPercent" label="DP sebelum pengerjaan" help="Persen dari harga, 10 sampai 100." errors={errors.dpPercent}>
            {(props) => (
              <div className="flex items-center gap-2">
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={100}
                  className="w-24 tabular-nums max-md:h-11"
                  value={draft.dpPercent}
                  onChange={(e) => set("dpPercent", e.target.value)}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            )}
          </Field>
          <Field
            id="ops-settlementNote"
            label="Catatan pelunasan"
            help="Dikutip bot apa adanya ke klien. Maksimal 200 karakter."
            errors={errors.settlementNote}
          >
            {(props) => (
              <Textarea {...props} rows={2} maxLength={200} value={draft.settlementNote} onChange={(e) => set("settlementNote", e.target.value)} />
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revisi</CardTitle>
          <CardDescription>Kuota disimpan per project saat project dibuat. Project yang sudah berjalan tidak ikut berubah.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field id="ops-revisionQuota" label="Revisi gratis per project" help="0 sampai 10 kali." errors={errors.revisionQuota}>
            {(props) => (
              <div className="flex items-center gap-2">
                <Input
                  {...props}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10}
                  className="w-24 tabular-nums max-md:h-11"
                  value={draft.revisionQuota}
                  onChange={(e) => set("revisionQuota", e.target.value)}
                />
                <span className="text-sm text-muted-foreground">kali</span>
              </div>
            )}
          </Field>
          <Field
            id="ops-revisionNotice"
            label="Peringatan saat mengajukan revisi"
            help="Tampil di portal klien dan disampaikan bot apa adanya. Maksimal 300 karakter."
            errors={errors.revisionNotice}
          >
            {(props) => (
              <Textarea {...props} rows={3} maxLength={300} value={draft.revisionNotice} onChange={(e) => set("revisionNotice", e.target.value)} />
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jam kerja desainer</CardTitle>
          <CardDescription>
            Waktu WIB. Bot menyebut jam ini saat klien menanyakan progres, revisi, atau kapan desainnya dikerjakan. Chat tetap
            dibalas bot di luar jam kerja.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <fieldset aria-describedby={errors.workingDays ? "ops-workingDays-error" : undefined}>
            <legend className="mb-2 text-sm font-medium text-foreground">Hari kerja</legend>
            <div className="flex flex-wrap gap-2" id="ops-workingDays" tabIndex={-1}>
              {DAYS.map((day) => {
                const on = draft.workingDays.includes(day.value);
                return (
                  <Button
                    key={day.value}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    aria-label={day.label}
                    className="min-w-12 max-md:h-11"
                    onClick={() =>
                      set(
                        "workingDays",
                        on ? draft.workingDays.filter((d) => d !== day.value) : [...draft.workingDays, day.value].sort((a, b) => a - b),
                      )
                    }
                  >
                    {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    {day.short}
                  </Button>
                );
              })}
            </div>
            <FieldErrors id="ops-workingDays-error" errors={errors.workingDays} />
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ops-workingHoursStart" label="Mulai" errors={errors.workingHoursStart}>
              {(props) => (
                <Input
                  {...props}
                  type="time"
                  className="w-32 tabular-nums max-md:h-11"
                  value={draft.workingHoursStart}
                  onChange={(e) => set("workingHoursStart", e.target.value)}
                />
              )}
            </Field>
            <Field id="ops-workingHoursEnd" label="Selesai" errors={errors.workingHoursEnd}>
              {(props) => (
                <Input
                  {...props}
                  type="time"
                  className="w-32 tabular-nums max-md:h-11"
                  value={draft.workingHoursEnd}
                  onChange={(e) => set("workingHoursEnd", e.target.value)}
                />
              )}
            </Field>
          </div>

          <Field
            id="ops-sameDayCutoff"
            label="Batas order masuk jadwal hari ini"
            help="Order yang masuk sebelum jam ini pada hari kerja bisa masuk jadwal hari itu; setelahnya dihitung hari kerja berikutnya. Bot tidak menjanjikan dikerjakan hari yang sama."
            errors={errors.sameDayCutoff}
          >
            {(props) => (
              <Input
                {...props}
                type="time"
                className="w-32 tabular-nums max-md:h-11"
                value={draft.sameDayCutoff}
                onChange={(e) => set("sameDayCutoff", e.target.value)}
              />
            )}
          </Field>

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yang dibaca bot</CardTitle>
          <CardDescription>Ringkasan kebijakan yang masuk ke panduan bot setelah disimpan.</CardDescription>
        </CardHeader>
        <CardContent>
          {preview.success ? (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-foreground">
              <li>Pengerjaan dimulai setelah DP dibayar sesuai invoice dari tim. {preview.data.settlementNote}</li>
              <li>
                {preview.data.revisionQuota > 0
                  ? `Revisi gratis ${preview.data.revisionQuota}x per project lewat link portal; di atasnya dialihkan ke admin.`
                  : "Tidak ada revisi gratis; permintaan revisi dialihkan ke admin."}
              </li>
              <li>Jam kerja tim desain: {formatWorkingHours(preview.data)}.</li>
              <li>
                Order yang masuk sebelum {formatSameDayCutoff(preview.data)} pada hari kerja dapat masuk jadwal hari itu; setelahnya dihitung hari
                kerja berikutnya. Minggu dan tanggal merah libur.
              </li>
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Lengkapi isian di atas untuk melihat ringkasannya.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="max-md:h-11" disabled={!dirty || save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Simpan
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-11"
            disabled={save.isPending}
            onClick={() => {
              setDraft(toDraft(saved));
              setErrors({});
            }}
          >
            Batalkan perubahan
          </Button>
        )}
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {dirty ? "Ada perubahan yang belum disimpan." : "Semua perubahan sudah tersimpan."}
        </p>
      </div>
    </form>
  );
}

type FieldControlProps = { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string };

function Field({
  id,
  label,
  help,
  errors,
  children,
}: {
  id: string;
  label: string;
  help?: string;
  errors?: string[];
  children: (props: FieldControlProps) => React.ReactNode;
}) {
  const helpId = useId();
  const errorId = `${id}-error`;
  const describedBy = [help ? helpId : null, errors?.length ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-invalid": errors?.length ? true : undefined, "aria-describedby": describedBy })}
      {help && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
      <FieldErrors id={errorId} errors={errors} />
    </div>
  );
}

function FieldErrors({ id, errors }: { id: string; errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {errors.join(" ")}
    </p>
  );
}
