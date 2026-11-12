import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  projectAssignment: { findFirst: vi.fn() },
  project: { findUnique: vi.fn(), update: vi.fn() },
  projectUpdate: { create: vi.fn() },
  attachment: { updateMany: vi.fn(), count: vi.fn() },
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

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "p1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  afterFns.length = 0;
  session.getCurrentUser.mockResolvedValue({ id: "d1", roles: ["DESIGNER"] });
  db.projectAssignment.findFirst.mockResolvedValue({ id: "a1" });
  db.project.findUnique.mockResolvedValue({ id: "p1", finalSubmittedAt: null });
  db.project.update.mockResolvedValue({ id: "p1" });
  db.attachment.count.mockResolvedValue(1);
});

describe("POST submit-final (2026-11-12)", () => {
  it("wajib minimal satu file hasil akhir", async () => {
    const res = await post({ description: "Logo final", attachmentIds: [] });
    expect(res.status).toBe(400);
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("file harus milik project ini; file project lain ditolak", async () => {
    db.attachment.count.mockResolvedValue(0);
    const res = await post({ description: "Logo final", attachmentIds: ["att_lain"] });
    expect(res.status).toBe(400);
    expect(db.attachment.count).toHaveBeenCalledWith({ where: { id: { in: ["att_lain"] }, projectId: "p1", updateId: null } });
    expect(db.project.update).not.toHaveBeenCalled();
  });

  it("hasil akhir tercatat sebagai update 100% berbahasa Indonesia, file jadi FINAL, klien dikabari sekali", async () => {
    const res = await post({ description: "Logo final AI + PNG", attachmentIds: ["att_f"] });
    expect(res.status).toBe(200);
    expect(db.projectUpdate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ projectId: "p1", progress: 100, notifyClient: false, description: "Hasil akhir: Logo final AI + PNG" }),
    });
    expect(db.attachment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["att_f"] }, projectId: "p1", updateId: null },
      data: { category: "FINAL" },
    });
    await Promise.all(afterFns.map((f) => f()));
    expect(notices.notifyClientProjectEvent).toHaveBeenCalledWith("p1", { kind: "FINAL_SUBMITTED" });
  });
});
