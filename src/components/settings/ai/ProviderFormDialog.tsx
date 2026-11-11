"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_PROVIDERS_KEY, AiApiError, FORMAT_LABELS, createProvider, dbId, updateProvider, type Provider, type ProviderFormat } from "./api";

// Tambah / edit provider AI. Key hanya dikirim ke server saat disimpan; saat edit, kosong = tidak diubah.

const FORMAT_HELP: Record<ProviderFormat, string> = {
  ANTHROPIC: "Anthropic resmi atau gateway yang meneruskan ke Claude. Prompt cache tetap jalan (lebih hemat).",
  OPENAI: "OpenRouter, LiteLLM, DeepSeek, Groq, Gemini (mode OpenAI), Ollama, dan sejenisnya.",
};
const BASE_URL_EXAMPLE: Record<ProviderFormat, string> = {
  ANTHROPIC: "https://api.anthropic.com",
  OPENAI: "https://openrouter.ai/api/v1",
};

export function ProviderFormDialog({
  open,
  onOpenChange,
  provider,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: Provider | null; // null = provider baru
}) {
  const queryClient = useQueryClient();
  const editing = !!provider;
  const [name, setName] = useState(provider?.name ?? "");
  const [format, setFormat] = useState<ProviderFormat>(provider?.format ?? "OPENAI");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      const input = { name: name.trim(), format, baseUrl: baseUrl.trim(), ...(apiKey.trim() && { apiKey: apiKey.trim() }) };
      if (provider) await updateProvider(dbId(provider.key), input);
      else await createProvider(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
      toast(editing ? "Provider diperbarui. Tes ulang model di provider ini." : "Provider ditambahkan. Tes model untuk mulai memakainya.", "success");
      setApiKey("");
      onOpenChange(false);
    },
  });
  const fields = save.error instanceof AiApiError ? save.error.fields : {};
  const formError = save.error && !Object.keys(fields).length ? save.error.message : null;

  // Fokus ke isian pertama yang salah (sama dengan form Operasional dan Layanan).
  // Hanya saat error simpan berganti, supaya fokus tidak berpindah ketika owner mengetik.
  const saveError = save.error;
  useEffect(() => {
    const errs = saveError instanceof AiApiError ? saveError.fields : {};
    const first = (["name", "baseUrl", "apiKey"] as const).find((f) => errs[f]);
    const ids = { name: "provider-name", baseUrl: "provider-url", apiKey: "provider-key" } as const;
    if (first) document.getElementById(ids[first])?.focus();
  }, [saveError]);

  const errorFor = (field: string, id: string) =>
    fields[field] ? (
      <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
        {fields[field]}
      </p>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit provider" : "Tambah provider AI"}</DialogTitle>
          <DialogDescription>
            API key disimpan terenkripsi di server dan tidak pernah ditampilkan lagi. Mengubah base URL atau key membatalkan
            hasil tes model di provider ini.
          </DialogDescription>
        </DialogHeader>
        <form
          id="provider-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="provider-name">Nama</Label>
            <Input
              id="provider-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: OpenRouter"
              className="max-md:h-11"
              aria-invalid={!!fields.name}
              aria-describedby={fields.name ? "provider-name-error" : undefined}
              required
            />
            {errorFor("name", "provider-name")}
          </div>

          <div className="space-y-1.5">
            <Label id="provider-format-label">Format API</Label>
            <Select
              value={format}
              options={(["OPENAI", "ANTHROPIC"] as const).map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
              onValueChange={(v) => v && setFormat(v as ProviderFormat)}
            >
              <SelectTrigger aria-labelledby="provider-format-label" aria-describedby="provider-format-help" className="w-full max-md:h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["OPENAI", "ANTHROPIC"] as const).map((f) => (
                  <SelectItem key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="provider-format-help" className="text-xs text-muted-foreground">
              {FORMAT_HELP[format]}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provider-url">Base URL</Label>
            <Input
              id="provider-url"
              type="url"
              inputMode="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={BASE_URL_EXAMPLE[format]}
              className="font-mono max-md:h-11"
              spellCheck={false}
              aria-invalid={!!fields.baseUrl}
              aria-describedby={`provider-url-help${fields.baseUrl ? " provider-url-error" : ""}`}
              required
            />
            <p id="provider-url-help" className="text-xs text-muted-foreground">
              Boleh ditempel lengkap; akhiran seperti /chat/completions dirapikan otomatis.
            </p>
            {errorFor("baseUrl", "provider-url")}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provider-key">
              API key{editing && <span className="font-normal text-muted-foreground"> (kosongkan untuk tidak mengubah)</span>}
            </Label>
            <div className="flex gap-2">
              <Input
                id="provider-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={editing && provider?.keyHint ? `Tersimpan: ${provider.keyHint}` : "Tempel API key"}
                autoComplete="off"
                spellCheck={false}
                className="font-mono max-md:h-11"
                aria-invalid={!!fields.apiKey}
                aria-describedby={fields.apiKey ? "provider-key-error" : undefined}
                required={!editing}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 max-md:h-11 max-md:w-11"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? "Sembunyikan API key" : "Tampilkan API key"}
                aria-pressed={showKey}
              >
                {showKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
            {errorFor("apiKey", "provider-key")}
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" className="max-md:h-11" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="submit" form="provider-form" className="max-md:h-11" disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {editing ? "Simpan perubahan" : "Tambah provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
