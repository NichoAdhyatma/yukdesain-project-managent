import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const sandbox = vi.hoisted(() => ({
  getSandboxState: vi.fn(),
  sendSandboxMessage: vi.fn(),
  resetSandbox: vi.fn(),
}));
const env = vi.hoisted(() => ({ isAiConfigured: vi.fn() }));

vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/whatsapp/sandbox", async (orig) => ({ ...(await orig<typeof import("@/lib/whatsapp/sandbox")>()), ...sandbox }));
vi.mock("@/lib/whatsapp/env", () => env);
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { DELETE, GET, POST } from "./route";

const owner = { id: "u_owner", roles: ["OWNER"] };
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
const empty = { mode: null, messages: [], intake: null };

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(owner);
  env.isAiConfigured.mockReturnValue(true);
  sandbox.getSandboxState.mockResolvedValue(empty);
  sandbox.sendSandboxMessage.mockResolvedValue(empty);
});

describe("/api/settings/whatsapp/sandbox", () => {
  it("bukan owner → 403 untuk GET, POST, DELETE", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await GET()).status).toBe(403);
    expect((await post({ text: "halo" })).status).toBe(403);
    expect((await DELETE()).status).toBe(403);
    expect(sandbox.sendSandboxMessage).not.toHaveBeenCalled();
    expect(sandbox.resetSandbox).not.toHaveBeenCalled();
  });

  it("percakapan uji milik owner yang login", async () => {
    await post({ text: "  halo  " });
    expect(sandbox.sendSandboxMessage).toHaveBeenCalledWith("u_owner", "halo");
    await DELETE();
    expect(sandbox.resetSandbox).toHaveBeenCalledWith("u_owner");
  });

  it("pesan kosong atau terlalu panjang → 400", async () => {
    expect((await post({ text: "   " })).status).toBe(400);
    expect((await post({ text: "a".repeat(2001) })).status).toBe(400);
    expect(sandbox.sendSandboxMessage).not.toHaveBeenCalled();
  });

  it("ANTHROPIC_API_KEY belum ada → 422 dengan pesan jelas, bot tidak dipanggil", async () => {
    env.isAiConfigured.mockReturnValue(false);
    const res = await post({ text: "halo" });
    expect(res.status).toBe(422);
    expect((await res.json()).message).toContain("ANTHROPIC_API_KEY");
    expect(sandbox.sendSandboxMessage).not.toHaveBeenCalled();
  });
});
