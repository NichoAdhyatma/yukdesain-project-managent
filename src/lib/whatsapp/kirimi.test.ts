import { beforeEach, describe, expect, it, vi } from "vitest";
import { KirimiApiError, kirimiDeviceStatus, kirimiSendImage, kirimiSendText } from "./kirimi";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.KIRIMI_USER_CODE = "UC";
  process.env.KIRIMI_SECRET = "SC";
  process.env.KIRIMI_DEVICE_ID = "D-1";
  process.env.KIRIMI_WEBHOOK_SECRET = "w".repeat(32);
});

const reply = (status: number, body: unknown) => fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });

describe("klien Kirimi", () => {
  it("kirim teks: kredensial di body, clientMsgId unik, id berawalan kirimi:", async () => {
    reply(200, { success: true, data: { message_id: "M1" }, message: "OK" });
    expect(await kirimiSendText("6281234567890", "halo")).toBe("kirimi:M1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.kirimi.id/v1/send-message");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ user_code: "UC", secret: "SC", device_id: "D-1", receiver: "6281234567890", message: "halo", enableTypingEffect: false });
    expect(body.clientMsgId).toMatch(/^yd-[0-9a-f-]{36}$/);
  });

  it("success false walau HTTP 200 → error dengan alasan dari Kirimi", async () => {
    reply(200, { success: false, data: null, message: "Device not connected" });
    await expect(kirimiSendText("6281234567890", "halo")).rejects.toEqual(new KirimiApiError(200, "Device not connected"));
  });

  it("status perangkat dipetakan", async () => {
    reply(200, { success: true, data: { device_id: "D-1", status: "connected", is_connected: true, wa_number: "6288000000299", package: { nama: "Pro" }, expired_at: 1796622862, ai_enabled: true } });
    expect(await kirimiDeviceStatus()).toMatchObject({ connected: true, packageName: "Pro", aiEnabled: true, expiresAt: new Date(1796622862 * 1000).toISOString() });
  });

  it("kirim gambar: send-message dengan media_url, caption sebagai message", async () => {
    reply(200, { success: true, data: { message_id: "M2" }, message: "OK" });
    expect(await kirimiSendImage("6281234567890", "https://cdn.example.com/qris.png", "QRIS BCA")).toBe("kirimi:M2");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.kirimi.id/v1/send-message");
    expect(JSON.parse(init.body)).toMatchObject({ device_id: "D-1", receiver: "6281234567890", message: "QRIS BCA", media_url: "https://cdn.example.com/qris.png" });
  });
});
