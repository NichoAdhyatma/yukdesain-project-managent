import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOwner } from "@/lib/auth/require-owner";
import { getAppPublicUrl, getFonnteEnv, isFonnteConfigured } from "@/lib/whatsapp/env";
import { FonnteApiError, fonnteDisconnect, fonnteGetDevice, fonnteGetQr, fonnteSetWebhook } from "@/lib/whatsapp/fonnte";
import { maskPhone } from "@/lib/whatsapp/phone";

// Kelola perangkat Fonnte dari Settings (docs/WHATSAPP_CHANNEL_FONNTE.md §2): status, QR untuk
// menghubungkan nomor, putuskan nomor, pasang webhook. Owner-only; token & secret tidak keluar ke browser.

function notConfigured() {
  return NextResponse.json(
    { error: "UNPROCESSABLE_ENTITY", message: "FONNTE_DEVICE_TOKEN atau FONNTE_WEBHOOK_SECRET belum diisi di server" },
    { status: 422 },
  );
}

function fonnteError(error: unknown) {
  if (error instanceof FonnteApiError) {
    return NextResponse.json({ error: "BAD_GATEWAY", message: `Fonnte: ${error.reason ?? `HTTP ${error.status}`}` }, { status: 502 });
  }
  throw error;
}

async function status() {
  const [device, settings] = await Promise.all([
    fonnteGetDevice(),
    prisma.studioSettings.findUnique({ where: { id: "default" }, select: { waFonnteDevice: true } }),
  ]);
  return {
    configured: true,
    connected: device.connected,
    device: device.device,
    deviceMasked: device.device ? maskPhone(device.device) : null,
    name: device.name,
    package: device.package,
    quota: device.quota,
    expired: device.expired,
    webhookInstalled: !!settings?.waFonnteDevice && settings.waFonnteDevice === device.device,
  };
}

export async function GET() {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  if (!isFonnteConfigured()) return NextResponse.json({ configured: false });
  try {
    return NextResponse.json(await status());
  } catch (error) {
    return fonnteError(error);
  }
}

const actionSchema = z.object({ action: z.enum(["qr", "disconnect", "install-webhook"]) });

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.error) return auth.error;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", message: "Aksi tidak dikenal" }, { status: 400 });
  if (!isFonnteConfigured()) return notConfigured();

  try {
    if (parsed.data.action === "qr") {
      const qr = await fonnteGetQr();
      return NextResponse.json(qr);
    }

    if (parsed.data.action === "disconnect") {
      await fonnteDisconnect();
      await prisma.activityLog.create({
        data: { entityType: "StudioSettings", entityId: "default", action: "WA_FONNTE_DISCONNECTED", actorId: auth.user.id },
      });
      return NextResponse.json(await status());
    }

    // install-webhook: URL publik portal + secret. Hanya bisa setelah nomor terhubung (perlu nomor perangkat).
    const device = await fonnteGetDevice();
    if (!device.connected || !device.device) {
      return NextResponse.json(
        { error: "UNPROCESSABLE_ENTITY", message: "Hubungkan nomor dulu (scan QR), lalu pasang webhook." },
        { status: 422 },
      );
    }
    const base = getAppPublicUrl() ?? request.headers.get("origin") ?? new URL(request.url).origin;
    const webhookUrl = `${base.replace(/\/+$/, "")}/api/whatsapp/fonnte/${getFonnteEnv().FONNTE_WEBHOOK_SECRET}`;
    const name = (device.name ?? "").trim();
    await fonnteSetWebhook({ name: name.length >= 2 ? name.slice(0, 30) : "YukDesain Bot", device: device.device, webhookUrl });
    await prisma.studioSettings.upsert({
      where: { id: "default" },
      update: { waFonnteDevice: device.device },
      create: { id: "default", waFonnteDevice: device.device },
    });
    await prisma.activityLog.create({
      data: {
        entityType: "StudioSettings",
        entityId: "default",
        action: "WA_FONNTE_WEBHOOK_INSTALLED",
        actorId: auth.user.id,
        newValue: { device: maskPhone(device.device), host: new URL(base).host },
      },
    });
    return NextResponse.json(await status());
  } catch (error) {
    return fonnteError(error);
  }
}
