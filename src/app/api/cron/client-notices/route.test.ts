import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const flush = vi.hoisted(() => ({ flushPendingNotices: vi.fn() }));
vi.mock("@/lib/notifications/flush-pending-notices", () => flush);

import { POST } from "./route";

const call = (auth?: string) =>
  POST(new Request("http://x/api/cron/client-notices", { method: "POST", headers: auth ? { Authorization: auth } : {} }));

beforeEach(() => {
  vi.resetAllMocks();
  flush.flushPendingNotices.mockResolvedValue({ sent: 2, skipped: 0, failed: 0 });
  process.env.CRON_SECRET = "s3cret-value-123";
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("POST /api/cron/client-notices", () => {
  it("tanpa header atau secret salah → 401, tidak menjalankan apa pun", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer salah")).status).toBe(401);
    expect(flush.flushPendingNotices).not.toHaveBeenCalled();
  });

  it("CRON_SECRET belum diatur → 503", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer s3cret-value-123")).status).toBe(503);
  });

  it("secret benar → menjalankan flush dan mengembalikan ringkasan", async () => {
    const res = await call("Bearer s3cret-value-123");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: 2, skipped: 0, failed: 0 });
  });
});
