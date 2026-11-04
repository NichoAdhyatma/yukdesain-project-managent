import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const sandbox = vi.hoisted(() => ({
  getSandboxState: vi.fn(),
  sendSandboxMessage: vi.fn(),
  resetSandbox: vi.fn(),
}));
const ai = vi.hoisted(() => ({ isAiReady: vi.fn() }));

vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/whatsapp/sandbox", async (orig) => ({ ...(await orig<typeof import("@/lib/whatsapp/sandbox")>()), ...sandbox }));
vi.mock("@/lib/whatsapp/ai/ai-config", () => ai);
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { DELETE, GET, POST } from "./route";

const owner = { id: "u_owner", roles: ["OWNER"] };
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
const del = (query = "") => DELETE(new Request(`http://x/api/settings/whatsapp/sandbox${query}`, { method: "DELETE" }));
const empty = { client: { mode: null, messages: [], intake: null, pendingOwnerQuery: null }, owner: { messages: [], awaitingConfirmation: false } };

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(owner);
  ai.isAiReady.mockResolvedValue(true);
  sandbox.getSandboxState.mockResolvedValue(empty);
  sandbox.sendSandboxMessage.mockResolvedValue(empty);
});

describe("/api/settings/whatsapp/sandbox", () => {
  it("bukan owner → 403 untuk GET, POST, DELETE", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await GET()).status).toBe(403);
    expect((await post({ text: "halo" })).status).toBe(403);
    expect((await del()).status).toBe(403);
    expect(sandbox.sendSandboxMessage).not.toHaveBeenCalled();
    expect(sandbox.resetSandbox).not.toHaveBeenCalled();
  });

  it("percakapan uji milik owner yang login", async () => {
    await post({ text: "  halo  " });
    expect(sandbox.sendSandboxMessage).toHaveBeenCalledWith("u_owner", "halo", "client");
    await post({ text: "kasih diskon 50rb", role: "owner" });
    expect(sandbox.sendSandboxMessage).toHaveBeenLastCalledWith("u_owner", "kasih diskon 50rb", "owner");
    await del();
    expect(sandbox.resetSandbox).toHaveBeenCalledWith("u_owner", undefined);
    await del("?role=owner");
    expect(sandbox.resetSandbox).toHaveBeenLastCalledWith("u_owner", "owner");
    expect((await del("?role=admin")).status).toBe(400);
  });

  it("pesan kosong atau terlalu panjang → 400", async () => {
    expect((await post({ text: "   " })).status).toBe(400);
    expect((await post({ text: "a".repeat(2001) })).status).toBe(400);
    expect(sandbox.sendSandboxMessage).not.toHaveBeenCalled();
  });

  it("key provider AI aktif belum ada → 422 dengan pesan jelas, bot tidak dipanggil", async () => {
    ai.isAiReady.mockResolvedValue(false);
    const res = await post({ text: "halo" });
    expect(res.status).toBe(422);
    expect((await res.json()).message).toContain("API key");
    expect(sandbox.sendSandboxMessage).not.toHaveBeenCalled();
  });
});
