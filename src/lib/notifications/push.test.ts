import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn() },
  webPushSubscription: { update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
}));
const wp = vi.hoisted(() => {
  class WebPushError extends Error {
    constructor(readonly statusCode: number) {
      super("push");
    }
  }
  return { WebPushError, sendNotification: vi.fn(), setVapidDetails: vi.fn() };
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/studio", () => ({ getStudioSettings: async () => ({ logoUrl: "https://cdn.test/logo.png" }) }));
vi.mock("web-push", () => wp);

import { disabledEvents, isPushConfigured, notifyOwnersPush } from "./push";

const sub = (id: string) => ({ id, endpoint: `https://push.test/${id}`, p256dh: "p".repeat(20), auth: "a".repeat(16) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  process.env.VAPID_PUBLIC_KEY = "B".repeat(87);
  process.env.VAPID_PRIVATE_KEY = "k".repeat(43);
  process.env.VAPID_SUBJECT = "mailto:hello@yukdesain.com";
  wp.sendNotification.mockResolvedValue({ statusCode: 201 });
});

describe("web push", () => {
  it("tanpa kunci VAPID → tidak dikirim", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(isPushConfigured()).toBe(false);
    expect(await notifyOwnersPush("NEEDS_QUOTE", { title: "x", body: "y", url: "/wa-orders" })).toBe(0);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it("prefs: hanya kejadian yang valid yang dimatikan", () => {
    expect([...disabledEvents({ disabled: ["NEW_CLIENT"] })]).toEqual(["NEW_CLIENT"]);
    expect(disabledEvents(null).size).toBe(0);
    expect(disabledEvents({ disabled: ["NGASAL"] }).size).toBe(0);
  });

  it("owner yang mematikan kejadian dilewati; payload memuat ikon logo studio", async () => {
    db.user.findMany.mockResolvedValue([
      { notifyPrefs: null, pushSubscriptions: [sub("s1")] },
      { notifyPrefs: { disabled: ["NEEDS_QUOTE"] }, pushSubscriptions: [sub("s2")] },
    ]);
    const sent = await notifyOwnersPush("NEEDS_QUOTE", { title: "Perlu harga", body: "Nico", url: "/wa-orders/i1" });
    expect(sent).toBe(1);
    expect(wp.sendNotification).toHaveBeenCalledTimes(1);
    const [target, body] = wp.sendNotification.mock.calls[0];
    expect(target.endpoint).toBe("https://push.test/s1");
    expect(JSON.parse(body)).toMatchObject({ title: "Perlu harga", url: "/wa-orders/i1", icon: "https://cdn.test/logo.png", tag: "NEEDS_QUOTE" });
  });

  it("langganan kedaluwarsa (410) dihapus; error lain tidak melempar", async () => {
    db.user.findMany.mockResolvedValue([{ notifyPrefs: null, pushSubscriptions: [sub("gone"), sub("err")] }]);
    wp.sendNotification.mockRejectedValueOnce(new wp.WebPushError(410)).mockRejectedValueOnce(new wp.WebPushError(500));
    db.webPushSubscription.delete.mockResolvedValue({});
    expect(await notifyOwnersPush("DP_PROOF", { title: "t", body: "b", url: "/" })).toBe(0);
    expect(db.webPushSubscription.delete).toHaveBeenCalledWith({ where: { id: "gone" } });
    expect(db.webPushSubscription.delete).toHaveBeenCalledTimes(1);
  });

  it("setiap kejadian dicatat di log: terkirim ke berapa perangkat, atau tidak ada perangkat", async () => {
    db.user.findMany.mockResolvedValue([{ notifyPrefs: null, pushSubscriptions: [sub("s1"), sub("s2")] }]);
    wp.sendNotification.mockResolvedValueOnce({ statusCode: 201 }).mockRejectedValueOnce(new wp.WebPushError(500));
    await notifyOwnersPush("NEEDS_QUOTE", { title: "Perlu harga", body: "Nico", url: "/" });
    expect(console.info).toHaveBeenCalledWith("[push] NEEDS_QUOTE terkirim ke 1/2 perangkat");

    db.user.findMany.mockResolvedValue([]);
    await notifyOwnersPush("NEW_CLIENT", { title: "Klien baru chat", body: "x", url: "/" });
    expect(console.info).toHaveBeenCalledWith("[push] NEW_CLIENT tidak terkirim: tidak ada perangkat owner yang berlangganan dan mengaktifkan kejadian ini");
  });
});
