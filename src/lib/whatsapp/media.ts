import { randomBytes } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { getClient } from "@/lib/storage";
import { getWhatsAppEnv } from "./env";
import { MediaTooLargeError, downloadMediaContent, getMediaInfo } from "./client-api";

// Sama dengan batas route upload klien (§10.2).
export const WA_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type AllowedMime = keyof typeof EXTENSIONS;

/** Tentukan jenis gambar dari magic bytes, bukan dari MIME yang dikirim. */
export function sniffImageType(buf: Buffer): AllowedMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export type StoredMedia = { storageKey: string; mimeType: AllowedMime; data: Buffer };

export type MediaRejection = "MEDIA_TOO_LARGE" | "MEDIA_TYPE_NOT_ALLOWED";

export type StoreMediaResult = { ok: true; media: StoredMedia } | { ok: false; reason: MediaRejection };

/**
 * Unduh gambar dari pesan masuk lalu simpan di bucket privat `wa-media/...`.
 * Belum diketahui apakah gambar ini referensi brief atau bukti transfer, jadi
 * selalu privat dulu (§10.2, §16). Penolakan dicatat di WaMessage.errorCode.
 */
export async function storeInboundMedia(messageId: string): Promise<StoreMediaResult> {
  const message = await prisma.waMessage.findUniqueOrThrow({
    where: { id: messageId },
    select: { conversationId: true, type: true, mediaId: true, mediaStorageKey: true },
  });
  if (message.type !== "image" || !message.mediaId) {
    throw new Error("Pesan ini bukan gambar");
  }

  const reject = async (reason: MediaRejection): Promise<StoreMediaResult> => {
    await prisma.waMessage.update({ where: { id: messageId }, data: { errorCode: reason } });
    return { ok: false, reason };
  };

  const info = await getMediaInfo(message.mediaId);
  if (!(info.mimeType in EXTENSIONS)) return reject("MEDIA_TYPE_NOT_ALLOWED");
  if (info.fileSize !== null && info.fileSize > WA_MEDIA_MAX_BYTES) return reject("MEDIA_TOO_LARGE");

  let data: Buffer;
  try {
    data = await downloadMediaContent(info.url, WA_MEDIA_MAX_BYTES);
  } catch (error) {
    if (error instanceof MediaTooLargeError) return reject("MEDIA_TOO_LARGE");
    throw error;
  }

  const mimeType = sniffImageType(data);
  if (!mimeType) return reject("MEDIA_TYPE_NOT_ALLOWED");

  const storageKey = message.mediaStorageKey
    ?? `wa-media/${message.conversationId}/${randomBytes(16).toString("hex")}.${EXTENSIONS[mimeType]}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: getWhatsAppEnv().STORAGE_PRIVATE_BUCKET,
      Key: storageKey,
      ContentType: mimeType,
      Body: data,
    }),
  );

  await prisma.waMessage.update({
    where: { id: messageId },
    data: { mediaStorageKey: storageKey, ...(info.sha256 ? { mediaSha256: info.sha256 } : {}) },
  });

  return { ok: true, media: { storageKey, mimeType, data } };
}
