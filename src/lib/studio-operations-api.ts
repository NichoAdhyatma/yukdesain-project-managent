import { prisma } from "@/lib/db";
import { OPERATIONS_DEFAULTS, getStudioOperations, invalidateOperationsCache, type StudioOperations } from "./studio-operations";

// Simpan Operasional studio (docs/STUDIO_OPERATIONS.md). Dipisah dari route supaya file route hanya mengekspor handler.

const textOrNull = (value: string, fallback: string) => (value === fallback ? null : value);

export async function saveStudioOperations(input: StudioOperations, actorId: string): Promise<StudioOperations> {
  // Baca nilai lama langsung dari DB (bukan cache) untuk riwayat aktivitas.
  invalidateOperationsCache();
  const previous = await getStudioOperations();
  const data = {
    opsDpPercent: input.dpPercent,
    opsRevisionQuota: input.revisionQuota,
    opsRevisionNotice: textOrNull(input.revisionNotice, OPERATIONS_DEFAULTS.revisionNotice),
    opsSettlementNote: textOrNull(input.settlementNote, OPERATIONS_DEFAULTS.settlementNote),
    opsWorkingDays: input.workingDays,
    opsWorkingHoursStart: input.workingHoursStart,
    opsWorkingHoursEnd: input.workingHoursEnd,
    opsOutsideHoursNote: textOrNull(input.outsideHoursNote, OPERATIONS_DEFAULTS.outsideHoursNote),
  };
  await prisma.$transaction(async (tx) => {
    await tx.studioSettings.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
    await tx.activityLog.create({
      data: { entityType: "StudioSettings", entityId: "default", action: "OPERATIONS_UPDATED", actorId, previousValue: previous, newValue: input },
    });
  });
  invalidateOperationsCache();
  return input;
}
