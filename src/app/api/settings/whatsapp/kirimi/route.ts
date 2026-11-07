import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { getAppPublicUrl, getKirimiEnv, isKirimiConfigured } from "@/lib/whatsapp/env";
import { KirimiApiError, kirimiDeviceStatus, kirimiInstallWebhook } from "@/lib/whatsapp/kirimi";
import { maskPhone } from "@/lib/whatsapp/phone";

// Perangkat Kirimi di Settings (docs/WHATSAPP_CHANNEL_KIRIMI.md): status perangkat dan pasang webhook.
// Scan QR dilakukan di dashboard Kirimi (keputusan owner). Owner-only; kredensial tidak keluar ke browser.

function kirimiError(error: unknown) {
  if (error instanceof KirimiApiError) {
    return NextResponse.json({ error: "BAD_GATEWAY", message: `Kirimi: ${error.reason ?? `HTTP ${error.status}`}` }, { status: 502 });
  }
  throw error;
}

async function status() {
  const [device, settings] = await Promise.all([
    kirimiDeviceStatus(),
    prisma.studioSettings.findUnique({ where: { id: "default" }, select: { waKirimiWebhookId: true } }),
  ]);
  return {
    configured: true,
    deviceId: device.deviceId,
    name: device.name,
    connected: device.connected,
    numberMasked: device.waNumber ? maskPhone(device.waNumber.replace(/\D/g, "")) : null,
    packageName: device.packageName,
    expiresAt: device.expiresAt,
    expired: device.expired,
    aiEnabled: device.aiEnabled,
    webhookInstalled: !!settings?.waKirimiWebhookId,
  };
}

export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  if (!isKirimiConfigured()) return NextResponse.json({ configured: false });
  try {
    return NextResponse.json(await status());
  } catch (error) {
    return kirimiError(error);
  }
}

const actionSchema = z.object({ action: z.literal("install-webhook") });

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Aksi tidak dikenal" }, { status: 400 });
  if (!isKirimiConfigured()) {
    return NextResponse.json(
      { error: "UNPROCESSABLE_ENTITY", message: "Kredensial Kirimi atau KIRIMI_WEBHOOK_SECRET belum diisi di server" },
      { status: 422 },
    );
  }
  try {
    const device = await kirimiDeviceStatus();
    if (!device.connected) {
      return NextResponse.json(
        { error: "UNPROCESSABLE_ENTITY", message: "Perangkat Kirimi belum terhubung. Scan QR di dashboard Kirimi dulu." },
        { status: 422 },
      );
    }
    const base = getAppPublicUrl() ?? request.headers.get("origin") ?? new URL(request.url).origin;
    const webhookUrl = `${base.replace(/\/+$/, "")}/api/whatsapp/kirimi/${getKirimiEnv().KIRIMI_WEBHOOK_SECRET}`;
    const sub = await kirimiInstallWebhook(webhookUrl);
    await prisma.studioSettings.upsert({
      where: { id: "default" },
      update: { waKirimiWebhookId: sub.id, waKirimiWebhookSecret: sub.secret },
      create: { id: "default", waKirimiWebhookId: sub.id, waKirimiWebhookSecret: sub.secret },
    });
    await prisma.activityLog.create({
      data: {
        entityType: "StudioSettings",
        entityId: "default",
        action: "WA_KIRIMI_WEBHOOK_INSTALLED",
        actorId: auth.user.id,
        newValue: { device: device.deviceId, host: new URL(base).host },
      },
    });
    return NextResponse.json(await status());
  } catch (error) {
    return kirimiError(error);
  }
}
