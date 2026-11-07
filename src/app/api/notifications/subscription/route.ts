import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";

// Langganan web push perangkat ini (docs/OWNER_NOTIFICATIONS_INBOX.md §2). Owner-only.

const endpointSchema = z
  .string()
  .url()
  .max(2000)
  .refine((u) => u.startsWith("https://"), "Endpoint harus https");

const subscribeSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Langganan tidak valid" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
  // Endpoint unik per browser: dipasang ulang di akun lain → pindah ke user yang sekarang login.
  await prisma.webPushSubscription.upsert({
    where: { endpoint },
    create: { userId: auth.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId: auth.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const parsed = z.object({ endpoint: endpointSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Endpoint tidak valid" }, { status: 400 });
  await prisma.webPushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: auth.user.id } });
  return NextResponse.json({ ok: true });
}
