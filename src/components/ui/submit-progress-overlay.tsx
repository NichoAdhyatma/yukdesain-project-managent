"use client";

import { cn } from "cn";
import { Loader2 } from "lucide-react";

interface SubmitProgressOverlayProps {
  progress: number;
  label?: string;
  className?: string;
}

export function SubmitProgressOverlay({
  progress,
  label,
  className,
}: SubmitProgressOverlayProps) {
  if (progress <= 0 || progress > 100) return null;

  return (
    <div
      data-slot="submit-progress-overlay"
      className={cn(
        "fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-card px-10 py-8 shadow-xl">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-foreground">{label || "Mengunggah..."}</p>
          <p className="text-3xl font-bold text-primary tabular-nums">
            {Math.round(progress)}%
          </p>
        </div>
        <div className="w-48 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
