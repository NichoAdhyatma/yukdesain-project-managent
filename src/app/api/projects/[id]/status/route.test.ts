import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn(), update: vi.fn() },
  projectAssignment: { findFirst: vi.fn() },
  activityLog: { create: vi.fn() },
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const notices = vi.hoisted(() => ({ notifyClientProjectEvent: vi.fn(async () => "SENT") }));
const afterFns = vi.hoisted(() => [] as (() => Promise<unknown>)[]);

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/notifications/client-project-events", () => notices);
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => Promise<unknown>) => afterFns.push(fn),
}));

import { PUT } from "./route";

const put = (status: string) =>
  PUT(new Request("http://x", { method: "PUT", body: JSON.stringify({ status }) }), { params: Promise.resolve({ id: "p1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  afterFns.length = 0;
  db.project.findUnique.mockResolvedValue({ id: "p1", status: "SEDANG_DIKERJAKAN" });
  db.project.update.mockResolvedValue({ id: "p1" });
  db.projectAssignment.findFirst.mockResolvedValue({ id: "a1" });
});

// Project Nicho 12 Nov: desainer menekan "Selesai" → klien menerima "Project sudah selesai" sebelum hasil final dikirim.
describe("PUT /api/projects/[id]/status: Selesai hanya lewat approve klien atau owner", () => {
  it("desainer tidak bisa mengubah status ke SELESAI", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d1", roles: ["DESIGNER"] });
    const res = await put("SELESAI");
    expect(res.status).toBe(403);
    expect(db.project.update).not.toHaveBeenCalled();
    expect(afterFns).toHaveLength(0);
  });

  it("desainer tetap bisa memindah ke Sedang dikerjakan", async () => {
    db.project.findUnique.mockResolvedValue({ id: "p1", status: "BELUM_DIKERJAKAN" });
    session.getCurrentUser.mockResolvedValue({ id: "d1", roles: ["DESIGNER"] });
    expect((await put("SEDANG_DIKERJAKAN")).status).toBe(200);
  });

  it("owner tetap bisa menandai SELESAI", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "o1", roles: ["OWNER"] });
    expect((await put("SELESAI")).status).toBe(200);
    expect(db.project.update).toHaveBeenCalled();
  });
});
