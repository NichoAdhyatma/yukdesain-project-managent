"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, History, Loader2, Plus, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Panduan bot dari owner (docs/WHATSAPP_BOT_GUIDE.md): draft → Uji bot → terbitkan.

type Guide = { instructions: string; faqs: { question: string; answer: string }[] };
type GuideResponse = {
  draft: Guide;
  published: { version: number; publishedAt: string } | null;
  hasUnpublishedChanges: boolean;
  versions: { version: number; publishedAt: string; publishedBy: string | null; instructionsLength: number; faqCount: number }[];
  limits: { instructionsMaxChars: number; faqMaxItems: number; faqQuestionMaxChars: number; faqAnswerMaxChars: number };
};

// FAQ di form butuh key stabil (urutan bisa berubah saat dihapus).
type FormFaq = { key: number; question: string; answer: string };
type FormState = { instructions: string; faqs: FormFaq[] };

export const GUIDE_QUERY_KEY = ["settings", "whatsapp", "guide"];

class GuideApiError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function request(url: string, init?: RequestInit): Promise<GuideResponse> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new GuideApiError(body.message ?? "Permintaan gagal", body.fields);
  return body;
}

const formatDateTime = (d: string) =>
  new Date(d).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

function Counter({ value, max, id }: { value: number; max: number; id?: string }) {
  return (
    <span id={id} className={cn("tabular-nums", value > max ? "text-destructive" : "text-muted-foreground")}>
      {value.toLocaleString("id-ID")} / {max.toLocaleString("id-ID")}
    </span>
  );
}

