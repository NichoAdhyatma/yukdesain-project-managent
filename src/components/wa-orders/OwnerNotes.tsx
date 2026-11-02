"use client";

import { Clock, MessageSquareReply } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describePricingRule, formatDateTime } from "./labels";
import type { OwnerQuery, PricingRuleApplied } from "./types";

// Catatan dari alur owner (docs/WHATSAPP_OWNER_COMMANDS.md): aturan harga yang dijanjikan bot,
// dan pertanyaan luar katalog ke owner.

/** Ditaruh di panel harga: admin menerapkannya saat mengisi harga. */
export function PricingRulesNotice({ rules }: { rules: PricingRuleApplied[] }) {
  if (rules.length === 0) return null;
  return (
    <div role="note" className="space-y-2 rounded-lg border p-3 text-sm">
      <p className="font-medium">Dijanjikan bot ke klien, terapkan di harga:</p>
      <ul className="space-y-1">
        {rules.map((r) => (
          <li key={r.ruleId}>
            <span className="font-medium">{r.name}</span>: {describePricingRule(r)}
            <span className="block text-muted-foreground">
              Syarat: {r.condition}
              {r.note && ` · Catatan bot: ${r.note}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const QUERY_STATUS: Record<OwnerQuery["status"], string> = {
  PENDING: "Menunggu jawaban owner",
  ANSWERED: "Dijawab owner",
  EXPIRED: "Tidak dijawab, dialihkan ke admin",
};

export function OwnerQueriesCard({ queries }: { queries: OwnerQuery[] }) {
  if (queries.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pertanyaan ke owner</CardTitle>
        <CardDescription>Permintaan klien di luar katalog yang ditanyakan bot ke WhatsApp owner.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {queries.map((q) => (
            <li key={q.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={q.status === "PENDING" ? "default" : "outline"}>{QUERY_STATUS[q.status]}</Badge>
                <span className="text-muted-foreground">{formatDateTime(q.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{q.question}</p>
              {q.status === "ANSWERED" && (
                <p className="flex gap-1.5 text-muted-foreground">
                  <MessageSquareReply className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-medium text-foreground">{q.approved ? "Bisa" : "Tidak bisa"}</span>
                    {q.note && ` · ${q.note}`}
                    {q.relayedAt ? " · sudah disampaikan bot" : " · belum disampaikan ke klien"}
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Label di daftar Order WA. */
export function WaitingForOwnerBadge() {
  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="h-3 w-3" aria-hidden="true" />
      Menunggu owner
    </Badge>
  );
}
