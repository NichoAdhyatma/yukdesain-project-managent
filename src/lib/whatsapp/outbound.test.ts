import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waConversation: { findUniqueOrThrow: vi.fn() },
  waMessage: { create: vi.fn() },
  studioSettings: { findUnique: vi.fn(async () => null) },
}));
const api = vi.hoisted(() => ({ sendText: vi.fn(), sendTemplate: vi.fn(), sendImage: vi.fn() }));
const env = vi.hoisted(() => ({ getWhatsAppEnv: vi.fn(), isWhatsAppConfigured: vi.fn(), isFonnteConfigured: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./env", () => env);
vi.mock("./client-api", async (orig) => ({ ...(await orig<typeof import("./client-api")>()), ...api }));

import { WhatsAppApiError } from "./client-api";
import {
  cancelledMessage,
  dpRejectedMessage,
  invoiceMessage,
  invoiceNumberFor,
  isWithinServiceWindow,
  offerMessage,
  sendManualReply,
  sendSystemText,
  sendInvoiceToClient,
  sendToClient,
  templateParam,
} from "./outbound";

const HOUR = 60 * 60 * 1000;
const offer = offerMessage({
  clientName: "Sari",
  serviceName: "Logo Minimalis",
  agreedPrice: 1500000,
  dpAmount: 750000,
  dpPercent: 50,
  deadline: new Date("2026-11-15T00:00:00Z"),
  accounts: [{ name: "BCA", accountNumber: "1234567890", accountHolder: "YukDesain Studio" }],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  env.getWhatsAppEnv.mockReturnValue({ WHATSAPP_TEMPLATE_LANG: "id" });
  env.isWhatsAppConfigured.mockReturnValue(true);
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
    const thirty = offerMessage({ clientName: "Sari", serviceName: "Logo", agreedPrice: 150000, dpAmount: 45000, dpPercent: 30, deadline: new Date(), accounts: [] });
    expect(thirty.text).toContain("• DP 30%: *Rp45.000*");
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
      dpPercent: 50,
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

  it("lewat 24 jam dengan DP selain 50% → tidak dikirim lewat template (isi template Meta tertulis DP 50%)", async () => {
    conversation(30);
    const thirty = offerMessage({ clientName: "Sari", serviceName: "Logo", agreedPrice: 150000, dpAmount: 45000, dpPercent: 30, deadline: new Date(), accounts: [] });
    await expect(sendToClient("conv_1", thirty)).resolves.toMatchObject({ ok: false, via: "template", errorCode: "TEMPLATE_DP_MISMATCH" });
    expect(api.sendTemplate).not.toHaveBeenCalled();
    expect(db.waMessage.create.mock.calls[0][0].data).toMatchObject({ deliveryStatus: "failed", errorCode: "TEMPLATE_DP_MISMATCH" });
  });

  it("dalam 24 jam dengan DP 30% → teks bebas tetap terkirim", async () => {
    conversation(2);
    const thirty = offerMessage({ clientName: "Sari", serviceName: "Logo", agreedPrice: 150000, dpAmount: 45000, dpPercent: 30, deadline: new Date(), accounts: [] });
    await expect(sendToClient("conv_1", thirty)).resolves.toMatchObject({ ok: true, via: "text" });
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
    env.isWhatsAppConfigured.mockReturnValue(false);
    env.getWhatsAppEnv.mockImplementation(() => {
      throw new Error("x");
    });
    await expect(sendToClient("conv_1", offer)).resolves.toMatchObject({ ok: false, errorCode: "NOT_CONFIGURED" });
    expect(api.sendText).not.toHaveBeenCalled();
  });
});

describe("sendManualReply", () => {
  const conv = { id: "conv_1", waId: "6281234567890" };

  it("teks bebas terkirim, disimpan dengan sentById admin (bukan bot)", async () => {
    const res = await sendManualReply(conv, "Halo kak, bisa kami bantu", "u_owner");
    expect(res).toEqual({ ok: true, via: "text", messageId: "out_1" });
    expect(api.sendText).toHaveBeenCalledWith("6281234567890", "Halo kak, bisa kami bantu");
    expect(api.sendTemplate).not.toHaveBeenCalled();
    expect(db.waMessage.create.mock.calls[0][0].data).toMatchObject({
      conversationId: "conv_1",
      direction: "OUTBOUND",
      type: "text",
      body: "Halo kak, bisa kami bantu",
      sentByBot: false,
      sentById: "u_owner",
      wamid: "wamid.T",
      deliveryStatus: "sent",
    });
  });

  it("gagal dari Meta → tetap disimpan sebagai failed dengan kode error", async () => {
    api.sendText.mockRejectedValue(new WhatsAppApiError(400, "131047"));
    const res = await sendManualReply(conv, "Halo", "u_owner");
    expect(res).toEqual({ ok: false, via: "text", errorCode: "131047", messageId: "out_1" });
    expect(db.waMessage.create.mock.calls[0][0].data).toMatchObject({ deliveryStatus: "failed", errorCode: "131047", sentById: "u_owner" });
  });

  it("env belum lengkap → NOT_CONFIGURED tanpa memanggil Meta", async () => {
    env.isWhatsAppConfigured.mockReturnValue(false);
    env.getWhatsAppEnv.mockImplementation(() => {
      throw new Error("Konfigurasi WhatsApp tidak valid");
    });
    const res = await sendManualReply(conv, "Halo", "u_owner");
    expect(res).toMatchObject({ ok: false, errorCode: "NOT_CONFIGURED" });
    expect(api.sendText).not.toHaveBeenCalled();
  });
});

describe("sendSystemText (kabar otomatis ke klien, docs/CLIENT_NOTIFICATIONS.md)", () => {
  const conversation = (hoursAgo: number) =>
    db.waConversation.findUniqueOrThrow.mockResolvedValue({ id: "conv_1", waId: "6281234567890", lastInboundAt: new Date(Date.now() - hoursAgo * HOUR) });

  it("Meta di luar 24 jam → tidak dikirim, tidak lewat template, tidak tersimpan", async () => {
    conversation(30);
    await expect(sendSystemText("conv_1", "Halo kak")).resolves.toEqual({ ok: false, via: null, errorCode: "OUTSIDE_SERVICE_WINDOW", messageId: null });
    expect(api.sendText).not.toHaveBeenCalled();
    expect(api.sendTemplate).not.toHaveBeenCalled();
    expect(db.waMessage.create).not.toHaveBeenCalled();
  });

  it("dalam 24 jam → teks terkirim dan tersimpan sebagai OUTBOUND", async () => {
    conversation(2);
    await expect(sendSystemText("conv_1", "Halo kak")).resolves.toEqual({ ok: true, via: "text", messageId: "out_1" });
    expect(api.sendText).toHaveBeenCalledWith("6281234567890", "Halo kak");
    expect(db.waMessage.create.mock.calls[0][0].data).toMatchObject({ direction: "OUTBOUND", type: "text", body: "Halo kak", sentByBot: false, deliveryStatus: "sent" });
  });
});

describe("invoice (spec 2026-11-11 §5, Plan B Task 2)", () => {
  const base = {
    clientName: "Sari",
    serviceName: "Poster Menu",
    invoiceNumber: "INV-WA-20261111-AB12",
    agreedPrice: 160000,
    dpAmount: 80000,
    dpPercent: 50,
    deadline: new Date("2026-11-15T00:00:00Z"),
    lines: ["Rp135.000 (sampai 35 item) + 5 item × Rp5.000 = Rp160.000"],
    accounts: [
      { name: "BCA", accountNumber: "1234567890", accountHolder: "YukDesain Studio" },
      { name: "DANA", accountNumber: "08123", accountHolder: "Rizal" },
    ],
  };

  it("nomor invoice INV-WA-YYYYMMDD-XXXX (tanggal WIB)", () => {
    expect(invoiceNumberFor(new Date("2026-11-11T18:30:00Z"))).toMatch(/^INV-WA-20261112-[A-Z0-9]{4}$/);
  });

  it("isi: nomor, rincian, total, tagihan DP, sisa pelunasan, deadline, semua metode bayar, bukti transfer", () => {
    const m = invoiceMessage(base);
    expect(m.text).toContain("Invoice INV-WA-20261111-AB12");
    expect(m.text).toContain("Rp135.000 (sampai 35 item) + 5 item × Rp5.000 = Rp160.000");
    expect(m.text).toContain("Total: *Rp160.000*");
    expect(m.text).toContain("Tagihan DP 50%: *Rp80.000*");
    expect(m.text).toContain("Sisa pelunasan: *Rp80.000*");
    expect(m.text).toContain("Deadline: 15 November 2026");
    expect(m.text).toContain("• BCA 1234567890 a.n. YukDesain Studio");
    expect(m.text).toContain("• DANA 08123 a.n. Rizal");
    expect(m.text).toContain("bukti transfer");
    expect(m.text).not.toContain("—");
    // Pembuka di luar 24 jam tetap template penawaran yang sudah disetujui Meta.
    expect(m.template).toEqual({ name: "yd_penawaran_order", params: ["Sari", "Poster Menu", "Rp160.000", "Rp80.000", "15 November 2026"] });
  });

  it("tanpa metode bayar aktif → kalimat pengganti", () => {
    expect(invoiceMessage({ ...base, accounts: [] }).text).toContain("Metode pembayaran akan dikirim tim kami");
  });

  describe("sendInvoiceToClient", () => {
    const conversation = (hoursAgo: number) =>
      db.waConversation.findUniqueOrThrow.mockResolvedValue({ id: "conv_1", waId: "6281234567890", lastInboundAt: new Date(Date.now() - hoursAgo * HOUR) });

    it("invoice lalu setiap QRIS https sebagai gambar; URL kosong / http dilewati", async () => {
      conversation(2);
      api.sendImage.mockResolvedValue("wamid.IMG");
      const r = await sendInvoiceToClient("conv_1", invoiceMessage(base), [
        { name: "BCA", url: "https://cdn.example.com/qris-bca.png" },
        { name: "DANA", url: "http://cdn.example.com/qris-dana.png" },
        { name: "OVO", url: "" },
      ]);
      expect(r).toMatchObject({ ok: true, qrisSent: 1, qrisFailed: 0 });
      expect(api.sendImage).toHaveBeenCalledTimes(1);
      expect(api.sendImage).toHaveBeenCalledWith("6281234567890", "https://cdn.example.com/qris-bca.png", "QRIS BCA");
    });

    it("gambar gagal → URL dikirim sebagai teks, dicatat tanpa nomor lengkap", async () => {
      conversation(2);
      api.sendImage.mockRejectedValue(new WhatsAppApiError(400, "131053"));
      const r = await sendInvoiceToClient("conv_1", invoiceMessage(base), [{ name: "BCA", url: "https://cdn.example.com/qris-bca.png" }]);
      expect(r).toMatchObject({ ok: true, qrisSent: 0, qrisFailed: 1 });
      expect(api.sendText).toHaveBeenLastCalledWith("6281234567890", "QRIS BCA: https://cdn.example.com/qris-bca.png");
      const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
      expect(logged).toContain("[whatsapp] gambar QRIS gagal");
      expect(logged).not.toContain("6281234567890");
    });

    it("Meta di luar 24 jam: invoice lewat template, QRIS tidak dikirim (gagal tercatat)", async () => {
      conversation(30);
      const r = await sendInvoiceToClient("conv_1", invoiceMessage(base), [{ name: "BCA", url: "https://cdn.example.com/qris-bca.png" }]);
      expect(r).toMatchObject({ ok: true, via: "template", qrisSent: 0, qrisFailed: 1 });
      expect(api.sendImage).not.toHaveBeenCalled();
      expect(api.sendText).not.toHaveBeenCalled();
    });

    it("invoice gagal terkirim → QRIS tidak dikirim", async () => {
      conversation(2);
      api.sendText.mockRejectedValue(new WhatsAppApiError(500, null));
      const r = await sendInvoiceToClient("conv_1", invoiceMessage(base), [{ name: "BCA", url: "https://cdn.example.com/qris-bca.png" }]);
      expect(r).toMatchObject({ ok: false, qrisSent: 0, qrisFailed: 1 });
      expect(api.sendImage).not.toHaveBeenCalled();
    });
  });
});
