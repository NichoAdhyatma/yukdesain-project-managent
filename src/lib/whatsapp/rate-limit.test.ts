import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ waMessage: { count: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { botReplyLimitReached, checkInboundRate, getMonthlyUsage, imageLimitExceeded, startOfMonthWib } from "./rate-limit";

beforeEach(() => vi.clearAllMocks());

describe("checkInboundRate", () => {
  it.each([
    [1, "ok"],
    [10, "ok"],
    [11, "warn"],
    [12, "ignore"],
    [40, "ignore"],
  ])("%i pesan dalam 5 menit → %s", async (count, expected) => {
    db.waMessage.count.mockResolvedValue(count);
    await expect(checkInboundRate("c", new Date("2026-11-01T10:00:00Z"))).resolves.toBe(expected);
  });

  it("jendela 5 menit sampai waktu pesan ini, hanya INBOUND percakapan ini", async () => {
    db.waMessage.count.mockResolvedValue(1);
    await checkInboundRate("conv_1", new Date("2026-11-01T10:00:00Z"));
    expect(db.waMessage.count.mock.calls[0][0].where).toEqual({
      conversationId: "conv_1",
      direction: "INBOUND",
      createdAt: { gt: new Date("2026-11-01T09:55:00Z"), lte: new Date("2026-11-01T10:00:00Z") },
    });
  });
});

describe("botReplyLimitReached", () => {
  it.each([
    [79, false],
    [80, true],
  ])("%i balasan bot / 24 jam → %s", async (count, expected) => {
    db.waMessage.count.mockResolvedValue(count);
    await expect(botReplyLimitReached("c")).resolves.toBe(expected);
  });
});

describe("imageLimitExceeded", () => {
  it.each([
    [20, false],
    [21, true],
  ])("%i gambar → %s", async (count, expected) => {
    db.waMessage.count.mockResolvedValue(count);
    await expect(imageLimitExceeded("c", new Date("2026-11-01T00:00:00Z"))).resolves.toBe(expected);
  });

  it("dihitung sejak order dibuat", async () => {
    db.waMessage.count.mockResolvedValue(0);
    const created = new Date("2026-10-30T00:00:00Z");
    await imageLimitExceeded("c", created);
    expect(db.waMessage.count.mock.calls[0][0].where.createdAt).toEqual({ gte: created });
  });
});

describe("startOfMonthWib", () => {
  it("1 Nov 00:30 WIB masih bulan November", () => {
    // 31 Okt 17:30 UTC = 1 Nov 00:30 WIB
    expect(startOfMonthWib(new Date("2026-10-31T17:30:00Z")).toISOString()).toBe("2026-10-31T17:00:00.000Z");
  });

  it("31 Okt 23:00 WIB masih bulan Oktober", () => {
    expect(startOfMonthWib(new Date("2026-10-31T16:00:00Z")).toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });
});

describe("getMonthlyUsage", () => {
  it("menghitung per jenis dan menandai mendekati batas", async () => {
    db.waMessage.count
      .mockResolvedValueOnce(820) // terkirim
      .mockResolvedValueOnce(3) // gagal
      .mockResolvedValueOnce(12) // template
      .mockResolvedValueOnce(790) // balasan bot
      .mockResolvedValueOnce(900); // masuk
    const usage = await getMonthlyUsage(new Date("2026-11-15T05:00:00Z"));
    expect(usage).toEqual({
      month: "2026-11",
      outboundSent: 820,
      outboundFailed: 3,
      templatesSent: 12,
      botReplies: 790,
      inbound: 900,
      warningThreshold: 800,
      freeTier: 1000,
      nearLimit: true,
    });
  });
});
