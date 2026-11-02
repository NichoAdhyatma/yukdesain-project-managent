import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, WaIntakeStatus } from "@prisma/client";
import {
  INTAKE_TRANSITIONS,
  IntakeError,
  computeDpAmount,
  confirmBrief,
  nextStatus,
  transitionIntake,
  updateBriefDraft,
  type IntakeAction,
  type IntakeActor,
} from "./intake";

const ALL: WaIntakeStatus[] = ["COLLECTING", "AWAITING_QUOTE", "QUOTED", "DP_REVIEW", "APPROVED", "CANCELLED"];

// Tabel §3.2 ditulis ulang sebagai daftar transisi yang diizinkan.
const ALLOWED: [WaIntakeStatus, IntakeAction, IntakeActor, WaIntakeStatus][] = [
  ["COLLECTING", "confirm_brief", "AI", "AWAITING_QUOTE"],
  ["AWAITING_QUOTE", "reopen_brief", "AI", "COLLECTING"],
  ["AWAITING_QUOTE", "quote", "ADMIN", "QUOTED"],
  ["QUOTED", "quote", "ADMIN", "QUOTED"],
  ["QUOTED", "submit_proof", "AI", "DP_REVIEW"],
  ["DP_REVIEW", "reject_proof", "ADMIN", "QUOTED"],
  ["DP_REVIEW", "approve", "ADMIN", "APPROVED"],
  ["COLLECTING", "cancel", "AI", "CANCELLED"],
  ["AWAITING_QUOTE", "cancel", "AI", "CANCELLED"],
  ["QUOTED", "cancel", "AI", "CANCELLED"],
  ["COLLECTING", "cancel", "ADMIN", "CANCELLED"],
  ["AWAITING_QUOTE", "cancel", "ADMIN", "CANCELLED"],
  ["QUOTED", "cancel", "ADMIN", "CANCELLED"],
  ["DP_REVIEW", "cancel", "ADMIN", "CANCELLED"],
];

describe("nextStatus", () => {
  it.each(ALLOWED)("%s --%s(%s)--> %s", (from, action, actor, to) => {
    expect(nextStatus(from, action, actor)).toBe(to);
  });

  it("semua kombinasi lain ditolak", () => {
    const actions = [...new Set(INTAKE_TRANSITIONS.map((t) => t.action))];
    const allowed = new Set(ALLOWED.map(([f, a, by]) => `${f}|${a}|${by}`));
    for (const from of ALL) {
      for (const action of actions) {
        for (const actor of ["AI", "ADMIN"] as const) {
          if (allowed.has(`${from}|${action}|${actor}`)) continue;
          expect(nextStatus(from, action, actor), `${from} ${action} ${actor}`).toBeNull();
        }
      }
    }
  });

  it("AI tidak bisa memberi harga, approve, atau membatalkan saat DP_REVIEW", () => {
    expect(nextStatus("AWAITING_QUOTE", "quote", "AI")).toBeNull();
    expect(nextStatus("DP_REVIEW", "approve", "AI")).toBeNull();
    expect(nextStatus("DP_REVIEW", "cancel", "AI")).toBeNull();
  });

  it("APPROVED dan CANCELLED final", () => {
    expect(nextStatus("APPROVED", "cancel", "ADMIN")).toBeNull();
    expect(nextStatus("CANCELLED", "cancel", "ADMIN")).toBeNull();
  });
});

describe("computeDpAmount", () => {
  it.each([
    [2500000, 1250000],
    [1500001, 750001],
    [99, 50],
    [0, 0],
  ])("ceil(%i × 50%%) = %i", (price, dp) => {
    expect(computeDpAmount(price)).toBe(dp);
  });
});

// Fake db: satu baris intake di memori, updateMany menghormati where id/status/updatedAt.
type Row = {
  id: string;
  status: WaIntakeStatus;
  briefDraft: Record<string, unknown>;
  updatedAt: Date;
  service: { code: string } | null;
  [k: string]: unknown;
};

function makeDb(row: Row) {
  const db = {
    row,
    waIntake: {
      findUnique: vi.fn(async () => ({ ...db.row })),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const match =
          where.id === db.row.id &&
          (where.status === undefined || where.status === db.row.status) &&
          (where.updatedAt === undefined || (where.updatedAt as Date).getTime() === db.row.updatedAt.getTime());
        if (!match) return { count: 0 };
        db.row = { ...db.row, ...data, updatedAt: new Date(db.row.updatedAt.getTime() + 1) } as Row;
        return { count: 1 };
      }),
    },
  };
  return db;
}

const asDb = (db: ReturnType<typeof makeDb>) => db as unknown as Prisma.TransactionClient;
const baseRow = (over: Partial<Row> = {}): Row => ({
  id: "in_1",
  status: "COLLECTING",
  briefDraft: {},
  updatedAt: new Date("2026-11-01T00:00:00Z"),
  service: { code: "SVC-01" },
  ...over,
});

