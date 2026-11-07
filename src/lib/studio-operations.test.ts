import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ studioSettings: { findUnique: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import {
  OPERATIONS_DEFAULTS,
  formatWorkingHours,
  getStudioOperations,
  invalidateOperationsCache,
  isWithinWorkingHours,
  nextWorkingStart,
  studioOperationsSchema,
} from "./studio-operations";

beforeEach(() => {
  vi.resetAllMocks();
  invalidateOperationsCache();
});

describe("studioOperationsSchema (docs/STUDIO_OPERATIONS.md)", () => {
  it("menerima default", () => {
    expect(studioOperationsSchema.safeParse(OPERATIONS_DEFAULTS).success).toBe(true);
  });

  it.each([
    [{ dpPercent: 5 }, "dpPercent"],
    [{ revisionQuota: 11 }, "revisionQuota"],
    [{ workingDays: [] }, "workingDays"],
    [{ workingDays: [0] }, "workingDays"],
    [{ workingHoursStart: "17:00", workingHoursEnd: "09:00" }, "workingHoursEnd"],
    [{ workingHoursStart: "9:00" }, "workingHoursStart"],
  ])("menolak %j", (patch, field) => {
    const r = studioOperationsSchema.safeParse({ ...OPERATIONS_DEFAULTS, ...patch });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === field)).toBe(true);
  });
});

describe("jam kerja (WIB, apa pun zona server)", () => {
  it("Senin 09.30 WIB = jam kerja; 17.30 WIB dan Minggu = di luar", () => {
    expect(isWithinWorkingHours(new Date("2026-11-09T02:30:00Z"), OPERATIONS_DEFAULTS)).toBe(true);
    expect(isWithinWorkingHours(new Date("2026-11-09T10:30:00Z"), OPERATIONS_DEFAULTS)).toBe(false);
    expect(isWithinWorkingHours(new Date("2026-11-08T03:00:00Z"), OPERATIONS_DEFAULTS)).toBe(false);
  });

  it("awal jam kerja berikutnya", () => {
    expect(nextWorkingStart(new Date("2026-11-08T03:00:00Z"), OPERATIONS_DEFAULTS).toISOString()).toBe("2026-11-09T02:00:00.000Z");
    expect(nextWorkingStart(new Date("2026-11-09T10:30:00Z"), OPERATIONS_DEFAULTS).toISOString()).toBe("2026-11-10T02:00:00.000Z");
    const during = new Date("2026-11-09T02:30:00Z");
    expect(nextWorkingStart(during, OPERATIONS_DEFAULTS)).toEqual(during);
  });

  it("format untuk klien", () => {
    expect(formatWorkingHours(OPERATIONS_DEFAULTS)).toBe("Senin–Sabtu, 09.00–17.00 WIB");
    expect(formatWorkingHours({ ...OPERATIONS_DEFAULTS, workingDays: [1, 3, 5] })).toBe("Senin, Rabu, Jumat, 09.00–17.00 WIB");
  });
});

describe("getStudioOperations", () => {
  it("tanpa baris pengaturan → default", async () => {
    db.studioSettings.findUnique.mockResolvedValue(null);
    expect(await getStudioOperations()).toEqual(OPERATIONS_DEFAULTS);
  });

  it("teks null memakai default; angka dari DB", async () => {
    db.studioSettings.findUnique.mockResolvedValue({
      opsDpPercent: 30,
      opsRevisionQuota: 5,
      opsRevisionNotice: null,
      opsSettlementNote: "Lunas sebelum file final dikirim.",
      opsWorkingDays: [1, 2, 3, 4, 5],
      opsWorkingHoursStart: "08:00",
      opsWorkingHoursEnd: "16:00",
      opsOutsideHoursNote: null,
    });
    expect(await getStudioOperations()).toEqual({
      ...OPERATIONS_DEFAULTS,
      dpPercent: 30,
      revisionQuota: 5,
      settlementNote: "Lunas sebelum file final dikirim.",
      workingDays: [1, 2, 3, 4, 5],
      workingHoursStart: "08:00",
      workingHoursEnd: "16:00",
    });
  });
});
