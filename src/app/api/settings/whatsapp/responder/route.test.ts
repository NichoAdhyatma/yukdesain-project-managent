import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const responder = vi.hoisted(() => ({ getResponderStatus: vi.fn(), switchResponder: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/whatsapp/responder", () => responder);

import { GET, POST } from "./route";

const url = "http://x/api/settings/whatsapp/responder";
const post = (body: unknown) => new Request(url, { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue({ id: "u_owner", roles: ["OWNER"] });
  responder.getResponderStatus.mockResolvedValue({ botEnabled: false });
  responder.switchResponder.mockResolvedValue({ ok: true, botEnabled: true, returned: 1 });
});

describe("/api/settings/whatsapp/responder", () => {
  it("hanya owner", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await GET()).status).toBe(403);
    expect((await POST(post({ to: "KIRIMI" }))).status).toBe(403);
    expect(responder.switchResponder).not.toHaveBeenCalled();
  });

  it("GET mengembalikan status tanpa cache", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("POST ke bot portal meneruskan chat terpilih dan konfirmasi", async () => {
    const res = await POST(post({ to: "PORTAL", returnConversationIds: ["c1"], kirimiOffConfirmed: true }));
    expect(res.status).toBe(200);
    expect(responder.switchResponder).toHaveBeenCalledWith({ to: "PORTAL", returnConversationIds: ["c1"], kirimiOffConfirmed: true }, "u_owner");
  });

  it.each([
    ["KIRIMI_AI_ON", 409],
    ["KIRIMI_UNCONFIRMED", 409],
  ])("POST ditolak %s → %i dengan pesan", async (error, status) => {
    responder.switchResponder.mockResolvedValue({ ok: false, error });
    const res = await POST(post({ to: "PORTAL", returnConversationIds: [] }));
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error, message: expect.any(String) });
  });

  it.each([{ to: "LAIN" }, { to: "PORTAL" }, { to: "PORTAL", returnConversationIds: "c1" }])("input tidak valid %j → 400", async (body) => {
    expect((await POST(post(body))).status).toBe(400);
    expect(responder.switchResponder).not.toHaveBeenCalled();
  });
});
