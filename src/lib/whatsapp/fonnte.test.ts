import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({ getFonnteEnv: () => ({ FONNTE_DEVICE_TOKEN: "tok-123", FONNTE_WEBHOOK_SECRET: "x".repeat(20) }) }));

import { FonnteApiError, fonnteDisconnect, fonnteGetDevice, fonnteGetQr, fonnteSendImage, fonnteSendText, fonnteSetWebhook } from "./fonnte";

const fetchMock = vi.fn();
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("fonnte client", () => {
  it("send: token di header Authorization, id diawali fonnte:", async () => {
    fetchMock.mockResolvedValue(reply({ status: true, id: ["555"] }));
    expect(await fonnteSendText("6281234567890", "halo")).toBe("fonnte:555");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.fonnte.com/send");
    expect(init.headers.Authorization).toBe("tok-123");
    expect((init.body as FormData).get("target")).toBe("6281234567890");
  });

  it("send gagal → FonnteApiError", async () => {
    fetchMock.mockResolvedValue(reply({ status: false, reason: "disconnected device" }));
    await expect(fonnteSendText("628", "x")).rejects.toBeInstanceOf(FonnteApiError);
  });

  it("device: status connect dipetakan", async () => {
    fetchMock.mockResolvedValue(reply({ status: true, device: "6285100000000", device_status: "connect", name: "Bot", package: "Lite", quota: "990", expired: "2026-12-06" }));
    expect(await fonnteGetDevice()).toEqual({ device: "6285100000000", name: "Bot", connected: true, package: "Lite", quota: "990", expired: "2026-12-06" });
  });

  it("qr: gambar base64, atau sudah terhubung", async () => {
    fetchMock.mockResolvedValueOnce(reply({ status: true, url: "iVBORw0" }));
    expect(await fonnteGetQr()).toEqual({ qrPngBase64: "iVBORw0", alreadyConnected: false });
    fetchMock.mockResolvedValueOnce(reply({ status: false, reason: "device already connect" }));
    expect(await fonnteGetQr()).toEqual({ qrPngBase64: null, alreadyConnected: true });
  });

  it("disconnect: sudah terputus dianggap berhasil", async () => {
    fetchMock.mockResolvedValue(reply({ status: false, detail: "device already disconnected" }));
    await expect(fonnteDisconnect()).resolves.toBeUndefined();
  });

  it("update-device mengirim URL webhook dan autoread", async () => {
    fetchMock.mockResolvedValue(reply({ status: true, detail: "device updated!" }));
    await fonnteSetWebhook({ name: "YukDesain Bot", device: "6285100000000", webhookUrl: "https://p.example/api/whatsapp/fonnte/s" });
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("webhook")).toBe("https://p.example/api/whatsapp/fonnte/s");
    expect(body.get("autoread")).toBe("true");
    expect(body.get("group")).toBe("false");
  });

  it("kirim gambar: /send dengan url dan caption sebagai message", async () => {
    fetchMock.mockResolvedValue(reply({ status: true, id: ["556"] }));
    expect(await fonnteSendImage("6281234567890", "https://cdn.example.com/qris.png", "QRIS BCA")).toBe("fonnte:556");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/send");
    const body = init.body instanceof FormData ? Object.fromEntries(init.body) : JSON.parse(init.body);
    expect(body).toMatchObject({ target: "6281234567890", message: "QRIS BCA", url: "https://cdn.example.com/qris.png" });
  });
});
