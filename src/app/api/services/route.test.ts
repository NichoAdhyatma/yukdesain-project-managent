import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { service: { findMany: vi.fn(async () => []) } } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "u1", roles: ["OWNER"] })) }));

import { GET } from "./route";

describe("GET /api/services (docs/SERVICES_CATALOG.md §1)", () => {
  it("tidak di-cache browser: harga yang baru disimpan langsung terbaca di halaman mana pun", async () => {
    const res = await GET();
    const cache = res.headers.get("Cache-Control") ?? "";
    expect(cache).toContain("no-cache");
    expect(cache).not.toMatch(/max-age=[1-9]/);
  });
});
