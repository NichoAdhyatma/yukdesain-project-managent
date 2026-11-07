import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  webPushSubscription: { count: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("web-push", () => ({ WebPushError: class extends Error {}, sendNotification: vi.fn(), setVapidDetails: vi.fn() }));
vi.mock("@/lib/studio", () => ({ getStudioSettings: async () => ({ logoUrl: "" }) }));

import { GET, PUT } from "./route";
import { DELETE, POST } from "./subscription/route";

const req = (method: string, body: unknown) => new Request("http://x", { method, body: JSON.stringify(body), headers: { "user-agent": "Chrome" } });
const validSub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } };

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue({ id: "u_owner", roles: ["OWNER"] });
  db.user.findUniqueOrThrow.mockResolvedValue({ notifyPrefs: { disabled: ["NEW_CLIENT"] } });
  db.webPushSubscription.count.mockResolvedValue(2);
  process.env.VAPID_PUBLIC_KEY = "B".repeat(87);
  process.env.VAPID_PRIVATE_KEY = "k".repeat(43);
  process.env.VAPID_SUBJECT = "mailto:hello@yukdesain.com";
});

describe("/api/notifications", () => {
  it("bukan owner → 403", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await GET()).status).toBe(403);
    expect((await POST(req("POST", validSub))).status).toBe(403);
  });

  it("GET: kunci publik, jumlah perangkat, status per kejadian (tanpa kunci privat)", async () => {
    const body = await (await GET()).json();
    expect(body).toMatchObject({ configured: true, publicKey: "B".repeat(87), devices: 2 });
    expect(body.events.find((e: { id: string }) => e.id === "NEW_CLIENT").enabled).toBe(false);
    expect(JSON.stringify(body)).not.toContain("k".repeat(43));
  });

  it("PUT: simpan kejadian yang dimatikan; nilai tidak dikenal ditolak", async () => {
    expect((await PUT(req("PUT", { disabled: ["DP_PROOF", "DP_PROOF"] }))).status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u_owner" }, data: { notifyPrefs: { disabled: ["DP_PROOF"] } } });
    expect((await PUT(req("PUT", { disabled: ["NGASAL"] }))).status).toBe(400);
  });

  it("langganan: hanya endpoint https; disimpan untuk user yang login", async () => {
    expect((await POST(req("POST", { ...validSub, endpoint: "http://evil.test/x" }))).status).toBe(400);
    expect((await POST(req("POST", validSub))).status).toBe(200);
    expect(db.webPushSubscription.upsert.mock.calls[0][0]).toMatchObject({
      where: { endpoint: validSub.endpoint },
      create: { userId: "u_owner", userAgent: "Chrome" },
    });
  });

  it("hapus langganan hanya milik user sendiri", async () => {
    await DELETE(req("DELETE", { endpoint: validSub.endpoint }));
    expect(db.webPushSubscription.deleteMany).toHaveBeenCalledWith({ where: { endpoint: validSub.endpoint, userId: "u_owner" } });
  });
});
