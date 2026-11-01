"use client";

import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGlobalFetching } from "@/components/providers/query-provider";

const ROUTE_QUERIES: Record<string, string[]> = {
  "/dashboard": [],
  "/projects": ["projects"],
  "/invoices": ["invoices", "studio"],
  "/financial": ["financial"],
  "/designers": ["designers"],
  "/designer": ["designer-projects"],
  "/services": ["services"],
  "/form-link": ["services", "form-link-projects"],
  "/media": ["storage"],
  "/settings": ["menus", "studio-settings", "payment-accounts"],
  "/activity-history": ["activity-logs"],
};

export function GlobalRefreshButton() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isGlobalFetching, setGlobalFetching } = useGlobalFetching();

  const queryKeys = ROUTE_QUERIES[pathname];

  if (!queryKeys) return null;

  async function handleRefresh() {
    setGlobalFetching(true);
    try {
      await Promise.all(
        queryKeys.map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] })
        )
      );
      // Dashboard data is server-rendered — refetch the RSC payload
      router.refresh();
    } finally {
      setGlobalFetching(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      disabled={isGlobalFetching}
      aria-label="Refresh data"
      className="shrink-0 max-md:size-11"
    >
      <RefreshCw className={`h-4 w-4 ${isGlobalFetching ? "animate-spin" : ""}`} />
    </Button>
  );
}