export function BotGuideCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery<GuideResponse>({
    queryKey: GUIDE_QUERY_KEY,
    queryFn: () => request("/api/settings/whatsapp/guide"),
  });

  const nextKey = useRef(0);
  const toForm = (g: Guide): FormState => ({
    instructions: g.instructions,
    faqs: g.faqs.map((f) => ({ key: nextKey.current++, ...f })),
  });
  const toGuide = (f: FormState): Guide => ({
    instructions: f.instructions.trim(),
    faqs: f.faqs.map(({ question, answer }) => ({ question: question.trim(), answer: answer.trim() })),
  });

  const [form, setForm] = useState<FormState>({ instructions: "", faqs: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const newestFaqQuestion = useRef<HTMLInputElement | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- sinkronisasi form dari data server */
  useEffect(() => {
    if (data) setForm(toForm(data.draft));
  }, [data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const dirty = data ? JSON.stringify(toGuide(form)) !== JSON.stringify(data.draft) : false;

  const onSaved = (next: GuideResponse) => {
    queryClient.setQueryData(GUIDE_QUERY_KEY, next);
    setErrors({});
  };
  const onFailed = (error: Error, fallback: string) => {
    const fields = error instanceof GuideApiError ? error.fields : {};
    setErrors(fields);
    toast(Object.keys(fields).length ? "Periksa kembali isian yang ditandai" : error.message || fallback, "error");
  };

  const save = useMutation({
    mutationFn: () => request("/api/settings/whatsapp/guide", { method: "PUT", body: JSON.stringify(toGuide(form)) }),
    onSuccess: (next) => {
      onSaved(next);
      toast("Draft panduan disimpan. Coba di Uji bot sebelum diterbitkan.", "success");
    },
    onError: (e) => onFailed(e, "Gagal menyimpan draft"),
  });

  // Perubahan yang belum disimpan ikut disimpan dulu, supaya yang terbit = yang terlihat.
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) onSaved(await request("/api/settings/whatsapp/guide", { method: "PUT", body: JSON.stringify(toGuide(form)) }));
      return request("/api/settings/whatsapp/guide/publish", { method: "POST" });
    },
    onSuccess: (next) => {
      onSaved(next);
      setConfirmPublish(false);
      toast(`Panduan versi ${next.published?.version} aktif untuk klien`, "success");
    },
    onError: (e) => {
      setConfirmPublish(false);
      onFailed(e, "Gagal menerbitkan panduan");
    },
  });

  const restore = useMutation({
    mutationFn: (version: number) =>
      request("/api/settings/whatsapp/guide/restore", { method: "POST", body: JSON.stringify({ version }) }),
    onSuccess: (next, version) => {
      onSaved(next);
      toast(`Versi ${version} disalin ke draft. Terbitkan untuk memakainya lagi.`, "success");
    },
    onError: (e) => onFailed(e, "Gagal memulihkan versi"),
  });

  if (isLoading) {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <CardTitle>Panduan bot</CardTitle>
          <CardDescription>Memuat panduan…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-28 w-full animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Panduan bot</CardTitle>
          <CardDescription>Panduan tidak bisa dimuat.</CardDescription>
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

  const { limits } = data;
  const busy = save.isPending || publish.isPending || restore.isPending;
  const canPublish = (dirty || data.hasUnpublishedChanges) && !busy;
  const nextVersion = (data.published?.version ?? 0) + 1;

  const setFaq = (key: number, patch: Partial<FormFaq>) =>
    setForm((f) => ({ ...f, faqs: f.faqs.map((q) => (q.key === key ? { ...q, ...patch } : q)) }));
  const clearError = (field: string) => {
    if (!errors[field]) return;
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Panduan bot</CardTitle>
          {data.published ? (
            <Badge variant="secondary">Versi {data.published.version} aktif</Badge>
          ) : (
            <Badge variant="outline">Belum ada versi terbit</Badge>
          )}
        </div>
        <CardDescription>
          Aturan tambahan dan jawaban FAQ yang dipakai bot saat membalas klien. Perubahan disimpan sebagai draft dan
          bisa dicoba di Uji bot; klien baru mendapatkannya setelah diterbitkan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            Panduan tidak bisa membuat bot menyebut harga atau lama pengerjaan sebelum admin mengisinya, menawar harga,
            menyatakan DP valid, atau membahas topik di luar YukDesain. Aturan itu dijaga sistem.
          </p>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <Label htmlFor="wa-guide-instructions">Aturan tambahan</Label>
              <Counter id="wa-guide-instructions-count" value={form.instructions.length} max={limits.instructionsMaxChars} />
            </div>
            <Textarea
              id="wa-guide-instructions"
              rows={6}
              maxLength={limits.instructionsMaxChars}
              value={form.instructions}
              onChange={(e) => {
                setForm((f) => ({ ...f, instructions: e.target.value }));
                clearError("instructions");
              }}
              placeholder={"Misalnya: jam balas admin, cara menanggapi klien yang bingung soal gaya desain, atau hal yang wajib ditanyakan sebelum brief dianggap lengkap."}
              aria-invalid={!!errors.instructions}
              aria-describedby="wa-guide-instructions-help wa-guide-instructions-count"
            />
            <p id="wa-guide-instructions-help" className={errors.instructions ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {errors.instructions ?? "Tulis seperti memberi arahan ke staf baru: kebiasaan studio, jam layanan, hal yang perlu ditanyakan."}
            </p>
          </div>

          <Separator />

          <fieldset className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <legend className="text-sm font-medium">FAQ</legend>
              <span className="text-sm text-muted-foreground tabular-nums">
                {form.faqs.length} / {limits.faqMaxItems}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Jika klien menanyakan hal yang mirip, bot menjawab sesuai isi jawaban di sini.
            </p>

            {form.faqs.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Belum ada FAQ.</p>
            ) : (
              <ol className="space-y-4">
                {form.faqs.map((faq, index) => {
                  const qErr = errors[`faqs.${index}.question`];
                  const aErr = errors[`faqs.${index}.answer`];
                  return (
                    <li key={faq.key} className="space-y-3 rounded-lg border p-3 sm:p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">FAQ {index + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setForm((f) => ({ ...f, faqs: f.faqs.filter((q) => q.key !== faq.key) }));
                            setErrors({});
                          }}
                          aria-label={`Hapus FAQ ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          <span className="hidden sm:inline">Hapus</span>
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`wa-faq-q-${faq.key}`}>Pertanyaan</Label>
                        <Input
                          id={`wa-faq-q-${faq.key}`}
                          ref={index === form.faqs.length - 1 ? newestFaqQuestion : undefined}
                          value={faq.question}
                          maxLength={limits.faqQuestionMaxChars}
                          onChange={(e) => {
                            setFaq(faq.key, { question: e.target.value });
                            clearError(`faqs.${index}.question`);
                          }}
                          placeholder="Misalnya: Bisa minta file mentah?"
                          aria-invalid={!!qErr}
                          aria-describedby={qErr ? `wa-faq-q-err-${faq.key}` : undefined}
                        />
                        {qErr && (
                          <p id={`wa-faq-q-err-${faq.key}`} className="text-sm text-destructive">
                            {qErr}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <Label htmlFor={`wa-faq-a-${faq.key}`}>Jawaban</Label>
                          <Counter id={`wa-faq-a-count-${faq.key}`} value={faq.answer.length} max={limits.faqAnswerMaxChars} />
                        </div>
                        <Textarea
                          id={`wa-faq-a-${faq.key}`}
                          rows={2}
                          maxLength={limits.faqAnswerMaxChars}
                          value={faq.answer}
                          onChange={(e) => {
                            setFaq(faq.key, { answer: e.target.value });
                            clearError(`faqs.${index}.answer`);
                          }}
                          placeholder="Jawaban sesuai kebijakan studio"
                          aria-invalid={!!aErr}
                          aria-describedby={`wa-faq-a-count-${faq.key}${aErr ? ` wa-faq-a-err-${faq.key}` : ""}`}
                        />
                        {aErr && (
                          <p id={`wa-faq-a-err-${faq.key}`} className="text-sm text-destructive">
                            {aErr}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <Button
              type="button"
              variant="outline"
              disabled={form.faqs.length >= limits.faqMaxItems}
              onClick={() => {
                setForm((f) => ({ ...f, faqs: [...f.faqs, { key: nextKey.current++, question: "", answer: "" }] }));
                // Fokus ke pertanyaan FAQ baru setelah dirender.
                requestAnimationFrame(() => newestFaqQuestion.current?.focus());
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tambah FAQ
            </Button>
          </fieldset>

          <Separator />

          <div className="space-y-3">
            <div aria-live="polite" className="min-h-5 text-sm">
              {dirty ? (
                <p className="text-muted-foreground">Ada perubahan yang belum disimpan.</p>
              ) : data.hasUnpublishedChanges ? (
                <p className="flex gap-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {data.published
                    ? "Draft berbeda dari versi yang dipakai klien. Coba di Uji bot, lalu terbitkan."
                    : "Draft belum diterbitkan. Coba di Uji bot, lalu terbitkan."}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  {data.published ? "Draft sama dengan versi yang dipakai klien." : "Belum ada panduan. Bot memakai aturan dasar saja."}
                </p>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={!dirty || busy}
                onClick={() => {
                  setForm(toForm(data.draft));
                  setErrors({});
                }}
              >
                Batalkan perubahan
              </Button>
              <Button type="submit" variant="outline" disabled={!dirty || busy}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan draft
              </Button>
              <Button type="button" disabled={!canPublish} onClick={() => setConfirmPublish(true)}>
                <Send className="h-4 w-4" aria-hidden="true" />
                Terbitkan ke klien
              </Button>
            </div>
          </div>
        </form>

        {data.versions.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={showHistory}
              aria-controls="wa-guide-history"
              onClick={() => setShowHistory((v) => !v)}
            >
              <History className="h-4 w-4" aria-hidden="true" />
              {showHistory ? "Sembunyikan riwayat versi" : `Riwayat versi (${data.versions.length})`}
            </Button>
            {showHistory && (
              <ol id="wa-guide-history" className="mt-3 divide-y rounded-lg border">
                {data.versions.map((v) => {
                  const active = v.version === data.published?.version;
                  return (
                    <li key={v.version} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">
                          Versi {v.version}
                          {active && <span className="font-normal text-muted-foreground"> · dipakai klien</span>}
                        </p>
                        <p className="text-muted-foreground">
                          {formatDateTime(v.publishedAt)}
                          {v.publishedBy && ` oleh ${v.publishedBy}`} · {v.instructionsLength.toLocaleString("id-ID")} karakter
                          aturan, {v.faqCount} FAQ
                        </p>
                      </div>
                      {!active && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy || dirty}
                          title={dirty ? "Simpan atau batalkan perubahan dulu" : undefined}
                          onClick={() => restore.mutate(v.version)}
                        >
                          {restore.isPending && restore.variables === v.version ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          )}
                          Pakai sebagai draft
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            {showHistory && dirty && (
              <p className="mt-2 text-sm text-muted-foreground">Simpan atau batalkan perubahan dulu sebelum memakai versi lama.</p>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={confirmPublish} onOpenChange={(o) => !publish.isPending && setConfirmPublish(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Terbitkan panduan versi {nextVersion}?</DialogTitle>
            <DialogDescription>
              Bot langsung memakai panduan ini untuk semua klien WhatsApp.
              {dirty && " Perubahan yang belum disimpan ikut disimpan."}
              {data.published
                ? " Versi sebelumnya tetap ada di riwayat dan bisa dipakai lagi."
                : " Setiap versi yang terbit tersimpan di riwayat dan bisa dipakai lagi."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPublish(false)} disabled={publish.isPending}>
              Batal
            </Button>
            <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
              {publish.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Terbitkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
