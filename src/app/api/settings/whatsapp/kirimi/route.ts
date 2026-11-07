import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { getAppPublicUrl, getKirimiEnv, isKirimiConfigured } from "@/lib/whatsapp/env";
import { KirimiApiError, kirimiDeviceStatus } from "@/lib/whatsapp/kirimi";
import { maskPhone } from "@/lib/whatsapp/phone";

// Perangkat Kirimi di Settings (docs/WHATSAPP_CHANNEL_KIRIMI.md): status perangkat dan Webhook URL untuk dashboard.
// Scan QR dan Tambah URL dilakukan di dashboard Kirimi. Owner-only; kredensial tidak keluar ke browser.

function kirimiError(error: unknown) {
  if (error instanceof KirimiApiError) {
    return NextResponse.json({ error: "BAD_GATEWAY", message: `Kirimi: ${error.reason ?? `HTTP ${error.status}`}` }, { status: 502 });
  }
  throw error;
}

/** URL webhook lengkap (memuat rahasia) untuk "Tambah URL" di dashboard Kirimi. Hanya untuk owner. */
function webhookUrlFor(request: Request): string {
  const base = getAppPublicUrl() ?? request.headers.get("origin") ?? new URL(request.url).origin;
  return `${base.replace(/\/+$/, "")}/api/whatsapp/kirimi/${getKirimiEnv().KIRIMI_WEBHOOK_SECRET}`;
}

async function status(request: Request) {
  const device = await kirimiDeviceStatus();
  const webhookUrl = webhookUrlFor(request);
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
    // Terpasang = Webhook URL di dashboard Kirimi mengarah ke portal ini.
    webhookInstalled: device.webhookUrl === webhookUrl,
    webhookElsewhere: !!device.webhookUrl && device.webhookUrl !== webhookUrl,
    webhookUrl,
    signingSecretSet: !!process.env.KIRIMI_SIGNING_SECRET?.trim(),
  };
}

export async function GET(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  if (!isKirimiConfigured()) return NextResponse.json({ configured: false });
  try {
    return NextResponse.json(await status(request));
  } catch (error) {
    return kirimiError(error);
  }
}
