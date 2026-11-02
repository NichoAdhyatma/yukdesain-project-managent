import { MAX_REVISION_QUOTA } from "@/lib/constants";

// Sisa revisi gratis (BRD §20): sama untuk portal klien dan bot WhatsApp.
export function revisionQuotaRemaining(revisionCount: number): number {
  return Math.max(0, MAX_REVISION_QUOTA - revisionCount);
}
