import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";

const mocks = vi.hoisted(() => {
  const db = {
    studioSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    activityLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { db, getCurrentUser: vi.fn() };
});

vi.mock("@/lib/db", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));

import { GET, POST } from "./route";

const owner: SessionUser = {
  id: "owner_1",
  name: "Owner",
  email: "owner@yukdesain.com",
  roles: ["OWNER"],
  activeRole: "OWNER",
};

const designer: SessionUser = {
  id: "designer_1",
  name: "Designer",
  email: "designer@yukdesain.com",
  roles: ["DESIGNER"],
  activeRole: "DESIGNER",
};

const stored = {
  id: "default",
  name: "YukDesain Studio",
  tagline: "Creative Design Agency",
  email: "hello@yukdesain.com",
  phone: "",
  address: "Jakarta, Indonesia",
  logoUrl: "",
};

function post(body: unknown) {
  return new Request("http://localhost/api/settings/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.$transaction.mockImplementation(async (fn: (tx: typeof mocks.db) => unknown) => fn(mocks.db));
  mocks.db.studioSettings.findUnique.mockResolvedValue(stored);
  mocks.db.studioSettings.upsert.mockImplementation(async ({ update }: { update: object }) => ({
    ...stored,
    ...update,
  }));
});

describe("POST /api/settings/studio", () => {
  it("401 tanpa login", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const res = await POST(post({ name: "Hacked" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.db.studioSettings.upsert).not.toHaveBeenCalled();
  });

  it("403 untuk designer", async () => {
    mocks.getCurrentUser.mockResolvedValue(designer);

    const res = await POST(post({ name: "Hacked" }));

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db.studioSettings.upsert).not.toHaveBeenCalled();
  });

  it("403 untuk owner yang sedang aktif sebagai designer", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...owner, roles: ["OWNER", "DESIGNER"], activeRole: "DESIGNER" });

    const res = await POST(post({ name: "Hacked" }));

    expect(res.status).toBe(403);
    expect(mocks.db.studioSettings.upsert).not.toHaveBeenCalled();
  });

  it("400 untuk input tidak valid", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);

    const res = await POST(post({ name: "", email: "bukan-email" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.db.studioSettings.upsert).not.toHaveBeenCalled();
  });

  it("400 untuk body yang bukan JSON", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);

    const res = await POST(post("{not json"));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("200 untuk owner: menyimpan field yang dikirim dan mencatat ActivityLog", async () => {
    mocks.getCurrentUser.mockResolvedValue(owner);

    const res = await POST(
      post({ name: "  YukDesain  ", email: "studio@yukdesain.com", phone: "0812", address: "Bandung", role: "x" })
    );

    expect(res.status).toBe(200);
    const update = { name: "YukDesain", email: "studio@yukdesain.com", phone: "0812", address: "Bandung" };
    expect(mocks.db.studioSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "default" }, update })
    );
    expect(mocks.db.activityLog.create).toHaveBeenCalledWith({
      data: {
        entityType: "StudioSettings",
        entityId: "default",
        action: "UPDATED",
        actorId: owner.id,
        previousValue: { name: stored.name, email: stored.email, phone: stored.phone, address: stored.address },
        newValue: update,
      },
    });
    expect(await res.json()).toEqual({ ...stored, ...update });
  });
});

describe("GET /api/settings/studio", () => {
  it("mengembalikan field eksplisit saja", async () => {
    mocks.db.studioSettings.findUnique.mockResolvedValue(stored);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(mocks.db.studioSettings.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.any(Object) })
    );
    expect(await res.json()).toEqual(stored);
  });

  it("mengembalikan default bila belum ada pengaturan", async () => {
    mocks.db.studioSettings.findUnique.mockResolvedValue(null);

    const res = await GET();

    expect(await res.json()).toEqual(stored);
  });
});
