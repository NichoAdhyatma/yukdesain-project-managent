import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findMany: vi.fn(), findUnique: vi.fn() },
  statusLabel: { findMany: vi.fn() },
}));
const env = vi.hoisted(() => ({ getAppPublicUrl: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("../env", () => env);

import { getClientProjectSummaries, getProjectDetailByCode } from "./client-safe-dto";

// Baris DB "nakal": berisi field internal yang seharusnya tidak pernah ikut.
const leakyRow = {
  id: "proj_internal_id",
  projectNumber: "PRJ-20261101-ABC123",
  status: "SELESAI",
  deadline: new Date("2026-11-20T00:00:00Z"),
  service: { name: "Logo Minimalis", id: "svc_internal" },
  agreedPrice: 2500000,
  paidAmount: 1250000,
  paymentStatus: "PARTIALLY_PAID",
  finalSubmittedAt: new Date(),
  finalApprovedAt: null,
  brief: { id: "brief_1" },
  updates: [{ progress: 80, description: "Finalisasi warna logo", createdAt: new Date("2026-11-18T03:00:00Z"), authorId: "u_designer" }],
  _count: { revisions: 1 },
  invoices: [{ invoiceNumber: "STRUK-2026-007", total: 2500000, status: "PARTIALLY_PAID", id: "inv_internal" }],
  clientLinks: [{ token: "abcdef0123456789" }],
  // ↓ tidak boleh muncul
  notes: "Klien rewel, harga khusus",
  ownerId: "u_owner",
  clientId: "cli_1",
  assignments: [{ freelancerPayout: 400000, designer: { name: "Desainer A", email: "a@x" } }],
};

const FORBIDDEN = ["proj_internal_id", "notes", "rewel", "ownerId", "u_owner", "freelancerPayout", "400000", "Desainer", "u_designer", "svc_internal", "inv_internal", "cli_1"];

beforeEach(() => {
  vi.clearAllMocks();
  db.statusLabel.findMany.mockResolvedValue([{ value: "SELESAI", label: "Selesai" }]);
  env.getAppPublicUrl.mockReturnValue("https://portal.yukdesain.com");
});

describe("getProjectDetailByCode", () => {
  it("hanya field yang diizinkan, walau baris DB berisi data internal", async () => {
    db.project.findUnique.mockResolvedValue(leakyRow);
    const dto = await getProjectDetailByCode(" prj-20261101-abc123 ");

    expect(db.project.findUnique.mock.calls[0][0].where).toEqual({ projectNumber: "PRJ-20261101-ABC123" });
    expect(dto).toEqual({
      projectNumber: "PRJ-20261101-ABC123",
      serviceName: "Logo Minimalis",
      statusLabel: "Selesai",
      deadline: "2026-11-20",
      progress: { percent: 80, note: "Finalisasi warna logo", updatedAt: "2026-11-18" },
      briefSubmitted: true,
      revisionCount: 1,
      revisionQuotaRemaining: 2,
      finalSubmitted: true,
      finalApproved: false,
      invoice: { invoiceNumber: "STRUK-2026-007", total: 2500000, remaining: 1250000, paymentStatus: "PARTIALLY_PAID" },
      portalUrl: "https://portal.yukdesain.com/client/abcdef0123456789",
    });
    const json = JSON.stringify(dto);
    for (const f of FORBIDDEN) expect(json).not.toContain(f);
  });

  it("query tidak meminta field internal sama sekali", async () => {
    db.project.findUnique.mockResolvedValue(null);
    await getProjectDetailByCode("PRJ-1");
    const select = JSON.stringify(db.project.findUnique.mock.calls[0][0].select);
    for (const f of ["notes", "ownerId", "assignments", "freelancerPayout", "activity", "clientId"]) {
      expect(select).not.toContain(f);
    }
  });

  it("invoice hanya saat SELESAI", async () => {
    db.project.findUnique.mockResolvedValue({ ...leakyRow, status: "SEDANG_DIKERJAKAN" });
    expect((await getProjectDetailByCode("X"))?.invoice).toBeNull();
  });

  it("tanpa APP_PUBLIC_URL → portalUrl null (bukan URL tebakan)", async () => {
    env.getAppPublicUrl.mockReturnValue(null);
    db.project.findUnique.mockResolvedValue(leakyRow);
    expect((await getProjectDetailByCode("X"))?.portalUrl).toBeNull();
  });

  it("kode tidak ada / kosong → null", async () => {
    db.project.findUnique.mockResolvedValue(null);
    expect(await getProjectDetailByCode("PRJ-X")).toBeNull();
    expect(await getProjectDetailByCode("  ")).toBeNull();
  });
});

describe("getClientProjectSummaries", () => {
  it("maks 5 project milik klien itu saja, field ringkas", async () => {
    db.project.findMany.mockResolvedValue([leakyRow]);
    const list = await getClientProjectSummaries("cli_1");
    expect(db.project.findMany.mock.calls[0][0]).toMatchObject({ where: { clientId: "cli_1" }, take: 5 });
    expect(list).toEqual([
      { projectNumber: "PRJ-20261101-ABC123", serviceName: "Logo Minimalis", statusLabel: "Selesai", deadline: "2026-11-20" },
    ]);
    const json = JSON.stringify(list);
    for (const f of FORBIDDEN) expect(json).not.toContain(f);
  });

  it("label status default jika tabel label kosong", async () => {
    db.statusLabel.findMany.mockResolvedValue([]);
    db.project.findMany.mockResolvedValue([{ ...leakyRow, status: "SEDANG_DIKERJAKAN" }]);
    expect((await getClientProjectSummaries("cli_1"))[0].statusLabel).toBe("Sedang dikerjakan");
  });
});
