import { beforeEach, describe, expect, it, vi } from "vitest";

// Blokir / buka blokir nomor (docs/WHATSAPP_SPAM_GUARD.md §5).
const db = vi.hoisted(() => ({
  waIntake: { findFirst: vi.fn() },
  waConversation: { updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const owners = vi.hoisted(() => ({ listOwnerNumbers: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/whatsapp/owner/identity", () => owners);
vi.mock("@/lib/whatsapp/intake-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/intake-api")>()),
  findIntakeForDetail: async () => null,
}));

import { POST } from "./block/route";

const ctx = { params: Promise.resolve({ id: "in_1" }) };
const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue({ id: "u_owner", roles: ["OWNER"] });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.waIntake.findFirst.mockResolvedValue({ conversationId: "conv_1", conversation: { waId: "6281234567890" } });
  db.waConversation.updateMany.mockResolvedValue({ count: 1 });
  owners.listOwnerNumbers.mockResolvedValue([{ id: "o1", name: "Rizal", waNumber: "6281200000001" }]);
});

describe("POST /api/wa-intakes/[id]/block", () => {
  it("bukan owner → 403", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await POST(req({ blocked: true }), ctx)).status).toBe(403);
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
  });

  it("blokir: tandai percakapan + catat activity, hanya jika belum diblokir", async () => {
    const res = await POST(req({ blocked: true }), ctx);
    expect(res.status).toBe(200);
    const arg = db.waConversation.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "conv_1", blockedAt: null });
    expect(arg.data).toMatchObject({ blockedById: "u_owner", blockedAt: expect.any(Date) });
    expect(db.activityLog.create.mock.calls[0][0].data.action).toBe("WA_NUMBER_BLOCKED");
  });

  it("buka blokir", async () => {
    await POST(req({ blocked: false }), ctx);
    const arg = db.waConversation.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "conv_1", blockedAt: { not: null } });
    expect(arg.data).toEqual({ blockedAt: null, blockedById: null });
  });

  it("nomor owner tidak bisa diblokir", async () => {
    db.waIntake.findFirst.mockResolvedValue({ conversationId: "conv_o", conversation: { waId: "6281200000001" } });
    expect((await POST(req({ blocked: true }), ctx)).status).toBe(409);
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
  });

  it("klik ganda → 409 tanpa catatan ganda", async () => {
    db.waConversation.updateMany.mockResolvedValue({ count: 0 });
    expect((await POST(req({ blocked: true }), ctx)).status).toBe(409);
    expect(db.activityLog.create).not.toHaveBeenCalled();
  });

  it("order uji / tidak ada → 404", async () => {
    db.waIntake.findFirst.mockResolvedValue(null);
    expect((await POST(req({ blocked: true }), ctx)).status).toBe(404);
  });
});
