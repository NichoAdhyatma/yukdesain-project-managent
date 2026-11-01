"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BriefReader, getBriefFieldLabel } from "@/components/forms/brief/BriefReader";
import { SERVICE_BRIEF_CONFIGS } from "@/components/forms/brief/types";
import type { WaIntakeDetail } from "./types";
import { useIntakeAction } from "./use-intake-action";

const EDITABLE: WaIntakeDetail["status"][] = ["COLLECTING", "AWAITING_QUOTE", "QUOTED", "DP_REVIEW"];

// Field teks saja; item berulang & gambar tetap dari chat (lihat brief-schema.ts).
function textFields(serviceCode: string | undefined) {
  const config = SERVICE_BRIEF_CONFIGS.find((c) => c.code === serviceCode);
  if (!config) return [];
  const required = new Set<string>(config.requiredFields);
  return [...config.requiredFields, ...config.optionalFields]
    .filter((k) => !k.endsWith("_json") && !k.endsWith("_url"))
    .map((k) => ({ key: k as string, required: required.has(k) }));
}

export function BriefSection({ intake }: { intake: WaIntakeDetail }) {
  const fields = textFields(intake.service?.code);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const save = useIntakeAction<{ briefDraft: Record<string, string | null> }>(intake.id, "", "PATCH", {
    successMessage: "Brief diperbarui",
    onSuccess: () => setOpen(false),
  });
  const canEdit = EDITABLE.includes(intake.status) && fields.length > 0;

  const openEditor = () => {
    setValues(
      Object.fromEntries(fields.map((f) => [f.key, typeof intake.brief.draft[f.key] === "string" ? (intake.brief.draft[f.key] as string) : ""])),
    );
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Brief</CardTitle>
            <CardDescription>
              {intake.brief.confirmedAt ? "Dikonfirmasi klien lewat WhatsApp." : "Belum dikonfirmasi klien."}
              {intake.brief.editedByAdmin && " Pernah diedit admin."}
            </CardDescription>
          </div>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={openEditor}>
              <Pencil className="h-4 w-4" />
              Edit brief
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {intake.brief.summary && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Ringkasan yang disetujui klien</p>
            <p className="whitespace-pre-wrap">{intake.brief.summary}</p>
          </div>
        )}
        {intake.brief.responses.length > 0 ? (
          <BriefReader responses={intake.brief.responses} serviceCode={intake.service?.code ?? ""} />
        ) : (
          <p className="text-sm text-muted-foreground">Brief masih kosong.</p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !save.isPending && setOpen(o)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit brief</DialogTitle>
          </DialogHeader>
          <form
            id="brief-edit-form"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              // Kosong = hapus field (null), sesuai aturan PATCH
              save.mutate({
                briefDraft: Object.fromEntries(fields.map((f) => [f.key, values[f.key]?.trim() ? values[f.key].trim() : null])),
              });
            }}
          >
            {fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`brief-${f.key}`}>
                  {getBriefFieldLabel(f.key)}
                  {f.required && <span className="text-destructive" aria-hidden="true">*</span>}
                </Label>
                <Textarea
                  id={`brief-${f.key}`}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  rows={2}
                  maxLength={2000}
                  required={f.required}
                />
                {save.error?.fields[`briefDraft.${f.key}`] && (
                  <p className="text-sm text-destructive">{save.error.fields[`briefDraft.${f.key}`]}</p>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Gambar referensi dan daftar item tetap mengikuti yang dikirim klien.</p>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={save.isPending}>
              Batal
            </Button>
            <Button type="submit" form="brief-edit-form" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan brief
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
