import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { completeRevision } from "./complete-revision";

const now = new Date("2026-11-08T10:00:00Z");
const db = {
  revision: { findFirst: vi.fn(), update: vi.fn() },
  activityLog: { create: vi.fn() },
};
const asDb = db as unknown as Prisma.TransactionClient;

beforeEach(() => {
  vi.resetAllMocks();
  db.revision.findFirst.mockResolvedValue({ id: "r1", number: 2, completedAt: null, project: { finalApprovedAt: null } });
  db.revision.update.mockResolvedValue({ id: "r1", number: 2, completedAt: now });
});

describe("completeRevision (docs/CLIENT_NOTIFICATIONS.md §revisi selesai)", () => {
  it("revisi dicari dalam project itu saja; tidak ada → NOT_FOUND", async () => {
    db.revision.findFirst.mockResolvedValue(null);
    expect(await completeRevision(asDb, { projectId: "p1", revisionId: "rX", actorId: "u1", now })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(db.revision.findFirst.mock.calls[0][0].where).toEqual({ id: "rX", projectId: "p1" });
  });

  it("sudah selesai → ALREADY_COMPLETED; project sudah final disetujui → PROJECT_FINALIZED", async () => {
    db.revision.findFirst.mockResolvedValue({ id: "r1", number: 2, completedAt: now, project: { finalApprovedAt: null } });
    expect(await completeRevision(asDb, { projectId: "p1", revisionId: "r1", actorId: "u1", now })).toEqual({ ok: false, code: "ALREADY_COMPLETED" });
    db.revision.findFirst.mockResolvedValue({ id: "r1", number: 2, completedAt: null, project: { finalApprovedAt: now } });
    expect(await completeRevision(asDb, { projectId: "p1", revisionId: "r1", actorId: "u1", now })).toEqual({ ok: false, code: "PROJECT_FINALIZED" });
    expect(db.revision.update).not.toHaveBeenCalled();
  });

  it("sukses: completedAt + completedById terisi, aktivitas tercatat", async () => {
    const r = await completeRevision(asDb, { projectId: "p1", revisionId: "r1", actorId: "u1", now });
    expect(r).toMatchObject({ ok: true });
    expect(db.revision.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "r1" }, data: { completedAt: now, completedById: "u1" } }));
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: { entityType: "Revision", entityId: "r1", action: "REVISION_COMPLETED", actorId: "u1", newValue: { projectId: "p1", number: 2 } },
    });
  });
});
