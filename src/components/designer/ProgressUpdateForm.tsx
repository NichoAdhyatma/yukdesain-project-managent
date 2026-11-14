"use client";

import { useId, useRef, useState } from "react";
import { UPDATE_TEMPLATES, applyTemplate, type UpdateTemplate } from "@/lib/projects/update-templates";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Loader2, Send, Eye, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ProgressUploader, type UploadedFile } from "@/components/ui/progress-uploader";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  MAX_UPDATE_ATTACHMENTS,
  PROGRESS_PRESETS,
  latestProgress,
  parseProgress,
} from "@/lib/projects/progress-update";
import type { DesignerProject } from "./types";

/** Batas file hasil akhir (sama dengan dialog hasil akhir sebelumnya). */
const MAX_FINAL_FILES = 10;

type Payload = { description: string; progress: number | null; attachmentIds: string[]; notifyClient: boolean; final: boolean };

/** Progres 100% sebelum hasil akhir dikirim = kirim hasil akhir (satu kabar ke klien, file final terkunci sampai lunas). */
const isFinalStep = (progress: string, finalSubmitted: boolean) => {
  const p = parseProgress(progress);
  return !finalSubmitted && p.ok && p.value === 100;
};

export function ProgressUpdateForm({ project }: { project: DesignerProject }) {
  const queryClient = useQueryClient();
  const formId = useId();
  const descRef = useRef<HTMLTextAreaElement>(null);

  const previous = latestProgress(project.updates);
  const [progress, setProgress] = useState(previous === null ? "" : String(previous));
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [sent, setSent] = useState<{ progress: number | null; notified: boolean; final: boolean } | null>(null);
  // Kabari klien lewat WhatsApp (docs/CLIENT_NOTIFICATIONS.md); default menyala, desainer bisa mematikan per update.
  const [notifyClient, setNotifyClient] = useState(true);

  const parsed = parseProgress(progress);
  const progressValue = parsed.ok ? parsed.value : null;
  const descMissing = description.trim() === "";
  const finalSubmitted = !!project.finalSubmittedAt;
  const finalMode = isFinalStep(progress, finalSubmitted);
  const filesMissing = finalMode && files.length === 0;

  const mutation = useMutation({
    mutationFn: async (payload: Payload) => {
      const res = payload.final
        ? await fetch(`/api/designer/projects/${project.id}/submit-final`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: payload.description, attachmentIds: payload.attachmentIds }),
          })
        : await fetch(`/api/designer/projects/${project.id}/updates`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Gagal menyimpan update. Coba lagi.");
      }
      return res.json();
    },
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: ["designer-projects"] });
      setSent({ progress: payload.progress, notified: payload.notifyClient, final: payload.final });
      setDescription("");
      setFiles([]);
      setTriedSubmit(false);
      toast(payload.final ? "Hasil akhir terkirim ke klien" : "Update progres terkirim", "success");
    },
    onError: (err: Error) => {
      toast(err.message, "error");
    },
  });

  function edit<T>(setter: (v: T) => void) {
    return (v: T) => {
      setSent(null);
      if (mutation.isError) mutation.reset();
      setter(v);
    };
  }

  // Template pesan dari owner (lib/projects/update-templates.ts): mengisi catatan; template file final sekaligus
  // pindah ke kirim hasil akhir (100%).
  function pickTemplate(template: UpdateTemplate) {
    edit(setDescription)(applyTemplate(description, template.text));
    if (template.final && !finalSubmitted) edit(changeProgress)("100");
    requestAnimationFrame(() => descRef.current?.focus());
  }

  // Pindah antara update progres dan hasil akhir: file yang sudah diunggah beda kategori, jadi dikosongkan.
  function changeProgress(value: string) {
    if (isFinalStep(value, finalSubmitted) !== finalMode) setFiles([]);
    setProgress(value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTriedSubmit(true);
    if (!parsed.ok) return;
    if (descMissing) {
      descRef.current?.focus();
      return;
    }
    if (filesMissing) return;
    mutation.mutate({
      description: description.trim(),
      progress: parsed.value,
      attachmentIds: files.map((f) => f.id),
      notifyClient: finalMode ? true : notifyClient,
      final: finalMode,
    });
  }

  const sliderValue = progressValue ?? 0;
  const busy = mutation.isPending || uploading;
  const lowerThanBefore = previous !== null && progressValue !== null && progressValue < previous;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5" aria-labelledby={`${formId}-title`}>
      <div className="space-y-1">
        <h3 id={`${formId}-title`} className="text-base font-semibold">
          {finalMode ? "Kirim hasil akhir" : "Kirim update progres"}
        </h3>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Persen, catatan, dan lampiran ini tampil di halaman tracking klien.
        </p>
      </div>

      {/* 1. Persen progres */}
      <fieldset className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <legend className="text-sm font-medium">
            Progres pengerjaan <span className="font-normal text-muted-foreground">(opsional)</span>
          </legend>
          <p className="text-2xl font-semibold tabular-nums leading-none" aria-hidden>
            {progressValue === null ? "–" : `${progressValue}%`}
          </p>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={sliderValue}
          onChange={(e) => edit(changeProgress)(e.target.value)}
          aria-label="Geser untuk mengatur progres"
          aria-valuetext={progressValue === null ? "Belum diisi" : `${progressValue} persen`}
          className={cn(
            "h-11 w-full cursor-pointer accent-primary",
            progressValue === null && "opacity-60"
          )}
          disabled={mutation.isPending}
        />

        <div className="flex flex-wrap items-center gap-2">
          {PROGRESS_PRESETS.map((p) => (
            <Button
              key={p}
              type="button"
              variant={progressValue === p ? "default" : "outline"}
              aria-pressed={progressValue === p}
              onClick={() => edit(changeProgress)(String(p))}
              disabled={mutation.isPending}
              className="h-11 min-w-14 tabular-nums md:h-9"
            >
              {p}%
            </Button>
          ))}
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`${formId}-pct`} className="sr-only">
              Progres dalam persen
            </Label>
            <Input
              id={`${formId}-pct`}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => edit(changeProgress)(e.target.value)}
              placeholder="0–100"
              aria-invalid={!parsed.ok}
              aria-describedby={`${formId}-pct-help`}
              disabled={mutation.isPending}
              className="h-11 w-20 text-base tabular-nums md:h-9 md:text-sm"
            />
            <span className="text-sm text-muted-foreground" aria-hidden>
              %
            </span>
          </div>
          {progress !== "" && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => edit(changeProgress)("")}
              disabled={mutation.isPending}
              className="h-11 text-muted-foreground md:h-9"
            >
              Kosongkan
            </Button>
          )}
        </div>

        <p
          id={`${formId}-pct-help`}
          className={cn("text-xs", parsed.ok ? "text-muted-foreground" : "text-destructive")}
          role={parsed.ok ? undefined : "alert"}
        >
          {!parsed.ok
            ? parsed.error
            : previous === null
              ? "Belum pernah diisi. Kosongkan kalau update ini tidak mengubah progres."
              : lowerThanBefore
                ? `Lebih kecil dari progres terakhir (${previous}%). Pastikan memang begitu.`
                : `Progres terakhir: ${previous}%.`}
        </p>
      </fieldset>

      {finalMode && (
        <div role="note" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Flag className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium">Progres 100% dikirim sebagai hasil akhir</p>
            <p className="text-xs">
              Klien dikabari sekali lewat WhatsApp, lalu bisa approve atau minta revisi. File hasil akhir baru bisa diunduh
              klien setelah pelunasan dicatat admin. Hasil akhir hanya dikirim sekali, pastikan sudah final.
            </p>
          </div>
        </div>
      )}

      {/* 2. Catatan */}
      <div className="space-y-2">
        <Label htmlFor={`${formId}-desc`}>
          {finalMode ? "Catatan hasil akhir" : "Catatan"} <span className="text-destructive" aria-hidden>*</span>
          <span className="sr-only">(wajib)</span>
        </Label>
        <div role="group" aria-labelledby={`${formId}-tpl`} className="space-y-1.5">
          <p id={`${formId}-tpl`} className="text-xs text-muted-foreground">
            Pakai template pesan:
          </p>
          <div className="flex flex-wrap gap-2">
            {UPDATE_TEMPLATES.filter((t) => !(t.final && finalSubmitted)).map((t) => (
              <Button
                key={t.id}
                type="button"
                variant="outline"
                onClick={() => pickTemplate(t)}
                disabled={mutation.isPending}
                className="h-11 px-3 text-xs md:h-9"
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
        <Textarea
          ref={descRef}
          id={`${formId}-desc`}
          value={description}
          onChange={(e) => edit(setDescription)(e.target.value)}
          placeholder={finalMode ? "Contoh: Logo final format AI, PNG, dan PDF." : "Contoh: Sketsa logo selesai, lanjut pilih warna."}
          rows={6}
          required
          aria-invalid={triedSubmit && descMissing}
          aria-describedby={`${formId}-desc-help`}
          disabled={mutation.isPending}
          className="text-base md:text-sm"
        />
        <p
          id={`${formId}-desc-help`}
          className={cn("text-xs", triedSubmit && descMissing ? "text-destructive" : "text-muted-foreground")}
          role={triedSubmit && descMissing ? "alert" : undefined}
        >
          {triedSubmit && descMissing
            ? "Tulis catatan singkat tentang apa yang sudah dikerjakan."
            : finalMode
              ? "Jelaskan file yang dikirim, misalnya format dan ukurannya."
              : "Tulis apa yang sudah dikerjakan dan langkah berikutnya."}
        </p>
      </div>

      {/* 3. Lampiran */}
      <div className="space-y-2">
        <ProgressUploader
          key={finalMode ? "final" : "progress"}
          files={files}
          onChange={edit(setFiles)}
          onUploadingChange={setUploading}
          maxFiles={finalMode ? MAX_FINAL_FILES : MAX_UPDATE_ATTACHMENTS}
          label={finalMode ? "File hasil akhir (wajib)" : "Lampiran (opsional)"}
          hint={
            finalMode
              ? `Maksimal ${MAX_FINAL_FILES} file, misalnya AI, PDF, dan PNG resolusi penuh.`
              : "Satu file per update, misalnya pratinjau desain."
          }
          disabled={mutation.isPending}
          uploadCategory={finalMode ? "final" : "progress"}
          projectId={project.id}
        />
        {triedSubmit && filesMissing && (
          <p role="alert" className="text-xs text-destructive">
            Lampirkan minimal satu file hasil akhir.
          </p>
        )}
      </div>

      {/* 4. Kabari klien (hasil akhir selalu dikabarkan) */}
      {!finalMode && (
      <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor={`${formId}-notify`} className="text-sm font-medium">
            Kabari klien lewat WhatsApp
          </Label>
          <p id={`${formId}-notify-help`} className="text-xs text-muted-foreground">
            Klien menerima pesan berisi persen dan catatan ini. Beberapa update dalam 1 jam digabung jadi satu pesan.
          </p>
        </div>
        <Switch
          id={`${formId}-notify`}
          checked={notifyClient}
          onCheckedChange={edit(setNotifyClient)}
          aria-describedby={`${formId}-notify-help`}
          disabled={mutation.isPending}
          className="mt-1"
        />
      </div>
      )}

      {/* 5. Kirim */}
      <div className="space-y-3 border-t pt-4">
        {mutation.isError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">Update belum terkirim</p>
              <p className="text-xs">{mutation.error.message} Isian kamu masih tersimpan di form.</p>
            </div>
          </div>
        )}
        {sent && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              {sent.final
                ? "Hasil akhir terkirim dan tampil di halaman tracking klien. Kabar ke klien lewat WhatsApp diproses."
                : `Update terkirim${sent.progress !== null ? ` dengan progres ${sent.progress}%` : ""}. Sudah masuk ke riwayat di bawah${
                    sent.notified ? ". Kabar ke klien lewat WhatsApp diproses." : "."
                  }`}
            </p>
          </div>
        )}
        <Button type="submit" disabled={busy} className="h-11 w-full text-sm md:w-auto md:px-5">
          {mutation.isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden /> Mengirim…
            </>
          ) : uploading ? (
            <>
              <Loader2 className="animate-spin" aria-hidden /> Menunggu file selesai diunggah…
            </>
          ) : finalMode ? (
            <>
              <CheckCircle2 aria-hidden /> Kirim hasil akhir
            </>
          ) : (
            <>
              <Send aria-hidden /> Kirim update
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