describe("transitionIntake", () => {
  it("update dengan status lama di where", async () => {
    const db = makeDb(baseRow({ status: "DP_REVIEW" }));
    await expect(
      transitionIntake(asDb(db), { intakeId: "in_1", from: "DP_REVIEW", action: "approve", actor: "ADMIN" }),
    ).resolves.toBe("APPROVED");
    expect(db.waIntake.updateMany.mock.calls[0][0].where).toEqual({ id: "in_1", status: "DP_REVIEW" });
  });

  it("approve ganda → yang kedua CONFLICT", async () => {
    const db = makeDb(baseRow({ status: "DP_REVIEW" }));
    const approve = () =>
      transitionIntake(asDb(db), { intakeId: "in_1", from: "DP_REVIEW", action: "approve", actor: "ADMIN" });
    await approve();
    await expect(approve()).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("transisi yang tidak diizinkan tidak menyentuh DB", async () => {
    const db = makeDb(baseRow());
    await expect(
      transitionIntake(asDb(db), { intakeId: "in_1", from: "COLLECTING", action: "approve", actor: "ADMIN" }),
    ).rejects.toBeInstanceOf(IntakeError);
    expect(db.waIntake.updateMany).not.toHaveBeenCalled();
  });
});

describe("updateBriefDraft", () => {
  beforeEach(() => vi.clearAllMocks());

  it("COLLECTING: merge dan kembalikan field wajib yang kosong", async () => {
    const db = makeDb(baseRow({ briefDraft: { brand_name: "Kopi Senja" } }));
    const r = await updateBriefDraft(asDb(db), { intakeId: "in_1", fields: { colors: "coklat" }, source: "AI" });
    expect(r).toEqual({ status: "COLLECTING", missingRequired: ["business_desc"] });
    expect(db.row.briefDraft).toEqual({ brand_name: "Kopi Senja", colors: "coklat" });
  });

  it("AWAITING_QUOTE: brief berubah → kembali ke COLLECTING, ringkasan dihapus", async () => {
    const db = makeDb(
      baseRow({ status: "AWAITING_QUOTE", briefSummary: "ringkas", briefConfirmedAt: new Date(), briefDraft: { brand_name: "A" } }),
    );
    const r = await updateBriefDraft(asDb(db), { intakeId: "in_1", fields: { brand_name: "B" }, source: "AI" });
    expect(r.status).toBe("COLLECTING");
    expect(db.row).toMatchObject({ status: "COLLECTING", briefSummary: null, briefConfirmedAt: null });
  });

  it.each(["QUOTED", "DP_REVIEW", "APPROVED", "CANCELLED"] as const)("AI ditolak saat %s", async (status) => {
    const db = makeDb(baseRow({ status }));
    await expect(
      updateBriefDraft(asDb(db), { intakeId: "in_1", fields: { brand_name: "B" }, source: "AI" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("admin boleh edit saat QUOTED tanpa mengubah status, ditandai briefEditedByAdmin", async () => {
    const db = makeDb(baseRow({ status: "QUOTED" }));
    const r = await updateBriefDraft(asDb(db), { intakeId: "in_1", fields: { brand_name: "B" }, source: "ADMIN" });
    expect(r.status).toBe("QUOTED");
    expect(db.row.briefEditedByAdmin).toBe(true);
  });

  it("admin ditolak setelah APPROVED", async () => {
    const db = makeDb(baseRow({ status: "APPROVED" }));
    await expect(
      updateBriefDraft(asDb(db), { intakeId: "in_1", fields: { brand_name: "B" }, source: "ADMIN" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("kunci di luar config → VALIDATION_ERROR", async () => {
    const db = makeDb(baseRow());
    await expect(
      updateBriefDraft(asDb(db), { intakeId: "in_1", fields: { sticker_shape: "bulat" }, source: "AI" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", details: { invalidKeys: ["sticker_shape"] } });
  });

  it("layanan belum dipilih → UNPROCESSABLE_ENTITY", async () => {
    const db = makeDb(baseRow({ service: null }));
    await expect(
      updateBriefDraft(asDb(db), { intakeId: "in_1", fields: { brand_name: "B" }, source: "AI" }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_ENTITY" });
  });

  it("draft berubah di tengah jalan (pesan bersamaan) → CONFLICT, tidak menimpa", async () => {
    const db = makeDb(baseRow({ briefDraft: { brand_name: "A" } }));
    const stale = { ...db.row };
    db.waIntake.findUnique.mockResolvedValueOnce(stale);
    await updateBriefDraft(asDb(db), { intakeId: "in_1", fields: { colors: "merah" }, source: "AI" });
    // panggilan kedua membaca snapshot lama yang sama
    db.waIntake.findUnique.mockResolvedValueOnce(stale);
    await expect(
      updateBriefDraft(asDb(db), { intakeId: "in_1", fields: { business_desc: "kopi" }, source: "AI" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.row.briefDraft).toEqual({ brand_name: "A", colors: "merah" });
  });
});

describe("confirmBrief", () => {
  const complete = { brand_name: "Kopi Senja", business_desc: "kopi keliling", colors: "coklat" };

  it("lengkap → AWAITING_QUOTE dengan ringkasan", async () => {
    const db = makeDb(baseRow({ briefDraft: complete }));
    await expect(confirmBrief(asDb(db), { intakeId: "in_1", summary: " Logo Kopi Senja " })).resolves.toBe("AWAITING_QUOTE");
    expect(db.row).toMatchObject({ status: "AWAITING_QUOTE", briefSummary: "Logo Kopi Senja" });
    expect(db.row.briefConfirmedAt).toBeInstanceOf(Date);
  });

  it("field wajib kosong → ditolak dengan daftar field", async () => {
    const db = makeDb(baseRow({ briefDraft: { brand_name: "A" } }));
    await expect(confirmBrief(asDb(db), { intakeId: "in_1", summary: "x" })).rejects.toMatchObject({
      code: "UNPROCESSABLE_ENTITY",
      details: { missingRequired: ["business_desc", "colors"] },
    });
    expect(db.row.status).toBe("COLLECTING");
  });

  it("ringkasan kosong ditolak", async () => {
    const db = makeDb(baseRow({ briefDraft: complete }));
    await expect(confirmBrief(asDb(db), { intakeId: "in_1", summary: "  " })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("bukan COLLECTING → CONFLICT", async () => {
    const db = makeDb(baseRow({ status: "QUOTED", briefDraft: complete }));
    await expect(confirmBrief(asDb(db), { intakeId: "in_1", summary: "x" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
