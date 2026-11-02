import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";

/**
 * Verifikasi header X-Hub-Signature-256 dari Meta: HMAC-SHA256 body mentah
 * dengan app secret, format "sha256=<hex>".
 */
export function verifySignature(
  rawBody: string,
  header: string | null | undefined,
  appSecret: string,
): boolean {
  if (!header?.startsWith(PREFIX)) return false;
  const received = header.slice(PREFIX.length);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return timingSafeEqual(expected, Buffer.from(received, "hex"));
}

export function signBody(rawBody: string, appSecret: string): string {
  return PREFIX + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
}
