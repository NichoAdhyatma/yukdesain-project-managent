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

// Cara kirim hasil akhir (permintaan owner 14 Nov): file (unggah), link (Google Drive), atau lewat WhatsApp langsung.
describe("POST submit-final: cara kirim", () => {
  it("tanpa cara kirim (form lama) → file, dicatat FILE", async () => {
    expect((await post({ description: "Logo final", attachmentIds: ["att_f"] })).status).toBe(200);
    expect(db.project.update.mock.calls[0][0].data).toMatchObject({ finalDelivery: "FILE", finalLink: null });
  });

  it("link: wajib URL http(s); disimpan, tanpa file", async () => {
    expect((await post({ description: "Final di Drive", method: "LINK" })).status).toBe(400);
    expect((await post({ description: "Final di Drive", method: "LINK", link: "drive.google.com/x" })).status).toBe(400);
    expect((await post({ description: "Final di Drive", method: "LINK", link: "javascript:alert(1)" })).status).toBe(400);
    expect(db.project.update).not.toHaveBeenCalled();
    const res = await post({ description: "Final di Drive", method: "LINK", link: " https://drive.google.com/drive/folders/abc " });
    expect(res.status).toBe(200);
    expect(db.project.update.mock.calls[0][0].data).toMatchObject({ finalDelivery: "LINK", finalLink: "https://drive.google.com/drive/folders/abc" });
    expect(db.attachment.updateMany).not.toHaveBeenCalled();
  });

  it("lewat WhatsApp: tanpa file dan link; klien dikabari (pengingat pelunasan bila belum lunas)", async () => {
    const res = await post({ description: "File dikirim lewat WA", method: "WHATSAPP" });
    expect(res.status).toBe(200);
    expect(db.project.update.mock.calls[0][0].data).toMatchObject({ finalDelivery: "WHATSAPP", finalLink: null });
    expect(db.attachment.updateMany).not.toHaveBeenCalled();
    await Promise.all(afterFns.map((fn) => fn()));
    expect(notices.notifyClientProjectEvent).toHaveBeenCalledWith("p1", { kind: "FINAL_SUBMITTED" });
  });

  it("cara kirim tidak dikenal → 400", async () => {
    expect((await post({ description: "x", method: "EMAIL" })).status).toBe(400);
  });
});
