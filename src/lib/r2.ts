import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.STORAGE_BUCKET!;
const ENDPOINT = process.env.STORAGE_ENDPOINT!;
const ACCESS_KEY = process.env.STORAGE_ACCESS_KEY!;
const SECRET_KEY = process.env.STORAGE_SECRET_KEY!;

let s3Client: S3Client | null = null;

function getClient(): S3Client {
  if (s3Client) return s3Client;
  s3Client = new S3Client({
    region: "auto",
    endpoint: ENDPOINT,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });
  return s3Client;
}

export type StorageObject = {
  key: string;
  size: number;
  lastModified: string;
  category: string;
  filename: string;
};

export type StorageStats = {
  totalSize: number;
  totalCount: number;
  byCategory: Record<string, { count: number; size: number }>;
};

const CATEGORIES = ["brief-reference", "progress", "final", "revision", "logo", "payment-logo"];

function parseKey(key: string): { category: string; filename: string } {
  const parts = key.split("/");
  const category = CATEGORIES.includes(parts[0]) ? parts[0] : "other";
  const filename = parts[parts.length - 1] || key;
  return { category, filename };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export async function listAllObjects(
  maxItems?: number
): Promise<StorageObject[]> {
  const client = getClient();
  const objects: StorageObject[] = [];
  let continuationToken: string | undefined;
  let fetched = 0;

  do {
    const cmd = new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    });
    const res = await client.send(cmd);
    if (!res.Contents) break;

    for (const obj of res.Contents) {
      if (maxItems && fetched >= maxItems) break;
      if (!obj.Key || !obj.Size) continue;
      const { category, filename } = parseKey(obj.Key);
      objects.push({
        key: obj.Key,
        size: obj.Size,
        lastModified: obj.LastModified?.toISOString() ?? "",
        category,
        filename,
      });
      fetched++;
    }

    continuationToken = res.NextContinuationToken;
    if (maxItems && fetched >= maxItems) break;
  } while (continuationToken);

  return objects;
}

// Simple in-memory cache for storage stats (1-minute TTL)
let _statsCache: { data: StorageStats; timestamp: number } | null = null;
const STATS_CACHE_TTL = 60 * 1000; // 1 minute

export async function getStorageStats(): Promise<StorageStats> {
  const now = Date.now();
  if (_statsCache && now - _statsCache.timestamp < STATS_CACHE_TTL) {
    return _statsCache.data;
  }

  const objects = await listAllObjects();

  const stats: StorageStats = {
    totalSize: 0,
    totalCount: objects.length,
    byCategory: {},
  };

  for (const cat of CATEGORIES) {
    stats.byCategory[cat] = { count: 0, size: 0 };
  }
  stats.byCategory["other"] = { count: 0, size: 0 };

  for (const obj of objects) {
    stats.totalSize += obj.size;
    const cat = obj.category;
    if (!stats.byCategory[cat]) {
      stats.byCategory[cat] = { count: 0, size: 0 };
    }
    stats.byCategory[cat].count++;
    stats.byCategory[cat].size += obj.size;
  }

  _statsCache = { data: stats, timestamp: now };
  return stats;
}

export async function deleteObject(key: string): Promise<void> {
  const client = getClient();
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await client.send(cmd);
}

export async function deleteObjects(keys: string[]): Promise<void> {
  // R2 S3 doesn't support DeleteObjects (MultiObjectDelete), delete one by one
  const client = getClient();
  await Promise.all(
    keys.map((key) => client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })))
  );
}

export async function getObjectInfo(key: string): Promise<{ size: number; contentType: string } | null> {
  const client = getClient();
  try {
    const cmd = new HeadObjectCommand({ Bucket: BUCKET, Key: key });
    const res = await client.send(cmd);
    return {
      size: res.ContentLength ?? 0,
      contentType: res.ContentType ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export function formatBytesDisplay(bytes: number): string {
  return formatBytes(bytes);
}

export function getPublicUrl(key: string): string {
  const base = process.env.STORAGE_PUBLIC_URL_BASE;
  if (!base) return key;
  return `${base}/${key}`;
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}
