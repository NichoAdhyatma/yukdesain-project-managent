import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  studioSettings: { upsert: vi.fn() },
  activityLog: { create: vi.fn() },
}));
const db = vi.hoisted(() => ({ $transaction: vi.fn(), studioSettings: { findUnique: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));
const ops = vi.hoisted(() => ({ invalidate: vi.fn(), current: vi.fn() }));
vi.mock("./studio-operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-operations")>();
  return { ...actual, getStudioOperations: ops.current, invalidateOperationsCache: ops.invalidate };
});

import { OPERATIONS_DEFAULTS } from "./studio-operations";
import { saveStudioOperations } from "./studio-operations-api";

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
  ops.current.mockResolvedValue(OPERATIONS_DEFAULTS);
});

describe("saveStudioOperations (docs/STUDIO_OPERATIONS.md)", () => {
  const next = { ...OPERATIONS_DEFAULTS, dpPercent: 30, revisionQuota: 5, settlementNote: "Lunas sebelum file final dikirim." };

  it("menyimpan kolom ops*; teks yang sama dengan default disimpan null", async () => {
    await saveStudioOperations(next, "u1");
    const data = {
      opsDpPercent: 30,
      opsRevisionQuota: 5,
      opsRevisionNotice: null,
      opsSettlementNote: "Lunas sebelum file final dikirim.",
      opsWorkingDays: [1, 2, 3, 4, 5, 6],
      opsWorkingHoursStart: "09:00",
      opsWorkingHoursEnd: "17:00",
      opsSameDayCutoff: "13:00",
    };
    expect(tx.studioSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "default" }, update: data, create: expect.objectContaining(data) }));
  });

  it("riwayat aktivitas berisi nilai lama dan baru", async () => {
    await saveStudioOperations(next, "u1");
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: { entityType: "StudioSettings", entityId: "default", action: "OPERATIONS_UPDATED", actorId: "u1", previousValue: OPERATIONS_DEFAULTS, newValue: next },
    });
  });

  it("cache dibuang setelah tersimpan, sehingga bot dan portal langsung memakai nilai baru", async () => {
    const order: string[] = [];
    db.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => {
      const r = await fn(tx);
      order.push("commit");
      return r;
    });
    ops.invalidate.mockImplementation(() => order.push("invalidate"));
    expect(await saveStudioOperations(next, "u1")).toEqual(next);
    expect(order).toEqual(["invalidate", "commit", "invalidate"]);
  });
});
