import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { NOTIFY_EVENTS, NOTIFY_EVENT_LABELS, disabledEvents, getVapidPublicKey, isPushConfigured } from "@/lib/notifications/push";

// Pengaturan notifikasi web push untuk user yang login (docs/OWNER_NOTIFICATIONS_INBOX.md §2). Owner-only.

async function dto(userId: string) {
  const [user, devices] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { notifyPrefs: true } }),
    prisma.webPushSubscription.count({ where: { userId } }),
  ]);
  const disabled = disabledEvents(user.notifyPrefs);
  return {
    configured: isPushConfigured(),
    publicKey: getVapidPublicKey(),
    devices,
    events: NOTIFY_EVENTS.map((id) => ({ id, ...NOTIFY_EVENT_LABELS[id], enabled: !disabled.has(id) })),
  };
}

export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  return NextResponse.json(await dto(auth.user.id));
}

const prefsSchema = z.object({ disabled: z.array(z.enum(NOTIFY_EVENTS)).max(NOTIFY_EVENTS.length) });

export async function PUT(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const parsed = prefsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Pengaturan tidak valid" }, { status: 400 });
  await prisma.user.update({
    where: { id: auth.user.id },
    data: { notifyPrefs: { disabled: [...new Set(parsed.data.disabled)] } },
  });
  return NextResponse.json(await dto(auth.user.id));
}
