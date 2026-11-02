import { beforeEach, describe, expect, it, vi } from "vitest";

// Quote / reject / cancel: aturan status, data yang ditulis, dan pesan ke klien.
const db = vi.hoisted(() => {
  const d = {
    waIntake: { findFirst: vi.fn(), updateMany: vi.fn() },
    paymentProof: { updateMany: vi.fn() },
    paymentAccount: { findMany: vi.fn() },
    activityLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return d;
});
const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const outbound = vi.hoisted(() => ({ sendToClient: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/whatsapp/outbound", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/outbound")>()),
  sendToClient: outbound.sendToClient,
}));
vi.mock("@/lib/whatsapp/intake-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/intake-api")>()),
  findIntakeForDetail: async () => null,
}));

import { POST as quote } from "./quote/route";
import { POST as reject } from "./reject/route";
import { POST as cancel } from "./cancel/route";

const owner = { id: "u_owner", roles: ["OWNER"] };
const ctx = { params: Promise.resolve({ id: "in_1" }) };
const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

function intake(status: string) {
  db.waIntake.findFirst.mockResolvedValue({
    status,
    clientName: "Sari",
    conversationId: "conv_1",
    agreedPrice: null,
    deadline: null,
    service: { name: "Logo Minimalis" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.getCurrentUser.mockResolvedValue(owner);
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.waIntake.updateMany.mockResolvedValue({ count: 1 });
  db.paymentProof.updateMany.mockResolvedValue({ count: 1 });
  db.paymentAccount.findMany.mockResolvedValue([{ name: "BCA", accountNumber: "123", accountHolder: "YukDesain" }]);
  outbound.sendToClient.mockResolvedValue({ ok: true, via: "text", messageId: "out_1" });
});

describe("POST quote", () => {
  it("bukan owner → 403, tidak menyentuh DB", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await quote(req({ agreedPrice: 1, deadline: tomorrow }), ctx)).status).toBe(403);
    expect(db.waIntake.findFirst).not.toHaveBeenCalled();
  });

  it("AWAITING_QUOTE → QUOTED, DP 50% dihitung server, penawaran terkirim", async () => {
    intake("AWAITING_QUOTE");
    const res = await quote(req({ agreedPrice: 1500001, deadline: tomorrow }), ctx);
    expect(res.status).toBe(200);
    const { where, data } = db.waIntake.updateMany.mock.calls[0][0];
    expect(where).toEqual({ id: "in_1", status: "AWAITING_QUOTE" });
    expect(data).toMatchObject({ status: "QUOTED", agreedPrice: 1500001, dpAmount: 750001, quotedById: "u_owner" });
    expect(db.activityLog.create.mock.calls[0][0].data).toMatchObject({ entityType: "WaIntake", action: "WA_QUOTED" });
    const [convId, message] = outbound.sendToClient.mock.calls[0];
    expect(convId).toBe("conv_1");
    expect(message.template.params).toEqual(["Sari", "Logo Minimalis", "Rp1.500.001", "Rp750.001", expect.any(String)]);
    expect(await res.json()).toMatchObject({ delivery: { ok: true }, warnings: [] });
  });

  it("revisi harga saat QUOTED dicatat sebagai WA_QUOTE_REVISED", async () => {
    intake("QUOTED");
    await quote(req({ agreedPrice: 2000000, deadline: tomorrow }), ctx);
    expect(db.activityLog.create.mock.calls[0][0].data.action).toBe("WA_QUOTE_REVISED");
  });

  it.each(["COLLECTING", "DP_REVIEW", "APPROVED", "CANCELLED"])("status %s → 409, tanpa pesan", async (status) => {
    intake(status);
    const res = await quote(req({ agreedPrice: 1000, deadline: tomorrow }), ctx);
    expect(res.status).toBe(409);
    expect(outbound.sendToClient).not.toHaveBeenCalled();
  });

  it("klik ganda (status sudah berubah) → 409", async () => {
    intake("AWAITING_QUOTE");
    db.waIntake.updateMany.mockResolvedValue({ count: 0 });
    expect((await quote(req({ agreedPrice: 1000, deadline: tomorrow }), ctx)).status).toBe(409);
  });

  it.each([
    [{ agreedPrice: 0, deadline: "2099-01-01" }, "agreedPrice"],
    [{ agreedPrice: 1000.5, deadline: "2099-01-01" }, "agreedPrice"],
    [{ agreedPrice: 1000, deadline: "2000-01-01" }, "deadline"],
    [{ agreedPrice: 1000, deadline: "besok" }, "deadline"],
  ])("validasi %j → 400 di field %s", async (body, field) => {
    const res = await quote(req(body), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).details.fields).toHaveProperty(field);
  });

  it("tanpa rekening aktif → tetap QUOTED, ada peringatan", async () => {
    intake("AWAITING_QUOTE");
    db.paymentAccount.findMany.mockResolvedValue([]);
    const body = await (await quote(req({ agreedPrice: 1000, deadline: tomorrow }), ctx)).json();
    expect(body.warnings).toEqual(["NO_ACTIVE_PAYMENT_ACCOUNT"]);
  });

  it("pengiriman gagal → status tetap tersimpan, hasil gagal dikembalikan", async () => {
    intake("AWAITING_QUOTE");
    outbound.sendToClient.mockResolvedValue({ ok: false, via: "template", errorCode: "132001", messageId: "out_1" });
    const res = await quote(req({ agreedPrice: 1000, deadline: tomorrow }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).delivery).toMatchObject({ ok: false, errorCode: "132001" });
  });
});

