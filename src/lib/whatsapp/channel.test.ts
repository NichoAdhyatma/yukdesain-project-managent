import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ studioSettings: { findUnique: vi.fn() } }));
const api = vi.hoisted(() => ({ sendText: vi.fn(), sendTemplate: vi.fn(), markAsRead: vi.fn(), sendImage: vi.fn() }));
const fonnte = vi.hoisted(() => ({ fonnteSendText: vi.fn(), fonnteSendImage: vi.fn() }));
const kirimi = vi.hoisted(() => ({ kirimiSendText: vi.fn(), kirimiSendImage: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./env", () => ({
  getWhatsAppEnv: () => ({ WHATSAPP_TEMPLATE_LANG: "id" }),
  isWhatsAppConfigured: () => true,
  isFonnteConfigured: () => true,
  isKirimiConfigured: () => true,
}));
vi.mock("./client-api", async (orig) => ({ ...(await orig<typeof import("./client-api")>()), ...api }));
vi.mock("./fonnte", async (orig) => ({ ...(await orig<typeof import("./fonnte")>()), ...fonnte }));
vi.mock("./kirimi", async (orig) => ({ ...(await orig<typeof import("./kirimi")>()), ...kirimi }));

import { FonnteApiError } from "./fonnte";
import { OutsideServiceWindowError, deliveryErrorCode, getChannel, markAsReadOnChannel, sendImageOnChannel, sendTemplateOnChannel, sendTextOnChannel, usesServiceWindow } from "./channel";

beforeEach(() => {
  vi.clearAllMocks();
  api.sendText.mockResolvedValue("wamid.1");
  api.sendTemplate.mockResolvedValue("wamid.2");
  fonnte.fonnteSendText.mockResolvedValue("fonnte:9");
  kirimi.kirimiSendText.mockResolvedValue("kirimi:7");
});

describe("channel", () => {
  it("default Meta; Fonnte jika dipilih", async () => {
    db.studioSettings.findUnique.mockResolvedValue(null);
    expect(await getChannel()).toBe("META");
    db.studioSettings.findUnique.mockResolvedValue({ waChannel: "FONNTE" });
    expect(await getChannel()).toBe("FONNTE");
  });

  it("teks lewat saluran yang dipilih", async () => {
    expect(await sendTextOnChannel("628", "halo", "META")).toBe("wamid.1");
    expect(await sendTextOnChannel("628", "halo", "FONNTE")).toBe("fonnte:9");
    expect(api.sendText).toHaveBeenCalledTimes(1);
  });

  it("template: Meta kirim template; Fonnte kirim teksnya", async () => {
    const t = { name: "yd_penawaran_order", params: ["Sari"] };
    expect(await sendTemplateOnChannel("628", t, "Halo kak Sari", "META")).toEqual({ id: "wamid.2", via: "template" });
    expect(await sendTemplateOnChannel("628", t, "Halo kak Sari", "FONNTE")).toEqual({ id: "fonnte:9", via: "text" });
    expect(fonnte.fonnteSendText).toHaveBeenCalledWith("628", "Halo kak Sari");
  });

  it("aturan 24 jam hanya Meta; tandai dibaca dilewati untuk pesan Fonnte", async () => {
    expect(usesServiceWindow("META")).toBe(true);
    expect(usesServiceWindow("FONNTE")).toBe(false);
    await markAsReadOnChannel("fonnte:in:1");
    expect(api.markAsRead).not.toHaveBeenCalled();
    await markAsReadOnChannel("wamid.X");
    expect(api.markAsRead).toHaveBeenCalledWith("wamid.X");
  });

  it("kode error Fonnte generik (tanpa isi alasan dari Fonnte)", () => {
    expect(deliveryErrorCode(new FonnteApiError(200, "target invalid 6281234"))).toBe("FONNTE_FAILED");
    expect(deliveryErrorCode(new Error("x"))).toBe("SEND_FAILED");
  });

  it("Kirimi: teks lewat Kirimi, template jadi teks, tanpa aturan 24 jam, tanpa tanda dibaca", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waChannel: "KIRIMI" });
    expect(await getChannel()).toBe("KIRIMI");
    expect(await sendTextOnChannel("628", "halo")).toBe("kirimi:7");
    expect(await sendTemplateOnChannel("628", { name: "yd_x", params: [] }, "teks")).toEqual({ id: "kirimi:7", via: "text" });
    expect(api.sendText).not.toHaveBeenCalled();
    expect(usesServiceWindow("KIRIMI")).toBe(false);
    await markAsReadOnChannel("kirimi:in:1");
    expect(api.markAsRead).not.toHaveBeenCalled();
  });
});

describe("sendImageOnChannel (Plan B Task 1)", () => {
  const url = "https://cdn.example.com/qris.png";
  it("tiap saluran memakai API gambarnya", async () => {
    api.sendImage.mockResolvedValue("wamid.IMG");
    fonnte.fonnteSendImage.mockResolvedValue("fonnte:IMG");
    kirimi.kirimiSendImage.mockResolvedValue("kirimi:IMG");
    expect(await sendImageOnChannel("62812", url, "QRIS BCA", "META")).toBe("wamid.IMG");
    expect(await sendImageOnChannel("62812", url, "QRIS BCA", "FONNTE")).toBe("fonnte:IMG");
    expect(await sendImageOnChannel("62812", url, "QRIS BCA", "KIRIMI")).toBe("kirimi:IMG");
    expect(api.sendImage).toHaveBeenCalledWith("62812", url, "QRIS BCA");
    expect(kirimi.kirimiSendImage).toHaveBeenCalledWith("62812", url, "QRIS BCA");
  });

  it("Meta di luar jendela 24 jam: tidak dikirim, melempar OutsideServiceWindowError", async () => {
    await expect(sendImageOnChannel("62812", url, "QRIS BCA", "META", { withinServiceWindow: false })).rejects.toBeInstanceOf(OutsideServiceWindowError);
    expect(api.sendImage).not.toHaveBeenCalled();
    // Gateway QR tidak punya aturan 24 jam.
    kirimi.kirimiSendImage.mockResolvedValue("kirimi:IMG");
    expect(await sendImageOnChannel("62812", url, "QRIS BCA", "KIRIMI", { withinServiceWindow: false })).toBe("kirimi:IMG");
  });
});
