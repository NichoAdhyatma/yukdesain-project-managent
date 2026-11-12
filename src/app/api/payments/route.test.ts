import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ project: { findUnique: vi.fn() } }));
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const payments = vi.hoisted(() => ({ recordPayment: vi.fn() }));
const notices = vi.hoisted(() => ({ notifyClientProjectEvent: vi.fn(async () => "SENT") }));
const afterFns = vi.hoisted(() => [] as (() => Promise<unknown>)[]);

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/payments/record-payment", () => payments);
vi.mock("@/lib/notifications/client-project-events", () => notices);
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => Promise<unknown>) => afterFns.push(fn),
}));

import { POST } from "./route";

const post = () =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify({ projectId: "p1", amount: 200000 }) }));
const project = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  projectNumber: "PRJ-1",
  agreedPrice: 250000,
  paidAmount: 50000,
  paymentStatus: "PARTIALLY_PAID",
  finalSubmittedAt: new Date(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  afterFns.length = 0;
  session.getCurrentUser.mockResolvedValue({ id: "o1", roles: ["OWNER"] });
  payments.recordPayment.mockResolvedValue({ payment: { id: "pay" }, summary: { paymentStatus: "PAID" } });
});

describe("POST /api/payments: pelunasan membuka file final (2026-11-12)", () => {
  it("lunas setelah hasil final dikirim → klien dikabari file sudah bisa diunduh", async () => {
    db.project.findUnique.mockResolvedValue(project());
    expect((await post()).status).toBe(201);
    await Promise.all(afterFns.map((f) => f()));
    expect(notices.notifyClientProjectEvent).toHaveBeenCalledWith("p1", { kind: "FILES_UNLOCKED" });
  });

  it("belum ada hasil final, atau pembayaran belum lunas → tidak ada kabar", async () => {
    db.project.findUnique.mockResolvedValue(project({ finalSubmittedAt: null }));
    await post();
    payments.recordPayment.mockResolvedValue({ payment: { id: "pay" }, summary: { paymentStatus: "PARTIALLY_PAID" } });
    db.project.findUnique.mockResolvedValue(project());
    await post();
    expect(afterFns).toHaveLength(0);
  });

  it("sudah lunas sebelumnya → tidak dikabari lagi", async () => {
    db.project.findUnique.mockResolvedValue(project({ paymentStatus: "PAID", paidAmount: 250000 }));
    await post();
    expect(afterFns).toHaveLength(0);
  });
});
