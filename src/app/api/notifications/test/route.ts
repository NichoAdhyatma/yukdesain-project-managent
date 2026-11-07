import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { isPushConfigured, sendTestPush } from "@/lib/notifications/push";

// Kirim notifikasi uji ke perangkat milik user yang login. Owner-only.
export async function POST() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  if (!isPushConfigured()) {
    return NextResponse.json({ error: "NOT_CONFIGURED", message: "Kunci VAPID belum diisi di server" }, { status: 503 });
  }
  const sent = await sendTestPush(auth.user.id);
  return NextResponse.json({ sent });
}
