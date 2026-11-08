import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  clientProjectNotice: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
}));
const events = vi.hoisted(() => ({ sendNoticeNow: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./client-project-events", async (orig) => ({
  ...(await orig<typeof import("./client-project-events")>()),
  sendNoticeNow: events.sendNoticeNow,
}));

import { flushPendingNotices } from "./flush-pending-notices";
import { PROGRESS_COOLDOWN_MS } from "./client-project-events";

const now = new Date("2026-11-08T10:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

beforeEach(() => {
  vi.resetAllMocks();
  db.clientProjectNotice.updateMany.mockResolvedValue({ count: 1 });
  events.sendNoticeNow.mockResolvedValue("SENT");
});

describe("flushPendingNotices (docs/CLIENT_NOTIFICATIONS.md)", () => {
  it("PENDING yang jeda project-nya sudah lewat → dikirim; yang belum → tetap PENDING", async () => {
    db.clientProjectNotice.findMany.mockResolvedValue([
      { id: "n1", projectId: "p1" },
      { id: "n2", projectId: "p2" },
    ]);
    db.clientProjectNotice.findFirst.mockImplementation(async ({ where }: { where: { projectId: string } }) =>
      where.projectId === "p1" ? { sentAt: minutesAgo(PROGRESS_COOLDOWN_MS / 60_000 + 1) } : { sentAt: minutesAgo(10) },
    );
    expect(await flushPendingNotices(now)).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(db.clientProjectNotice.updateMany).toHaveBeenCalledTimes(1);
    expect(db.clientProjectNotice.updateMany).toHaveBeenCalledWith({ where: { id: "n1", status: "PENDING" }, data: { status: "SENDING" } });
    expect(events.sendNoticeNow).toHaveBeenCalledWith("n1");
  });

  it("PENDING yang lebih lama dari kabar progres terakhir yang terkirim → dibuang (SKIPPED SUPERSEDED), tidak dikirim", async () => {
    db.clientProjectNotice.findMany.mockResolvedValue([{ id: "n1", projectId: "p1", createdAt: minutesAgo(130) }]);
    db.clientProjectNotice.findFirst.mockResolvedValue({ sentAt: minutesAgo(120) });
    expect(await flushPendingNotices(now)).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(db.clientProjectNotice.updateMany).toHaveBeenCalledWith({ where: { id: "n1", status: "PENDING" }, data: { status: "SKIPPED", reason: "SUPERSEDED" } });
    expect(events.sendNoticeNow).not.toHaveBeenCalled();
  });

  it("klaim atomik: proses lain sudah mengambil notice → tidak dikirim dua kali", async () => {
    db.clientProjectNotice.findMany.mockResolvedValue([{ id: "n1", projectId: "p1" }]);
    db.clientProjectNotice.findFirst.mockResolvedValue(null);
    db.clientProjectNotice.updateMany.mockResolvedValue({ count: 0 });
    expect(await flushPendingNotices(now)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(events.sendNoticeNow).not.toHaveBeenCalled();
  });

  it("menghitung hasil kirim", async () => {
    db.clientProjectNotice.findMany.mockResolvedValue([
      { id: "n1", projectId: "p1" },
      { id: "n2", projectId: "p2" },
      { id: "n3", projectId: "p3" },
    ]);
    db.clientProjectNotice.findFirst.mockResolvedValue(null);
    events.sendNoticeNow.mockResolvedValueOnce("SENT").mockResolvedValueOnce("SKIPPED").mockResolvedValueOnce("FAILED");
    expect(await flushPendingNotices(now)).toEqual({ sent: 1, skipped: 1, failed: 1 });
  });
});
