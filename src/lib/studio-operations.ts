import { prisma } from "@/lib/db";
import { OPERATIONS_DEFAULTS, type StudioOperations } from "./studio-operations-rules";

// Operasional studio (docs/STUDIO_OPERATIONS.md): satu sumber untuk DP, kuota revisi, kebijakan, dan jam kerja.
// Dibaca portal dan bot WhatsApp. Nilai yang mengikat transaksi di-snapshot (Project.revisionQuota, WaIntake.dpPercent).

export * from "./studio-operations-rules";

let cached: StudioOperations | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

export async function getStudioOperations(): Promise<StudioOperations> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
  const row = await prisma.studioSettings.findUnique({
    where: { id: "default" },
    select: {
      opsDpPercent: true,
      opsRevisionQuota: true,
      opsRevisionNotice: true,
      opsSettlementNote: true,
      opsWorkingDays: true,
      opsWorkingHoursStart: true,
      opsWorkingHoursEnd: true,
    },
  });
  cached = row
    ? {
        dpPercent: row.opsDpPercent,
        revisionQuota: row.opsRevisionQuota,
        revisionNotice: row.opsRevisionNotice ?? OPERATIONS_DEFAULTS.revisionNotice,
        settlementNote: row.opsSettlementNote ?? OPERATIONS_DEFAULTS.settlementNote,
        workingDays: row.opsWorkingDays.length ? row.opsWorkingDays : OPERATIONS_DEFAULTS.workingDays,
        workingHoursStart: row.opsWorkingHoursStart,
        workingHoursEnd: row.opsWorkingHoursEnd,
      }
    : OPERATIONS_DEFAULTS;
  cachedAt = Date.now();
  return cached;
}

export function invalidateOperationsCache(): void {
  cached = null;
  cachedAt = 0;
}

