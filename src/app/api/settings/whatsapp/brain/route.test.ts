import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const brain = vi.hoisted(() => ({ buildBrain: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/whatsapp/ai/brain", () => brain);

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  brain.buildBrain.mockResolvedValue({ source: "published" });
});

describe("GET /api/settings/whatsapp/brain", () => {
  it("hanya owner", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await GET(new Request("http://x/api/settings/whatsapp/brain"))).status).toBe(403);
    session.getCurrentUser.mockResolvedValue(null);
    expect((await GET(new Request("http://x/api/settings/whatsapp/brain"))).status).toBe(401);
    expect(brain.buildBrain).not.toHaveBeenCalled();
  });

  it.each([
    ["?source=draft", "draft"],
    ["", "published"],
    ["?source=apa-saja", "published"],
  ])("source %s → %s", async (query, expected) => {
    session.getCurrentUser.mockResolvedValue({ id: "o", roles: ["OWNER"] });
    const res = await GET(new Request(`http://x/api/settings/whatsapp/brain${query}`));
    expect(res.status).toBe(200);
    expect(brain.buildBrain).toHaveBeenCalledWith(expected);
  });
});
