import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MediaTooLargeError,
  WhatsAppApiError,
  downloadMediaContent,
  getMediaInfo,
  markAsRead,
  sendTemplate,
  sendText,
} from "./client-api";

const env = {
  WHATSAPP_ACCESS_TOKEN: "TOKEN",
  WHATSAPP_PHONE_NUMBER_ID: "123",
  WHATSAPP_GRAPH_VERSION: "v23.0",
  WHATSAPP_GRAPH_BASE_URL: "https://graph.test",
};

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url, init, body: init.body ? JSON.parse(init.body) : null };
}

describe("sendText", () => {
  it("POST ke /{phone-id}/messages dan mengembalikan wamid", async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [{ id: "wamid.OUT" }] }));
    await expect(sendText("6281", "Halo", env)).resolves.toBe("wamid.OUT");

    const { url, init, body } = lastCall();
    expect(url).toBe("https://graph.test/v23.0/123/messages");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer TOKEN");
    expect(body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "6281",
      type: "text",
      text: { body: "Halo", preview_url: false },
    });
  });

  it("error Meta → WhatsAppApiError dengan kode", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 131047, message: "Re-engagement" } }, 400));
    const err = await sendText("6281", "Halo", env).catch((e) => e);
    expect(err).toBeInstanceOf(WhatsAppApiError);
    expect(err).toMatchObject({ status: 400, code: "131047" });
    expect(err.message).not.toContain("6281");
  });

  it("respons tanpa id pesan ditolak", async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [] }));
    await expect(sendText("6281", "Halo", env)).rejects.toMatchObject({ code: "NO_MESSAGE_ID" });
  });
});

describe("sendTemplate", () => {
  it("mengirim parameter body sesuai urutan", async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [{ id: "wamid.T" }] }));
    await sendTemplate("6281", "yd_dp_ditolak", "id", ["Budi", "Nominal kurang"], env);
    expect(lastCall().body.template).toEqual({
      name: "yd_dp_ditolak",
      language: { code: "id" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: "Budi" },
            { type: "text", text: "Nominal kurang" },
          ],
        },
      ],
    });
  });

  it("template tanpa parameter tidak mengirim component", async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [{ id: "wamid.T" }] }));
    await sendTemplate("6281", "hello_world", "en_US", [], env);
    expect(lastCall().body.template.components).toEqual([]);
  });
});

describe("markAsRead", () => {
  it("mengirim status read", async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true }));
    await markAsRead("wamid.IN", env);
    expect(lastCall().body).toEqual({ messaging_product: "whatsapp", status: "read", message_id: "wamid.IN" });
  });
});

describe("getMediaInfo", () => {
  it("GET /{media-id}", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ url: "https://cdn.test/m", mime_type: "image/jpeg", sha256: "S", file_size: "2048", id: "M1" }),
    );
    await expect(getMediaInfo("M1", env)).resolves.toEqual({
      url: "https://cdn.test/m",
      mimeType: "image/jpeg",
      sha256: "S",
      fileSize: 2048,
    });
    expect(lastCall().url).toBe("https://graph.test/v23.0/M1");
  });
});

describe("downloadMediaContent", () => {
  it("mengunduh dengan header Authorization", async () => {
    fetchMock.mockResolvedValueOnce(new Response(Buffer.from("abc")));
    const buf = await downloadMediaContent("https://cdn.test/m", 10, env);
    expect(buf.toString()).toBe("abc");
    expect(lastCall().init.headers.Authorization).toBe("Bearer TOKEN");
  });

  it("menolak jika content-length melebihi batas", async () => {
    fetchMock.mockResolvedValueOnce(new Response("x", { headers: { "content-length": "999" } }));
    await expect(downloadMediaContent("https://cdn.test/m", 10, env)).rejects.toBeInstanceOf(MediaTooLargeError);
  });

  it("menolak jika isi melebihi batas walau tanpa content-length", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(8));
        c.enqueue(new Uint8Array(8));
        c.close();
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(stream));
    await expect(downloadMediaContent("https://cdn.test/m", 10, env)).rejects.toBeInstanceOf(MediaTooLargeError);
  });
});
