import { NextResponse } from "next/server";
import { rejectUnauthorizedCron } from "@/lib/cron/auth";
import { flushPendingNotices } from "@/lib/notifications/flush-pending-notices";

// Cron kabar progres tertunda (docs/CLIENT_NOTIFICATIONS.md). Dipanggil systemd timer di VPS setiap 5 menit.

export const maxDuration = 60;

export async function POST(request: Request) {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  const result = await flushPendingNotices(new Date());
  return NextResponse.json({ ok: true, ...result });
}
