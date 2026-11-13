import { timingSafeEqual } from "node:crypto";

/**
 * Cron di VPS (systemd timer) memanggil route /api/cron/* dengan Authorization: Bearer <CRON_SECRET>.
 * Null = boleh lanjut; selain itu respons penolakan. Route cron tidak memakai sesi login (ada di PUBLIC_PATHS).
 */
export function rejectUnauthorizedCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return new Response("Not configured", { status: 503 });
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });
  return null;
}
