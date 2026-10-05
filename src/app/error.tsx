"use client";

import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 text-center px-4">
      <div className="flex flex-col items-center gap-3">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold text-foreground">Terjadi Kesalahan</h1>
        <p className="text-muted-foreground max-w-md">
          Maaf, terjadi kesalahan yang tidak terduga. Silakan coba lagi.
        </p>
        {error.digest && (
          <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            Error ID: {error.digest}
          </code>
        )}
      </div>
      <Button onClick={reset}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Coba Lagi
      </Button>
    </div>
  );
}
