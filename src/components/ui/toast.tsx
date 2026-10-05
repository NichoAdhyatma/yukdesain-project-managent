"use client";

import { useEffect, useState } from "react";
import { CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

let toastListeners: ((toasts: Toast[]) => void)[] = [];
let toasts: Toast[] = [];

function notifyListeners() {
  toastListeners.forEach((fn) => fn([...toasts]));
}

export function toast(message: string, type: ToastType = "success") {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, message, type }];
  notifyListeners();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, 4000);
}

export function ToastContainer() {
  const [visible, setVisible] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (t: Toast[]) => setVisible(t);
    toastListeners.push(listener);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== listener);
    };
  }, []);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {visible.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t }: { toast: Toast }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg min-w-[280px] max-w-sm transition-all duration-300",
        "bg-background border-border",
        visible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      )}
      role="alert"
      aria-live="polite"
    >
      {t.type === "success" && (
        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
      )}
      {t.type === "error" && (
        <X className="h-4 w-4 text-destructive shrink-0" />
      )}
      <p className="text-sm flex-1">{t.message}</p>
    </div>
  );
}