describe("POST reject", () => {
  it("bukti PENDING → REJECTED, DP_REVIEW → QUOTED, alasan dikirim", async () => {
    intake("DP_REVIEW");
    const res = await reject(req({ proofId: "p1", reason: "Nominal kurang dari DP" }), ctx);
    expect(res.status).toBe(200);
    expect(db.paymentProof.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "p1", intakeId: "in_1", status: "PENDING" },
      data: { status: "REJECTED", rejectReason: "Nominal kurang dari DP", reviewedById: "u_owner" },
    });
    expect(db.waIntake.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "in_1", status: "DP_REVIEW" },
      data: { status: "QUOTED" },
    });
    expect(outbound.sendToClient.mock.calls[0][1].template).toEqual({
      name: "yd_dp_ditolak",
      params: ["Sari", "Nominal kurang dari DP"],
    });
  });

  it("alasan wajib", async () => {
    expect((await reject(req({ proofId: "p1", reason: " " }), ctx)).status).toBe(400);
  });

  it("bukti sudah diperiksa / milik order lain → 409, status tidak berubah", async () => {
    intake("DP_REVIEW");
    db.paymentProof.updateMany.mockResolvedValue({ count: 0 });
    expect((await reject(req({ proofId: "p_lain", reason: "salah" }), ctx)).status).toBe(409);
    expect(db.waIntake.updateMany).not.toHaveBeenCalled();
    expect(outbound.sendToClient).not.toHaveBeenCalled();
  });

  it("bukan DP_REVIEW → 409", async () => {
    intake("QUOTED");
    expect((await reject(req({ proofId: "p1", reason: "salah" }), ctx)).status).toBe(409);
  });
});

describe("POST cancel", () => {
  it.each(["COLLECTING", "AWAITING_QUOTE", "QUOTED", "DP_REVIEW"])("%s → CANCELLED, bukti pending ditutup", async (status) => {
    intake(status);
    const res = await cancel(req({ reason: "Klien minta batal" }), ctx);
    expect(res.status).toBe(200);
    expect(db.waIntake.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "in_1", status },
      data: { cancelReason: "Klien minta batal", status: "CANCELLED" },
    });
    expect(db.paymentProof.updateMany.mock.calls[0][0].where).toEqual({ intakeId: "in_1", status: "PENDING" });
    expect(outbound.sendToClient.mock.calls[0][1].template.name).toBe("yd_order_dibatalkan");
  });

  it.each(["APPROVED", "CANCELLED"])("%s → 409", async (status) => {
    intake(status);
    expect((await cancel(req({ reason: "batal" }), ctx)).status).toBe(409);
  });

  it("order tidak ada → 404", async () => {
    db.waIntake.findFirst.mockResolvedValue(null);
    expect((await cancel(req({ reason: "batal" }), ctx)).status).toBe(404);
  });
});

describe("order dari Uji bot (docs/WHATSAPP_BOT_GUIDE.md §5)", () => {
  // DB mengembalikan null untuk order sandbox karena filter ini; di sini dipastikan filternya ikut.
  it.each([
    ["quote", () => quote(req({ agreedPrice: 1500000, deadline: tomorrow }), ctx)],
    ["reject", () => reject(req({ proofId: "p_1", reason: "nominal kurang" }), ctx)],
    ["cancel", () => cancel(req({ reason: "batal" }), ctx)],
  ])("%s mencari order dengan isSandbox = false", async (_name, call) => {
    db.waIntake.findFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(db.waIntake.findFirst.mock.calls[0][0].where).toEqual({ id: "in_1", conversation: { isSandbox: false } });
    expect(outbound.sendToClient).not.toHaveBeenCalled();
  });
});
