import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reminders = vi.hoisted(() => ({ sendWaitingReminders: vi.fn() }));
vi.mock("@/lib/notifications/waiting-reminders", () => reminders);

import { POST } from "./route";

const call = (auth?: string) =>
  POST(new Request("http://x/api/cron/admin-reminders", { method: "POST", headers: auth ? { Authorization: auth } : {} }));

beforeEach(() => {
  vi.resetAllMocks();
  reminders.sendWaitingReminders.mockResolvedValue({ waiting: 3, reminded: 1 });
  process.env.CRON_SECRET = "s3cret-value-123";
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("POST /api/cron/admin-reminders", () => {
  it("tanpa header atau secret salah → 401, tidak menjalankan apa pun", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer salah")).status).toBe(401);
    expect(reminders.sendWaitingReminders).not.toHaveBeenCalled();
  });

  it("CRON_SECRET belum diatur → 503", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer s3cret-value-123")).status).toBe(503);
  });

  it("secret benar → mengirim pengingat dan mengembalikan ringkasan", async () => {
    const res = await call("Bearer s3cret-value-123");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, waiting: 3, reminded: 1 });
  });
});
