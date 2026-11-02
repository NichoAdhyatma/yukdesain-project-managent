import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  waIntake: { findFirst: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);

import { GET, PUT } from "./route";

const put = (body: unknown) => PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue({ id: "u_owner", roles: ["OWNER"] });
  db.user.findUniqueOrThrow.mockResolvedValue({ waNumber: null });
  db.user.findFirst.mockResolvedValue(null);
  db.waIntake.findFirst.mockResolvedValue(null);
  db.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
});

describe("/api/settings/whatsapp/owner-number", () => {
  it("bukan owner → 403", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await GET()).status).toBe(403);
    expect((await put({ waNumber: "081234567890" })).status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("nomor dinormalisasi ke 62… dan disimpan untuk user yang login", async () => {
    const res = await put({ waNumber: "0812-3456-7890" });
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u_owner" }, data: { waNumber: "6281234567890" } });
    expect(db.activityLog.create.mock.calls[0][0].data.action).toBe("WA_OWNER_NUMBER_UPDATED");
  });

  it("null menghapus nomor", async () => {
    await put({ waNumber: null });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u_owner" }, data: { waNumber: null } });
  });

  it("nomor tidak valid → 400", async () => {
    expect((await put({ waNumber: "123" })).status).toBe(400);
  });

  it("dipakai owner lain atau pernah order sebagai klien → 409", async () => {
    db.user.findFirst.mockResolvedValue({ id: "u_lain" });
    expect((await put({ waNumber: "081234567890" })).status).toBe(409);
    db.user.findFirst.mockResolvedValue(null);
    db.waIntake.findFirst.mockResolvedValue({ id: "in_1" });
    expect((await put({ waNumber: "081234567890" })).status).toBe(409);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
