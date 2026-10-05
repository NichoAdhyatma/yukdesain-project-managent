import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.STORAGE_BUCKET!;
const ENDPOINT = process.env.STORAGE_ENDPOINT!;
const ACCESS_KEY = process.env.STORAGE_ACCESS_KEY!;
const SECRET_KEY = process.env.STORAGE_SECRET_KEY!;
const PUBLIC_URL_BASE = process.env.STORAGE_PUBLIC_URL_BASE!;

let s3Client: S3Client | null = null;

function getClient(): S3Client {
  if (s3Client) return s3Client;

  if (!BUCKET || !ENDPOINT || !ACCESS_KEY || !SECRET_KEY) {
    throw new Error("Storage configuration missing: check STORAGE_BUCKET, STORAGE_ENDPOINT, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY");
  }

  s3Client = new S3Client({
    region: "auto",
    endpoint: ENDPOINT,
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
  });

  return s3Client;
}

export type UploadCategory = "brief-reference" | "progress" | "final" | "revision" | "logo";

function buildKey(category: UploadCategory, projectId: string, filename: string): string {
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${category}/${projectId}/${timestamp}-${safeName}`;
}

export async function generateUploadUrl(
  category: UploadCategory,
  projectId: string,
  filename: string,
  mimeType: string,
  expiresIn = 3600
): Promise<{ uploadUrl: string; storageKey: string; publicUrl: string }> {
  const client = getClient();
  const storageKey = buildKey(category, projectId, filename);

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });

  // Public URL format: endpoint + bucket + storageKey
  const publicUrl = `${ENDPOINT}/${BUCKET}/${storageKey}`;

  return { uploadUrl, storageKey, publicUrl };
}

export async function generateUploadUrlWithAttachment(
  category: UploadCategory,
  projectId: string,
  filename: string,
  mimeType: string,
  uploaderId: string,
  expiresIn = 3600
): Promise<{
  uploadUrl: string;
  storageKey: string;
  attachmentId: string;
  publicUrl: string;
}> {
  const client = getClient();
  const storageKey = buildKey(category, projectId, filename);

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });

  // Save attachment metadata to DB
  const { prisma } = await import("@/lib/db");
  const attachment = await prisma.attachment.create({
    data: {
      filename,
      mimeType,
      size: 0,
      storageKey,
      uploaderId,
    },
  });

  const publicUrl = `${ENDPOINT}/${storageKey}`;

  return { uploadUrl, storageKey, attachmentId: attachment.id, publicUrl };
}

export async function deleteFile(storageKey: string): Promise<void> {
  const client = getClient();
  const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: storageKey });
  await client.send(command);
}

export async function fileExists(storageKey: string): Promise<boolean> {
  const client = getClient();
  try {
    await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: storageKey }));
    return true;
  } catch {
    return false;
  }
}

export function getPublicUrl(storageKey: string): string {
  if (!PUBLIC_URL_BASE) return "";
  return `${PUBLIC_URL_BASE}/${storageKey}`;
}

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function isAllowedFileType(mimeType: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(mimeType) || ALLOWED_DOCUMENT_TYPES.includes(mimeType);
}
