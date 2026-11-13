// Batas percobaan "Lacak pesanan" (kode project + 4 digit nomor WhatsApp, keputusan owner 2026-11-13).
// Dipisah dari route: file route Next.js hanya boleh mengekspor handler.

/** Percobaan 4 digit salah per kode project sebelum dikunci sementara. */
export const MAX_FAILED_LOOKUPS = 5;
export const LOOKUP_LOCK_MS = 15 * 60_000;

// Satu proses Node di VPS: cukup di memori (restart hanya mengosongkan hitungan).
const failures = new Map<string, { count: number; firstAt: number }>();

/** Kode ini sedang dikunci karena terlalu banyak percobaan salah? */
export function isLookupLocked(code: string, now = Date.now()): boolean {
  const tried = failures.get(code);
  if (tried && now - tried.firstAt > LOOKUP_LOCK_MS) failures.delete(code);
  return (failures.get(code)?.count ?? 0) >= MAX_FAILED_LOOKUPS;
}

export function recordFailedLookup(code: string, now = Date.now()): void {
  const current = failures.get(code);
  failures.set(code, { count: (current?.count ?? 0) + 1, firstAt: current?.firstAt ?? now });
}

export function clearLookupAttempts(code: string): void {
  failures.delete(code);
}

/** Untuk tes. */
export function resetLookupAttempts(): void {
  failures.clear();
}
