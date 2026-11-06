import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ studioSettings: { findUnique: vi.fn() } }));
const api = vi.hoisted(() => ({ sendText: vi.fn(), sendTemplate: vi.fn(), markAsRead: vi.fn() }));
const fonnte = vi.hoisted(() => ({ fonnteSendText: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./env", () => ({
  getWhatsAppEnv: () => ({ WHATSAPP_TEMPLATE_LANG: "id" }),
  isWhatsAppConfigured: () => true,
  isFonnteConfigured: () => true,
}));
vi.mock("./client-api", async (orig) => ({ ...(await orig<typeof import("./client-api")>()), ...api }));
vi.mock("./fonnte", async (orig) => ({ ...(await orig<typeof import("./fonnte")>()), ...fonnte }));

import { FonnteApiError } from "./fonnte";
import { deliveryErrorCode, getChannel, markAsReadOnChannel, sendTemplateOnChannel, sendTextOnChannel, usesServiceWindow } from "./channel";

beforeEach(() => {
  vi.clearAllMocks();
  api.sendText.mockResolvedValue("wamid.1");
  api.sendTemplate.mockResolvedValue("wamid.2");
  fonnte.fonnteSendText.mockResolvedValue("fonnte:9");
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
});
