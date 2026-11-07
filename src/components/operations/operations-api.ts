import type { StudioOperations } from "@/lib/studio-operations-rules";

// Klien API Operasional studio (docs/STUDIO_OPERATIONS.md).

export const OPERATIONS_QUERY_KEY = ["studio-operations"] as const;

export type OperationsFieldErrors = Partial<Record<keyof StudioOperations, string[]>>;

export class OperationsSaveError extends Error {
  constructor(
    message: string,
    readonly fields: OperationsFieldErrors,
  ) {
    super(message);
  }
}

export async function fetchOperations(): Promise<StudioOperations> {
  const res = await fetch("/api/settings/operations");
  if (!res.ok) throw new Error("Operasional studio tidak bisa dimuat");
  return res.json();
}

export async function saveOperations(input: StudioOperations): Promise<StudioOperations> {
  const res = await fetch("/api/settings/operations", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new OperationsSaveError(body.error ?? "Gagal menyimpan operasional studio", body.issues ?? {});
  return body as StudioOperations;
}
