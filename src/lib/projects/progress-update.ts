// Aturan input update progres desainer (POST /api/designer/projects/[id]/updates).
// Dipakai server untuk validasi dan form workspace desainer untuk umpan balik yang sama.
// Persen di sini disimpan di ProjectUpdate.progress, yang juga dibaca halaman tracking klien.

/**
 * Satu update hanya bisa membawa satu lampiran: Attachment.updateId bertanda @unique di
 * schema, jadi menautkan dua file ke update yang sama melanggar constraint.
 */
export const MAX_UPDATE_ATTACHMENTS = 1;

export const PROGRESS_PRESETS = [25, 50, 75, 100] as const;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Kosong berarti "tanpa persen" (null). Selain itu harus bilangan bulat 0–100. */
export function parseProgress(input: unknown): ParseResult<number | null> {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input === "string" && input.trim() === "") return { ok: true, value: null };

  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input.trim()) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: "Progres harus angka bulat 0–100." };
  }
  if (n < 0 || n > 100) {
    return { ok: false, error: "Progres harus di antara 0 dan 100." };
  }
  return { ok: true, value: n };
}

export function parseAttachmentIds(input: unknown): ParseResult<string[]> {
  if (input === null || input === undefined) return { ok: true, value: [] };
  if (!Array.isArray(input) || !input.every((id) => typeof id === "string" && id.length > 0)) {
    return { ok: false, error: "Format lampiran tidak valid." };
  }
  const unique = Array.from(new Set(input as string[]));
  if (unique.length > MAX_UPDATE_ATTACHMENTS) {
    return { ok: false, error: `Maksimal ${MAX_UPDATE_ATTACHMENTS} lampiran per update.` };
  }
  return { ok: true, value: unique };
}

/** Persen terakhir yang pernah diisi. `updates` terurut dari yang terbaru. */
export function latestProgress(updates: ReadonlyArray<{ progress: number | null }>): number | null {
  for (const u of updates) {
    if (u.progress !== null) return u.progress;
  }
  return null;
}
