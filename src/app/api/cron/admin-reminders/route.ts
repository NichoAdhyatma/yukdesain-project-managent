import { NextResponse } from "next/server";
import { rejectUnauthorizedCron } from "@/lib/cron/auth";
import { sendWaitingReminders } from "@/lib/notifications/waiting-reminders";

// Pengingat "menunggu admin" lewat web push (docs/OWNER_NOTIFICATIONS_INBOX.md §2a). Dipanggil systemd timer di VPS
// setiap 5 menit.

export const maxDuration = 60;

export async function POST(request: Request) {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;
  const result = await sendWaitingReminders(new Date());
  return NextResponse.json({ ok: true, ...result });
}
