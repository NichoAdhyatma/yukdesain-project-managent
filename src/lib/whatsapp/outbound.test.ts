import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waConversation: { findUniqueOrThrow: vi.fn() },
  waMessage: { create: vi.fn() },
}));
const api = vi.hoisted(() => ({ sendText: vi.fn(), sendTemplate: vi.fn() }));
const env = vi.hoisted(() => ({ getWhatsAppEnv: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./env", () => env);
vi.mock("./client-api", async (orig) => ({ ...(await orig<typeof import("./client-api")>()), ...api }));

import { WhatsAppApiError } from "./client-api";
import {
  cancelledMessage,
  dpRejectedMessage,
  isWithinServiceWindow,
  offerMessage,
  sendToClient,
  templateParam,
} from "./outbound";

const HOUR = 60 * 60 * 1000;
const offer = offerMessage({
  clientName: "Sari",
  serviceName: "Logo Minimalis",
  agreedPrice: 1500000,
  dpAmount: 750000,
  deadline: new Date("2026-11-15T00:00:00Z"),
  accounts: [{ name: "BCA", accountNumber: "1234567890", accountHolder: "YukDesain Studio" }],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  env.getWhatsAppEnv.mockReturnValue({ WHATSAPP_TEMPLATE_LANG: "id" });
  db.waMessage.create.mockResolvedValue({ id: "out_1" });
  api.sendText.mockResolvedValue("wamid.T");
  api.sendTemplate.mockResolvedValue("wamid.TPL");
});

describe("isWithinServiceWindow", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  it.each([
    [null, false],
    [new Date(now.getTime() - 1 * HOUR), true],
    [new Date(now.getTime() - 23.8 * HOUR), true],
    [new Date(now.getTime() - 23.95 * HOUR), false], // margin 5 menit
    [new Date(now.getTime() - 30 * HOUR), false],
  ])("%s → %s", (last, expected) => {
    expect(isWithinServiceWindow(last, now)).toBe(expected);
  });
});

describe("templateParam", () => {
  it("baris baru, tab, spasi beruntun dirapikan; kosong jadi '-'", () => {
    expect(templateParam("nominal\nkurang\t   dari DP")).toBe("nominal kurang dari DP");
    expect(templateParam("   ")).toBe("-");
    expect(templateParam("a".repeat(600)).length).toBe(500);
  });
});

describe("isi pesan", () => {
  it("penawaran: harga, DP, deadline, rekening; parameter template sesuai urutan", () => {
    expect(offer.text).toContain("*Rp1.500.000*");
    expect(offer.text).toContain("DP 50%: *Rp750.000*");
    expect(offer.text).toContain("15 November 2026");
    expect(offer.text).toContain("• BCA 1234567890 a.n. YukDesain Studio");
    expect(offer.template).toEqual({
      name: "yd_penawaran_order",
      params: ["Sari", "Logo Minimalis", "Rp1.500.000", "Rp750.000", "15 November 2026"],
    });
  });

  it("tanpa rekening aktif → kalimat pengganti", () => {
    const m = offerMessage({
      clientName: null,
      serviceName: "Logo Minimalis",
      agreedPrice: 1,
      dpAmount: 1,
      deadline: new Date(),
      accounts: [],
    });
    expect(m.text).toContain("Info rekening pembayaran akan dikirim tim kami.");
    expect(m.text.startsWith("Halo kak,")).toBe(true);
    expect(m.template.params[0]).toBe("Kak");
  });

  it("DP ditolak & order dibatalkan membawa alasan", () => {
    const r = dpRejectedMessage({ clientName: "Sari", serviceName: "Logo", reason: "nominal\nkurang" });
    expect(r.template).toEqual({ name: "yd_dp_ditolak", params: ["Sari", "nominal kurang"] });
    expect(r.text).toContain("Alasan: nominal\nkurang");
    expect(cancelledMessage({ clientName: "Sari", serviceName: "Logo", reason: "klien batal" }).template.name).toBe(
      "yd_order_dibatalkan",
    );
  });
});

describe("sendToClient", () => {
  const conversation = (hoursAgo: number | null) =>
    db.waConversation.findUniqueOrThrow.mockResolvedValue({
      id: "conv_1",
      waId: "6281234567890",
      lastInboundAt: hoursAgo === null ? null : new Date(Date.now() - hoursAgo * HOUR),
    });

  it("dalam 24 jam → teks bebas, tersimpan sebagai OUTBOUND text", async () => {
    conversation(2);
    await expect(sendToClient("conv_1", offer)).resolves.toEqual({ ok: true, via: "text", messageId: "out_1" });
    expect(api.sendText).toHaveBeenCalledWith("6281234567890", offer.text);
    expect(api.sendTemplate).not.toHaveBeenCalled();
    expect(db.waMessage.create.mock.calls[0][0].data).toMatchObject({
      direction: "OUTBOUND",
      type: "text",
      wamid: "wamid.T",
      deliveryStatus: "sent",
    });
  });

  it("lewat 24 jam → template dengan bahasa dari env", async () => {
    conversation(30);
    await expect(sendToClient("conv_1", offer)).resolves.toMatchObject({ ok: true, via: "template" });
    expect(api.sendTemplate).toHaveBeenCalledWith("6281234567890", "yd_penawaran_order", "id", offer.template.params);
    expect(db.waMessage.create.mock.calls[0][0].data).toMatchObject({ type: "template", wamid: "wamid.TPL" });
  });

  it("klien belum pernah chat → template", async () => {
    conversation(null);
    await expect(sendToClient("conv_1", offer)).resolves.toMatchObject({ via: "template" });
  });

  it("template belum disetujui / gagal → tersimpan failed dengan kode", async () => {
    conversation(30);
    api.sendTemplate.mockRejectedValue(new WhatsAppApiError(400, "132001"));
    await expect(sendToClient("conv_1", offer)).resolves.toEqual({
      ok: false,
      via: "template",
      errorCode: "132001",
      messageId: "out_1",
    });
    expect(db.waMessage.create.mock.calls[0][0].data).toMatchObject({ deliveryStatus: "failed", errorCode: "132001" });
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("6281234567890");
  });

  it("env WhatsApp belum lengkap → NOT_CONFIGURED tanpa memanggil API", async () => {
    conversation(2);
    env.getWhatsAppEnv.mockImplementation(() => {
      throw new Error("x");
    });
    await expect(sendToClient("conv_1", offer)).resolves.toMatchObject({ ok: false, errorCode: "NOT_CONFIGURED" });
    expect(api.sendText).not.toHaveBeenCalled();
  });
});
