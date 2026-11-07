// Sisa revisi gratis (BRD §20): sama untuk portal klien dan bot WhatsApp. Kuota milik project
// (Project.revisionQuota, snapshot dari Operasional studio saat project dibuat; docs/STUDIO_OPERATIONS.md).
export function revisionQuotaRemaining(revisionCount: number, quota: number): number {
  return Math.max(0, quota - revisionCount);
}

/** Revisi bernomor 1, 2, 3…: nomor revisi terakhir = jumlah revisi yang sudah terpakai. */
export function revisionsUsed(latestRevisionNumber: number | null): number {
  return latestRevisionNumber ?? 0;
}
