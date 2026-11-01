import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waMessage: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
}));
const s3Send = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({ getMediaInfo: vi.fn(), downloadMediaContent: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/storage", () => ({ getClient: () => ({ send: s3Send }) }));
vi.mock("./env", () => ({ getWhatsAppEnv: () => ({ STORAGE_PRIVATE_BUCKET: "private-bucket" }) }));
vi.mock("./client-api", async (orig) => ({
  ...(await orig<typeof import("./client-api")>()),
  getMediaInfo: api.getMediaInfo,
  downloadMediaContent: api.downloadMediaContent,
}));

import { MediaTooLargeError } from "./client-api";
import { WA_MEDIA_MAX_BYTES, sniffImageType, storeInboundMedia } from "./media";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);

describe("sniffImageType", () => {
  it.each([
    [JPEG, "image/jpeg"],
    [PNG, "image/png"],
    [WEBP, "image/webp"],
    [Buffer.from("%PDF-1.7"), null],
    [Buffer.from("<svg>"), null],
    [Buffer.alloc(0), null],
  ])("%#", (buf, expected) => {
    expect(sniffImageType(buf)).toBe(expected);
  });
});

describe("storeInboundMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.waMessage.findUniqueOrThrow.mockResolvedValue({
      conversationId: "conv_1",
      type: "image",
      mediaId: "MEDIA_1",
      mediaStorageKey: null,
    });
    api.getMediaInfo.mockResolvedValue({ url: "https://cdn.test/m", mimeType: "image/jpeg", sha256: "SHA", fileSize: 7 });
    api.downloadMediaContent.mockResolvedValue(JPEG);
  });

  it("menyimpan ke bucket privat dengan key wa-media acak", async () => {
    const result = await storeInboundMedia("msg_1");

    expect(result.ok).toBe(true);
    const put = s3Send.mock.calls[0][0].input;
    expect(put.Bucket).toBe("private-bucket");
    expect(put.Key).toMatch(/^wa-media\/conv_1\/[0-9a-f]{32}\.jpg$/);
    expect(put.ContentType).toBe("image/jpeg");
    expect(api.downloadMediaContent).toHaveBeenCalledWith("https://cdn.test/m", WA_MEDIA_MAX_BYTES);
    expect(db.waMessage.update).toHaveBeenCalledWith({
      where: { id: "msg_1" },
      data: { mediaStorageKey: put.Key, mediaSha256: "SHA" },
    });
  });

  it("memakai jenis dari isi file, bukan MIME dari Meta", async () => {
    api.downloadMediaContent.mockResolvedValue(PNG);
    const result = await storeInboundMedia("msg_1");
    expect(result).toMatchObject({ ok: true, media: { mimeType: "image/png" } });
    expect(s3Send.mock.calls[0][0].input.Key).toMatch(/\.png$/);
  });

  it("menolak MIME yang tidak diizinkan tanpa mengunduh", async () => {
    api.getMediaInfo.mockResolvedValue({ url: "u", mimeType: "image/gif", sha256: null, fileSize: 1 });
    await expect(storeInboundMedia("msg_1")).resolves.toEqual({ ok: false, reason: "MEDIA_TYPE_NOT_ALLOWED" });
    expect(api.downloadMediaContent).not.toHaveBeenCalled();
    expect(db.waMessage.update).toHaveBeenCalledWith({ where: { id: "msg_1" }, data: { errorCode: "MEDIA_TYPE_NOT_ALLOWED" } });
  });

  it("menolak file_size di atas 10 MB tanpa mengunduh", async () => {
    api.getMediaInfo.mockResolvedValue({ url: "u", mimeType: "image/jpeg", sha256: null, fileSize: WA_MEDIA_MAX_BYTES + 1 });
    await expect(storeInboundMedia("msg_1")).resolves.toEqual({ ok: false, reason: "MEDIA_TOO_LARGE" });
    expect(api.downloadMediaContent).not.toHaveBeenCalled();
  });

  it("menolak jika unduhan melebihi batas", async () => {
    api.downloadMediaContent.mockRejectedValue(new MediaTooLargeError());
    await expect(storeInboundMedia("msg_1")).resolves.toEqual({ ok: false, reason: "MEDIA_TOO_LARGE" });
    expect(s3Send).not.toHaveBeenCalled();
  });

  it("menolak isi yang bukan gambar walau MIME-nya image/jpeg", async () => {
    api.downloadMediaContent.mockResolvedValue(Buffer.from("<html>"));
    await expect(storeInboundMedia("msg_1")).resolves.toEqual({ ok: false, reason: "MEDIA_TYPE_NOT_ALLOWED" });
    expect(s3Send).not.toHaveBeenCalled();
  });

  it("pesan bukan gambar → error", async () => {
    db.waMessage.findUniqueOrThrow.mockResolvedValue({ conversationId: "c", type: "text", mediaId: null, mediaStorageKey: null });
    await expect(storeInboundMedia("msg_1")).rejects.toThrow("bukan gambar");
  });
});
