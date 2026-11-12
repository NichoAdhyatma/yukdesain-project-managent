import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  waConversation: { findFirst: vi.fn() },
  projectUpdate: { findUnique: vi.fn() },
  revision: { findUnique: vi.fn() },
  paymentAccount: { findMany: vi.fn() },
  clientProjectNotice: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
}));
const outbound = vi.hoisted(() => ({ sendSystemText: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/whatsapp/outbound", () => outbound);
vi.mock("@/lib/studio", () => ({ getStudioSettings: async () => ({ name: "YukDesain Studio" }) }));
vi.mock("@/lib/whatsapp/env", () => ({ getAppPublicUrl: () => "https://portal.test" }));

import { notifyClientProjectEvent, PROGRESS_COOLDOWN_MS } from "./client-project-events";

const now = new Date("2026-11-08T10:00:00Z");
const project = {
  id: "p1",
  clientId: "c1",
  clientName: "Sari",
  service: { name: "Logo Minimalis" },
  clientLinks: [{ token: "tok123" }],
};
const p2002 = () => new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  db.project.findUnique.mockResolvedValue(project);
  db.waConversation.findFirst.mockResolvedValue({ id: "conv_1" });
  db.clientProjectNotice.create.mockResolvedValue({ id: "n1" });
  db.clientProjectNotice.findFirst.mockResolvedValue(null);
  outbound.sendSystemText.mockResolvedValue({ ok: true, via: "text", messageId: "m1" });
});

describe("notifyClientProjectEvent (docs/CLIENT_NOTIFICATIONS.md)", () => {
  it("kirim ke percakapan terbaru klien yang bukan sandbox dan tidak diblokir, dengan link portal aktif", async () => {
    expect(await notifyClientProjectEvent("p1", { kind: "STARTED" }, now)).toBe("SENT");
    expect(db.waConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: "c1", isSandbox: false, blockedAt: null }, orderBy: { lastInboundAt: "desc" } }),
    );
    const [conv, text] = outbound.sendSystemText.mock.calls[0];
    expect(conv).toBe("conv_1");
    expect(text).toContain("https://portal.test/client/tok123");
    expect(db.clientProjectNotice.update).toHaveBeenLastCalledWith({ where: { id: "n1" }, data: expect.objectContaining({ status: "SENT" }) });
  });

  it("tanpa percakapan WA → SKIPPED NO_CONVERSATION tanpa error", async () => {
    db.waConversation.findFirst.mockResolvedValue(null);
    expect(await notifyClientProjectEvent("p1", { kind: "STARTED" }, now)).toBe("SKIPPED");
    expect(db.clientProjectNotice.update).toHaveBeenLastCalledWith({ where: { id: "n1" }, data: { status: "SKIPPED", reason: "NO_CONVERSATION" } });
    expect(outbound.sendSystemText).not.toHaveBeenCalled();
  });

  it("kejadian yang sama untuk project yang sama → DUPLICATE, tidak dikirim lagi", async () => {
    db.clientProjectNotice.create.mockRejectedValue(p2002());
    expect(await notifyClientProjectEvent("p1", { kind: "STARTED" }, now)).toBe("DUPLICATE");
    expect(outbound.sendSystemText).not.toHaveBeenCalled();
  });

  it("di luar jendela 24 jam Meta → SKIPPED; gagal lain → FAILED dengan kode", async () => {
    outbound.sendSystemText.mockResolvedValue({ ok: false, via: null, errorCode: "OUTSIDE_SERVICE_WINDOW", messageId: null });
    expect(await notifyClientProjectEvent("p1", { kind: "FINAL_SUBMITTED" }, now)).toBe("SKIPPED");
    expect(db.clientProjectNotice.update).toHaveBeenLastCalledWith({ where: { id: "n1" }, data: { status: "SKIPPED", reason: "OUTSIDE_SERVICE_WINDOW" } });
    outbound.sendSystemText.mockResolvedValue({ ok: false, via: "text", errorCode: "131000", messageId: "m2" });
    expect(await notifyClientProjectEvent("p1", { kind: "COMPLETED" }, now)).toBe("FAILED");
    expect(db.clientProjectNotice.update).toHaveBeenLastCalledWith({ where: { id: "n1" }, data: { status: "FAILED", reason: "131000" } });
  });

  describe("PROGRESS", () => {
    beforeEach(() => db.projectUpdate.findUnique.mockResolvedValue({ projectId: "p1", progress: 59, description: "Sketsa tahap 2", notifyClient: true }));

    it("kabar progres terkirim < 60 menit lalu → PENDING, PENDING lama project dihapus, tidak dikirim", async () => {
      db.clientProjectNotice.findFirst.mockResolvedValue({ sentAt: new Date(now.getTime() - 30 * 60_000) });
      expect(await notifyClientProjectEvent("p1", { kind: "PROGRESS", updateId: "u2" }, now)).toBe("PENDING");
      expect(db.clientProjectNotice.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1", event: "PROGRESS", status: "PENDING" } });
      expect(db.clientProjectNotice.create).toHaveBeenCalledWith({ data: { projectId: "p1", event: "PROGRESS", refId: "u2", status: "PENDING" } });
      expect(outbound.sendSystemText).not.toHaveBeenCalled();
    });

    it("terkirim langsung → PENDING lama project itu dibuang dulu (tidak menyusul setelah update yang lebih baru)", async () => {
      db.clientProjectNotice.findFirst.mockResolvedValue({ sentAt: new Date(now.getTime() - PROGRESS_COOLDOWN_MS - 60_000) });
      expect(await notifyClientProjectEvent("p1", { kind: "PROGRESS", updateId: "u3" }, now)).toBe("SENT");
      expect(db.clientProjectNotice.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1", event: "PROGRESS", status: "PENDING" } });
    });

    it("lewat jeda → terkirim dengan persen dan catatan", async () => {
      db.clientProjectNotice.findFirst.mockResolvedValue({ sentAt: new Date(now.getTime() - PROGRESS_COOLDOWN_MS - 60_000) });
      expect(await notifyClientProjectEvent("p1", { kind: "PROGRESS", updateId: "u2" }, now)).toBe("SENT");
      expect(outbound.sendSystemText.mock.calls[0][1]).toContain("progres *59%*");
    });

    it("desainer tidak mencentang Kabari klien → tidak dicatat, SKIPPED", async () => {
      db.projectUpdate.findUnique.mockResolvedValue({ projectId: "p1", progress: 59, description: "x", notifyClient: false });
      expect(await notifyClientProjectEvent("p1", { kind: "PROGRESS", updateId: "u2" }, now)).toBe("SKIPPED");
      expect(db.clientProjectNotice.create).not.toHaveBeenCalled();
    });
  });

  it.each(["FINAL_SUBMITTED", "COMPLETED"] as const)("%s membuang kabar progres yang masih tertahan", async (kind) => {
    expect(await notifyClientProjectEvent("p1", { kind }, now)).toBe("SENT");
    expect(db.clientProjectNotice.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p1", event: "PROGRESS", status: "PENDING" } });
  });

  it("error tak terduga tidak dilempar → FAILED", async () => {
    db.project.findUnique.mockRejectedValue(new Error("db down"));
    expect(await notifyClientProjectEvent("p1", { kind: "STARTED" }, now)).toBe("FAILED");
  });
});

describe("sendNoticeNow: kabar progres tertunda tidak menyusul setelah final", () => {
  it("project sudah kirim final atau selesai → SKIPPED SUPERSEDED, tidak dikirim", async () => {
    db.clientProjectNotice.findUnique.mockResolvedValue({ id: "n9", projectId: "p1", event: "PROGRESS", refId: "u9" });
    db.project.findUnique.mockResolvedValue({ ...project, finalSubmittedAt: new Date("2026-11-08T09:00:00Z"), status: "SEDANG_DIKERJAKAN" });
    const { sendNoticeNow } = await import("./client-project-events");
    expect(await sendNoticeNow("n9")).toBe("SKIPPED");
    expect(db.clientProjectNotice.update).toHaveBeenCalledWith({ where: { id: "n9" }, data: { status: "SKIPPED", reason: "SUPERSEDED" } });
    expect(outbound.sendSystemText).not.toHaveBeenCalled();
  });
});

describe("hasil final dan pelunasan (2026-11-12)", () => {
  it("FINAL_SUBMITTED belum lunas: sisa pelunasan dan rekening aktif ikut dikirim", async () => {
    db.project.findUnique.mockResolvedValue({ ...project, agreedPrice: 250000, paidAmount: 50000 });
    db.paymentAccount.findMany.mockResolvedValue([{ name: "BCA", accountNumber: "2141358555", accountHolder: "Mochammad Rizal" }]);
    expect(await notifyClientProjectEvent("p1", { kind: "FINAL_SUBMITTED" }, now)).toBe("SENT");
    const text = outbound.sendSystemText.mock.calls[0][1];
    expect(text).toContain("File final bisa diunduh setelah pelunasan *Rp200.000*.");
    expect(text).toContain("• BCA 2141358555 a.n. Mochammad Rizal");
    expect(db.paymentAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it("FINAL_SUBMITTED sudah lunas: tanpa tagihan", async () => {
    db.project.findUnique.mockResolvedValue({ ...project, agreedPrice: 250000, paidAmount: 250000 });
    await notifyClientProjectEvent("p1", { kind: "FINAL_SUBMITTED" }, now);
    expect(outbound.sendSystemText.mock.calls[0][1]).not.toContain("pelunasan");
    expect(db.paymentAccount.findMany).not.toHaveBeenCalled();
  });

  it("FILES_UNLOCKED dikirim sekali per project", async () => {
    db.project.findUnique.mockResolvedValue({ ...project, agreedPrice: 250000, paidAmount: 250000 });
    expect(await notifyClientProjectEvent("p1", { kind: "FILES_UNLOCKED" }, now)).toBe("SENT");
    expect(db.clientProjectNotice.create).toHaveBeenCalledWith({ data: { projectId: "p1", event: "FILES_UNLOCKED", refId: "-", status: "SENDING" }, select: { id: true } });
    expect(outbound.sendSystemText.mock.calls[0][1]).toContain("File final sudah bisa diunduh");
  });
});
