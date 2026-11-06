import { createHash, randomBytes } from "node:crypto";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getClient } from "@/lib/storage";
import { getPrivateBucket } from "./env";
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

/** WaMessage.mediaId untuk lampiran Fonnte: "url:<https URL>" (Meta memakai media id). */
export const FONNTE_MEDIA_PREFIX = "url:";

function isSafeMediaUrl(raw: string): boolean {
  if (!URL.canParse(raw)) return false;
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  // Hanya https ke host publik: URL datang dari webhook, jangan sampai dipakai menembak jaringan internal.
  if (url.protocol !== "https:" || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  return !/^(\d+\.){3}\d+$/.test(host) && !host.includes(":");
}

async function downloadPublicMedia(url: string, maxBytes: number): Promise<Buffer> {
  if (!isSafeMediaUrl(url)) throw new Error("URL lampiran tidak diizinkan");
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!res.ok || !res.body) throw new Error(`Unduh lampiran gagal (${res.status})`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new MediaTooLargeError();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new MediaTooLargeError();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
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

  let data: Buffer;
  let sha256: string | null = null;
  try {
    if (message.mediaId.startsWith(FONNTE_MEDIA_PREFIX)) {
      // Fonnte mengirim URL lampiran langsung; jenis file dicek dari magic bytes di bawah.
      const url = message.mediaId.slice(FONNTE_MEDIA_PREFIX.length);
      if (!isSafeMediaUrl(url)) return reject("MEDIA_TYPE_NOT_ALLOWED");
      data = await downloadPublicMedia(url, WA_MEDIA_MAX_BYTES);
    } else {
      const info = await getMediaInfo(message.mediaId);
      if (!(info.mimeType in EXTENSIONS)) return reject("MEDIA_TYPE_NOT_ALLOWED");
      if (info.fileSize !== null && info.fileSize > WA_MEDIA_MAX_BYTES) return reject("MEDIA_TOO_LARGE");
      data = await downloadMediaContent(info.url, WA_MEDIA_MAX_BYTES);
      sha256 = info.sha256;
    }
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
      Bucket: getPrivateBucket(),
      Key: storageKey,
      ContentType: mimeType,
      Body: data,
    }),
  );

  await prisma.waMessage.update({
    where: { id: messageId },
    // Fonnte tidak mengirim hash: dihitung dari isi file (dipakai deteksi bukti transfer ganda).
    data: { mediaStorageKey: storageKey, mediaSha256: sha256 ?? createHash("sha256").update(data).digest("base64") },
  });

  return { ok: true, media: { storageKey, mimeType, data } };
}

/** Baca media dari bucket privat (untuk dikirim ulang ke model). */
export async function readPrivateMedia(storageKey: string): Promise<Buffer> {
  const res = await getClient().send(
    new GetObjectCommand({ Bucket: getPrivateBucket(), Key: storageKey }),
  );
  if (!res.Body) throw new Error("Media kosong");
  return Buffer.from(await res.Body.transformToByteArray());
}

export function mimeFromStorageKey(storageKey: string): AllowedMime {
  const ext = storageKey.split(".").pop();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

/** Pindahkan objek di dalam bucket privat (salin lalu hapus sumber, hapus bersifat best-effort). */
export async function movePrivateMedia(fromKey: string, toKey: string): Promise<void> {
  const bucket = getPrivateBucket();
  const client = getClient();
  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: toKey,
      CopySource: `${bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, "/")}`,
    }),
  );
  // Salinan baru sudah ada; sisa di prefix lama tetap privat, jadi gagal hapus cukup dicatat.
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: fromKey })).catch((error: Error) => {
    console.error("[whatsapp] gagal menghapus media lama:", error.name);
  });
}

// Media privat (termasuk bukti transfer) hanya lewat presigned URL berumur pendek (§16).
export const PRIVATE_MEDIA_URL_TTL_SECONDS = 600;

export function getPrivateMediaUrl(storageKey: string): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: getPrivateBucket(), Key: storageKey }),
    { expiresIn: PRIVATE_MEDIA_URL_TTL_SECONDS },
  );
}
