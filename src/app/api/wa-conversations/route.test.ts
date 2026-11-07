import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waConversation: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const owners = vi.hoisted(() => ({ listOwnerNumbers: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/storage", () => ({ getClient: () => ({}) }));
vi.mock("@/lib/whatsapp/owner/identity", () => owners);
vi.mock("@/lib/whatsapp/channel", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/channel")>()),
  getChannel: async () => "FONNTE",
}));

import { GET } from "./route";
import { POST as block } from "./[id]/block/route";
import { POST as setMode } from "./[id]/mode/route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue({ id: "u_owner", roles: ["OWNER"] });
  owners.listOwnerNumbers.mockResolvedValue([{ id: "o1", name: "Rizal", waNumber: "6289700000000" }]);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.waConversation.findMany.mockResolvedValue([]);
  db.waConversation.count.mockResolvedValue(0);
  db.waConversation.findFirst.mockResolvedValue(null);
  db.waConversation.updateMany.mockResolvedValue({ count: 1 });
});

describe("Inbox", () => {
  it("bukan owner → 403", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await GET(new Request("http://x/api/wa-conversations"))).status).toBe(403);
  });

  it("daftar: tanpa Uji bot, filter menunggu admin, pratinjau pesan, label tes owner", async () => {
    db.waConversation.findMany.mockResolvedValue([
      {
        id: "c1",
        waId: "6289700000000",
        profileName: "Rizal",
        mode: "HUMAN",
        blockedAt: null,
        lastInboundAt: new Date(),
        messages: [{ direction: "INBOUND", type: "text", body: "x".repeat(200), createdAt: new Date() }],
        intakes: [],
      },
    ]);
    db.waConversation.count.mockResolvedValue(1);
    const body = await (await GET(new Request("http://x/api/wa-conversations?filter=needs_admin"))).json();
    expect(db.waConversation.findMany.mock.calls[0][0].where).toMatchObject({ isSandbox: false, mode: "HUMAN", blockedAt: null });
    expect(body.items[0]).toMatchObject({ ownerTest: true, intake: null, outsideServiceWindow: false });
    expect(body.items[0].lastMessage.preview.length).toBeLessThanOrEqual(90);
  });

  it("filter tidak dikenal → 400", async () => {
    expect((await GET(new Request("http://x/api/wa-conversations?filter=apa"))).status).toBe(400);
  });

  it("blokir nomor tanpa order; nomor owner ditolak", async () => {
    db.waConversation.findFirst.mockResolvedValueOnce({ waId: "6281234567890" });
    expect((await block(req({ blocked: true }), ctx)).status).toBe(200);
    expect(db.activityLog.create.mock.calls[0][0].data).toMatchObject({ entityType: "WaConversation", entityId: "c1", action: "WA_NUMBER_BLOCKED" });
    db.waConversation.findFirst.mockResolvedValueOnce({ waId: "6289700000000" });
    expect((await block(req({ blocked: true }), ctx)).status).toBe(409);
  });

  it("ambil alih: hanya percakapan sungguhan; tidak ada → 404", async () => {
    expect((await setMode(req({ mode: "HUMAN" }), ctx)).status).toBe(200);
    expect(db.waConversation.updateMany.mock.calls[0][0].where).toEqual({ id: "c1", isSandbox: false, mode: "BOT" });
    db.waConversation.updateMany.mockResolvedValue({ count: 0 });
    db.waConversation.count.mockResolvedValue(0);
    expect((await setMode(req({ mode: "HUMAN" }), ctx)).status).toBe(404);
  });
});
