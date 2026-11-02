"use client";

import { useQuery } from "@tanstack/react-query";
import type { WaIntakeListResponse } from "./types";

/** Jumlah order WA yang menunggu tindakan admin: Perlu Harga + Verifikasi DP (§12.1). */
export function useWaOrderBadge(enabled: boolean): number {
  const { data } = useQuery<WaIntakeListResponse>({
    queryKey: ["wa-intakes", "badge"],
    queryFn: async () => {
      const res = await fetch("/api/wa-intakes?pageSize=1");
      if (!res.ok) throw new Error("Gagal memuat jumlah order WA");
      return res.json();
    },
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return data ? data.counts.AWAITING_QUOTE + data.counts.DP_REVIEW : 0;
}
