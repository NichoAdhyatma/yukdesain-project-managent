"use client";

import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ListRestart, Loader2, PlayCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AI_PROVIDERS_KEY, AiApiError, USAGE_LABELS, fetchModels, testModel, type Check, type ModelTest, type Provider } from "./api";

// Tes satu model di satu provider: Koneksi, Tool use, Gambar (docs/AI_PROVIDERS.md). Hanya model yang lulus
// yang bisa dipilih di Pemakaian.

const CHECK_HELP: Record<string, string> = {
  Koneksi: "Base URL, API key, dan ID model bisa dipakai.",
  "Tool use": "Wajib untuk Chat dan Cadangan: bot menyimpan brief lewat tool.",
  Gambar: "Wajib untuk Baca bukti transfer.",
};

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-1.5" aria-label="Hasil tes">
      {checks.map((c) => (
        <li key={c.name} className="flex items-start gap-2 text-sm">
          {c.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          )}
          <span className="min-w-0">
            <span className="font-medium">{c.name}</span>
            <span className="sr-only">{c.ok ? " lulus" : " gagal"}</span>
            <span className="text-muted-foreground"> · {c.ok ? CHECK_HELP[c.name] ?? c.detail : c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const testedLabel = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));

export function ModelTester({ provider, tests }: { provider: Provider; tests: ModelTest[] }) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const listId = useId();
  const [model, setModel] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [optionsNote, setOptionsNote] = useState<string | null>(null);
  const [result, setResult] = useState<{ model: string; checks: Check[] } | null>(null);

  const list = useMutation({
    mutationFn: () => fetchModels(provider.key),
    onSuccess: (r) => {
      setOptions(r.models);
      setOptionsNote(
        r.source === "api"
          ? `${r.models.length} model dari provider. Ketik untuk mencari.`
          : r.models.length
            ? "Daftar dari provider tidak bisa diambil; menampilkan daftar bawaan."
            : "Provider ini tidak menyediakan daftar model. Ketik ID model secara manual.",
      );
    },
  });

  const run = useMutation({
    mutationFn: (m: string) => testModel(provider.key, m),
    onSuccess: (r, m) => {
      setResult({ model: m, checks: r.checks });
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
    },
  });
  const runError = run.error instanceof AiApiError ? (run.error.fields.model ?? run.error.message) : run.error ? "Tes gagal dijalankan. Coba lagi." : null;

  return (
    <div className="space-y-3">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (model.trim()) run.mutate(model.trim());
        }}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={inputId}>ID model</Label>
          <Input
            id={inputId}
            list={listId}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={provider.format === "OPENAI" ? "Contoh: openai/gpt-4.1-mini" : "Contoh: claude-haiku-5-5"}
            autoComplete="off"
            spellCheck={false}
            className="font-mono max-md:h-11"
            aria-describedby={optionsNote ? `${inputId}-note` : undefined}
          />
          <datalist id={listId}>
            {options.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="max-md:h-11" onClick={() => list.mutate()} disabled={list.isPending}>
            {list.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ListRestart className="h-4 w-4" aria-hidden="true" />}
            Ambil daftar model
          </Button>
          <Button type="submit" className="max-md:h-11" disabled={run.isPending || !model.trim() || !provider.configured}>
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlayCircle className="h-4 w-4" aria-hidden="true" />}
            {run.isPending ? "Mengetes…" : "Tes model"}
          </Button>
        </div>
      </form>
      {optionsNote && (
        <p id={`${inputId}-note`} className="text-xs text-muted-foreground">
          {optionsNote}
        </p>
      )}
      {!provider.configured && (
        <p className="text-sm text-destructive" role="alert">
          {provider.builtIn ? "API key provider ini belum diisi di server." : "Kunci enkripsi server belum diatur; key provider ini tidak bisa dibuka."}
        </p>
      )}
      {runError && (
        <p className="text-sm text-destructive" role="alert">
          {runError}
        </p>
      )}
      {result && (
        <div className="rounded-lg border border-border p-3" aria-live="polite">
          <p className="mb-2 text-sm font-medium">
            Hasil tes <span className="font-mono">{result.model}</span>
          </p>
          <CheckList checks={result.checks} />
        </div>
      )}

      {tests.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Model yang sudah dites</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {tests.map((t) => (
              <li key={t.model} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="font-mono">{t.model}</span>
                {t.stale ? (
                  <Badge variant="outline">Perlu dites ulang</Badge>
                ) : t.usages.length ? (
                  <span className="text-muted-foreground">Bisa untuk: {t.usages.map((u) => USAGE_LABELS[u]).join(", ")}</span>
                ) : (
                  <span className="text-destructive">Belum lulus untuk pemakaian apa pun</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{testedLabel(t.testedAt)}</span>
                <Button type="button" variant="ghost" size="sm" className="max-md:h-11" onClick={() => setModel(t.model)}>
                  Pakai ID ini
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
