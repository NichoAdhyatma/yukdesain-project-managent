import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ project: { findFirst: vi.fn() } }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { GET } from "./route";
import { resetLookupAttempts } from "@/lib/client-portal/lookup-attempts";

const call = (code: string, phone?: string) =>
  GET(new Request(`http://x/api/portal/lookup?code=${encodeURIComponent(code)}${phone !== undefined ? `&phone=${phone}` : ""}`));
const project = (over: Record<string, unknown> = {}) => ({
  projectNumber: "PRJ-20261113-ABC123",
  clientName: "Budi",
  client: { phone: "081234567890", waConversations: [] },
  clientLinks: [{ token: "TOKEN123" }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetLookupAttempts();
  db.project.findFirst.mockResolvedValue(project());
});

// Owner 13 Nov: karyawan membuka "Lacak pesanan" cukup dengan kode project dan melihat invoice.
describe("GET /api/portal/lookup: kode project + 4 digit akhir nomor WA klien", () => {
  it("4 digit cocok dengan nomor klien → token", async () => {
    const res = await call("PRJ-20261113-ABC123", "7890");
    expect(res.status).toBe(200);
    expect((await res.json()).token).toBe("TOKEN123");
  });

  it("nomor dari chat WhatsApp klien juga diterima (klien tanpa nomor di data klien)", async () => {
    db.project.findFirst.mockResolvedValue(project({ client: { phone: "", waConversations: [{ waId: "6285299991111" }] } }));
    expect((await call("PRJ-20261113-ABC123", "1111")).status).toBe(200);
  });

  it("tanpa 4 digit atau formatnya salah → 400", async () => {
    expect((await call("PRJ-20261113-ABC123")).status).toBe(400);
    expect((await call("PRJ-20261113-ABC123", "12a4")).status).toBe(400);
  });

  it("4 digit salah → pesan umum, token tidak keluar", async () => {
    const res = await call("PRJ-20261113-ABC123", "0000");
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("TOKEN123");
  });

  it("terlalu banyak percobaan salah untuk satu kode → 429 walau 4 digit kemudian benar", async () => {
    for (let i = 0; i < 5; i++) await call("PRJ-20261113-ABC123", "0000");
    expect((await call("PRJ-20261113-ABC123", "7890")).status).toBe(429);
  });

  it("klien tanpa nomor sama sekali → arahkan minta link ke admin", async () => {
    db.project.findFirst.mockResolvedValue(project({ client: { phone: "", waConversations: [] } }));
    const res = await call("PRJ-20261113-ABC123", "7890");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("admin");
  });
});
