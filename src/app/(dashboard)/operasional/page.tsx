"use client";

import { OperationsForm } from "@/components/operations/OperationsForm";

// Operasional studio (docs/STUDIO_OPERATIONS.md): khusus owner (menu rules di src/proxy.ts).

export default function OperasionalPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-border p-6">
        <h1 className="text-2xl font-semibold text-foreground">Operasional studio</h1>
        <p className="text-muted-foreground">DP, kuota revisi, dan jam kerja desainer. Dipakai portal dan bot WhatsApp.</p>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="w-full max-w-3xl">
          <OperationsForm />
        </div>
      </div>
    </div>
  );
}
