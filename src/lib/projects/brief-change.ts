// Penanda "klien menambah brief" untuk desainer (produksi 2026-11-13, Yeni: tambahan brief masuk setelah sketsa
// dikirim, desainer tidak diberi tanda). Tanda hilang setelah desainer mengirim update progres berikutnya.

export type BriefChange = { changedAt: string; lastUpdateAt: string | null };

export function briefChangedSinceLastUpdate(
  clientUpdatedAt: string | Date | null | undefined,
  updates: { createdAt: string | Date }[],
): BriefChange | null {
  if (!clientUpdatedAt) return null;
  const changed = new Date(clientUpdatedAt);
  const last = updates.reduce<Date | null>((max, u) => {
    const at = new Date(u.createdAt);
    return !max || at > max ? at : max;
  }, null);
  if (last && last >= changed) return null;
  return { changedAt: changed.toISOString(), lastUpdateAt: last ? last.toISOString() : null };
}
