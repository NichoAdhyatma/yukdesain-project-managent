"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AI_PROVIDERS_KEY, FORMAT_LABELS, dbId, deleteProvider, type AiProvidersData, type Provider } from "./api";
import { ModelTester } from "./ModelTester";
import { ProviderFormDialog } from "./ProviderFormDialog";

function ProviderItem({ provider, data, onEdit, onDelete }: { provider: Provider; data: AiProvidersData; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const tests = data.tests[provider.key] ?? [];
  const panelId = `provider-panel-${provider.key.replace(/[^a-z0-9]/gi, "-")}`;
  return (
    <li className="rounded-lg border border-border">
      <div className="flex flex-wrap items-start gap-3 p-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{provider.name}</span>
            <Badge variant="outline">{FORMAT_LABELS[provider.format]}</Badge>
            {provider.builtIn && <Badge variant="secondary">Bawaan server</Badge>}
            {!provider.configured && <Badge variant="destructive">Belum bisa dipakai</Badge>}
          </div>
          <p className="break-all font-mono text-xs text-muted-foreground">{provider.baseUrl}</p>
          <p className="text-xs text-muted-foreground">
            API key: {provider.keyHint ?? "belum diisi"}
            {provider.builtIn && " (diatur di env server)"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {!provider.builtIn && (
            <>
              <Button variant="ghost" size="sm" className="max-md:h-11" onClick={onEdit}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive max-md:h-11" onClick={onDelete}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Hapus
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" className="max-md:h-11" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
            Tes model{tests.length ? ` (${tests.length})` : ""}
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {open && (
        <div id={panelId} className="border-t border-border p-3">
          <ModelTester provider={provider} tests={tests} />
        </div>
      )}
    </li>
  );
}

export function ProviderList({ data }: { data: AiProvidersData }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ provider: Provider | null } | null>(null);
  const [toDelete, setToDelete] = useState<Provider | null>(null);
  const custom = data.providers.filter((p) => !p.builtIn);

  const remove = useMutation({
    mutationFn: (p: Provider) => deleteProvider(dbId(p.key)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AI_PROVIDERS_KEY });
      toast("Provider dihapus.", "success");
      setToDelete(null);
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>Provider</CardTitle>
          <CardDescription>Tambahkan provider dengan base URL dan API key, lalu tes model sebelum dipakai bot.</CardDescription>
        </div>
        <Button className="max-md:h-11" onClick={() => setForm({ provider: null })} disabled={!data.cryptoReady}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Tambah provider
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!data.cryptoReady && (
          <p className="rounded-lg border border-border bg-muted/50 p-3 text-sm" role="status">
            Kunci enkripsi <span className="font-mono">AI_KEYS_SECRET</span> belum diatur di server, jadi provider tambahan belum bisa
            disimpan. Provider bawaan server tetap bisa dipakai.
          </p>
        )}
        <ul className="space-y-3">
          {data.providers.map((p) => (
            <ProviderItem key={p.key} provider={p} data={data} onEdit={() => setForm({ provider: p })} onDelete={() => setToDelete(p)} />
          ))}
        </ul>
        {custom.length === 0 && data.cryptoReady && (
          <p className="text-sm text-muted-foreground">Belum ada provider tambahan. Provider bawaan server di atas tetap bisa dites dan dipakai.</p>
        )}
      </CardContent>

      {form && <ProviderFormDialog key={form.provider?.key ?? "new"} open onOpenChange={(o) => !o && setForm(null)} provider={form.provider} />}

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus provider {toDelete?.name}?</DialogTitle>
            <DialogDescription>API key dan hasil tes model di provider ini ikut dihapus. Provider yang sedang dipakai tidak bisa dihapus.</DialogDescription>
          </DialogHeader>
          {remove.error && (
            <p className="text-sm text-destructive" role="alert">
              {remove.error.message}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" className="max-md:h-11" onClick={() => setToDelete(null)}>
              Batal
            </Button>
            <Button variant="destructive" className="max-md:h-11" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete)}>
              {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
