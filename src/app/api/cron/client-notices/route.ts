import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { flushPendingNotices } from "@/lib/notifications/flush-pending-notices";

// Cron kabar progres tertunda (docs/CLIENT_NOTIFICATIONS.md). Dipanggil systemd timer di VPS setiap 5 menit dengan
// Authorization: Bearer <CRON_SECRET>. Tidak memakai sesi login (ada di PUBLIC_PATHS).

export const maxDuration = 60;

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return new Response("Not configured", { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return new Response("Unauthorized", { status: 401 });
  const result = await flushPendingNotices(new Date());
  return NextResponse.json({ ok: true, ...result });
}
