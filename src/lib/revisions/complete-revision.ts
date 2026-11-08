import type { Prisma } from "@prisma/client";

// Desainer menandai revisi selesai dikerjakan (docs/CLIENT_NOTIFICATIONS.md). Memicu kabar REVISION_DONE ke klien
// (dipanggil route). RevisionStatus lama tidak diubah; selesai = completedAt terisi.

export type CompleteRevisionResult =
  | { ok: true; revision: { id: string; number: number; completedAt: Date | null } }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_COMPLETED" | "PROJECT_FINALIZED" };

export async function completeRevision(
  db: Prisma.TransactionClient,
  input: { projectId: string; revisionId: string; actorId: string; now?: Date },
): Promise<CompleteRevisionResult> {
  const revision = await db.revision.findFirst({
    where: { id: input.revisionId, projectId: input.projectId },
    select: { id: true, number: true, completedAt: true, project: { select: { finalApprovedAt: true } } },
  });
  if (!revision) return { ok: false, code: "NOT_FOUND" };
  if (revision.completedAt) return { ok: false, code: "ALREADY_COMPLETED" };
  if (revision.project.finalApprovedAt) return { ok: false, code: "PROJECT_FINALIZED" };

  const updated = await db.revision.update({
    where: { id: revision.id },
    data: { completedAt: input.now ?? new Date(), completedById: input.actorId },
    select: { id: true, number: true, completedAt: true },
  });
  await db.activityLog.create({
    data: {
      entityType: "Revision",
      entityId: revision.id,
      action: "REVISION_COMPLETED",
      actorId: input.actorId,
      newValue: { projectId: input.projectId, number: revision.number },
    },
  });
  return { ok: true, revision: updated };
}
