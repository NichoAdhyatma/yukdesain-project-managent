"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AI_PROVIDERS_KEY, fetchAiProviders } from "./api";
import { AiUsageCard } from "./AiUsageCard";
import { ProviderList } from "./ProviderList";

// Bot AI › Model: provider AI dari portal, tes model, dan pemakaian (docs/AI_PROVIDERS.md).
export function AiModelSettings() {
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({ queryKey: AI_PROVIDERS_KEY, queryFn: fetchAiProviders });

  if (isLoading) {
    return (
      <Card aria-busy="true">
        <CardHeader>
          <CardTitle>Model AI</CardTitle>
          <CardDescription>Memuat provider dan pemakaian…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-24 w-full animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Model AI</CardTitle>
          <CardDescription>Pengaturan model tidak bisa dimuat.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="max-md:h-11" onClick={() => refetch()} disabled={isRefetching}>
            {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {/* key: form pemakaian mulai ulang setelah data tersimpan / tes baru. */}
      <AiUsageCard key={JSON.stringify(data.usage)} data={data} />
      <ProviderList data={data} />
    </div>
  );
}
