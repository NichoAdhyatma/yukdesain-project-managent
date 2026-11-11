import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const knowledge = vi.hoisted(() => ({ loadKirimiKnowledge: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/whatsapp/kirimi-knowledge", () => knowledge);

import { GET } from "./route";

const url = "http://x/api/settings/whatsapp/kirimi-knowledge";

beforeEach(() => {
  vi.clearAllMocks();
  knowledge.loadKirimiKnowledge.mockResolvedValue({ source: "published", version: 25, markdown: "# K\n", chars: 4 });
});

describe("GET /api/settings/whatsapp/kirimi-knowledge", () => {
  it("hanya owner", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await GET(new Request(url))).status).toBe(403);
    session.getCurrentUser.mockResolvedValue(null);
    expect((await GET(new Request(url))).status).toBe(401);
    expect(knowledge.loadKirimiKnowledge).not.toHaveBeenCalled();
  });

  it.each([
    ["?source=draft", "draft"],
    ["", "published"],
    ["?source=lain", "published"],
  ])("source %s → %s, tanpa cache", async (query, expected) => {
    session.getCurrentUser.mockResolvedValue({ id: "o", roles: ["OWNER"] });
    const res = await GET(new Request(`${url}${query}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(knowledge.loadKirimiKnowledge).toHaveBeenCalledWith(expected);
    expect(await res.json()).toMatchObject({ markdown: "# K\n", chars: 4 });
  });
});
