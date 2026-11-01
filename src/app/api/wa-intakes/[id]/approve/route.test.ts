import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const approve = vi.hoisted(() => ({ approveIntake: vi.fn() }));
const outbound = vi.hoisted(() => ({ sendToClient: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/whatsapp/approve-intake", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/approve-intake")>()),
  approveIntake: approve.approveIntake,
}));
vi.mock("@/lib/whatsapp/outbound", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/outbound")>()),
  sendToClient: outbound.sendToClient,
}));
vi.mock("@/lib/whatsapp/intake-api", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/intake-api")>()),
  findIntakeForDetail: async () => null,
}));

import { IntakeError } from "@/lib/whatsapp/intake";
import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "in_1" }) };
const checklist = { fundsReceived: true, amountMatches: true, briefReviewed: true };
const req = (body: unknown, origin = "https://portal.test") =>
  new Request("http://internal:3000/api/wa-intakes/in_1/approve", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { origin },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  session.getCurrentUser.mockResolvedValue({ id: "u_owner", roles: ["OWNER"] });
  approve.approveIntake.mockResolvedValue({
    conversationId: "conv_1",
    clientName: "Sari",
    project: { id: "p1", projectNumber: "PRJ-20261101-ABC123" },
    clientLinkToken: "abcdef0123456789",
  });
  outbound.sendToClient.mockResolvedValue({ ok: true, via: "text", messageId: "m" });
});

describe("POST /api/wa-intakes/[id]/approve", () => {
  it.each([
    [{ ...checklist, fundsReceived: false }],
    [{ fundsReceived: true, amountMatches: true }],
    [{}],
  ])("checklist tidak lengkap %j → 400, tidak ada project", async (cl) => {
    const res = await POST(req({ proofId: "p", verifiedAmount: 750000, checklist: cl }), ctx);
    expect(res.status).toBe(400);
    expect(approve.approveIntake).not.toHaveBeenCalled();
  });

  it.each([0, -1, 750000.5])("nominal %s → 400", async (verifiedAmount) => {
    expect((await POST(req({ proofId: "p", verifiedAmount, checklist }), ctx)).status).toBe(400);
  });

  it("bukan owner → 403", async () => {
    session.getCurrentUser.mockResolvedValue({ id: "d", roles: ["DESIGNER"] });
    expect((await POST(req({ proofId: "p", verifiedAmount: 1, checklist }), ctx)).status).toBe(403);
  });

  it("valid → approveIntake dipanggil, klien dikirimi kode project + link dari Origin", async () => {
    const res = await POST(req({ proofId: "proof_1", verifiedAmount: 750000, checklist }), ctx);
    expect(res.status).toBe(200);
    expect(approve.approveIntake).toHaveBeenCalledWith({
      intakeId: "in_1",
      proofId: "proof_1",
      verifiedAmount: 750000,
      actorId: "u_owner",
    });
    const body = await res.json();
    expect(body.trackingUrl).toBe("https://portal.test/client/abcdef0123456789");
    expect(outbound.sendToClient.mock.calls[0][1].template).toEqual({
      name: "yd_dp_terverifikasi",
      params: ["Sari", "PRJ-20261101-ABC123", "https://portal.test/client/abcdef0123456789"],
    });
  });

  it("APP_PUBLIC_URL menang atas Origin", async () => {
    vi.stubEnv("APP_PUBLIC_URL", "https://portal.yukdesain.com/");
    const body = await (await POST(req({ proofId: "p", verifiedAmount: 1, checklist }), ctx)).json();
    expect(body.trackingUrl).toBe("https://portal.yukdesain.com/client/abcdef0123456789");
  });

  it("CONFLICT dari transaksi (approve ganda) → 409, tidak ada pesan", async () => {
    approve.approveIntake.mockRejectedValue(new IntakeError("CONFLICT", "Status intake sudah berubah"));
    expect((await POST(req({ proofId: "p", verifiedAmount: 1, checklist }), ctx)).status).toBe(409);
    expect(outbound.sendToClient).not.toHaveBeenCalled();
  });

  it("pesan gagal → project tetap jadi, hasil gagal dikembalikan", async () => {
    outbound.sendToClient.mockResolvedValue({ ok: false, via: "template", errorCode: "132001", messageId: "m" });
    const res = await POST(req({ proofId: "p", verifiedAmount: 1, checklist }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).delivery.ok).toBe(false);
  });
});
