import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { getFonnteEnv } from "@/lib/whatsapp/env";
import { getChannel } from "@/lib/whatsapp/channel";
import { parseFonntePayload, type FonntePayload } from "@/lib/whatsapp/fonnte-webhook";
import { storeInboundMessage } from "@/lib/whatsapp/inbound";
import { handleInboundMessage } from "@/lib/whatsapp/bot";
import { expireOwnerQueries } from "@/lib/whatsapp/owner/queries";
import { maskPhone } from "@/lib/whatsapp/phone";

// Webhook pesan masuk Fonnte (docs/WHATSAPP_CHANNEL_FONNTE.md). Fonnte tidak menandatangani webhook,
// jadi URL memuat FONNTE_WEBHOOK_SECRET dan nomor perangkat dicocokkan dengan yang dipasang dari portal.

export const maxDuration = 60;

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(request: Request): Promise<FonntePayload | null> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) return (await request.json()) as FonntePayload;
    if (type.includes("form")) return Object.fromEntries((await request.formData()).entries()) as FonntePayload;
    const raw = await request.text();
    return raw ? (JSON.parse(raw) as FonntePayload) : null;
  } catch {
    return null;
  }
}

type Params = { params: Promise<{ secret: string }> };

export async function POST(request: Request, { params }: Params) {
  let expected: string;
  try {
    expected = getFonnteEnv().FONNTE_WEBHOOK_SECRET;
  } catch {
    return new Response("Not configured", { status: 503 });
  }
  const { secret } = await params;
  if (!secretMatches(secret, expected)) return new Response("Not found", { status: 404 });

  // Saluran Meta aktif → pesan Fonnte tidak dibalas (balasan akan lewat saluran yang salah).
  if ((await getChannel()) !== "FONNTE") return NextResponse.json({ ok: true, ignored: "channel" });

  const body = await readBody(request);
  if (!body) return new Response("Invalid body", { status: 400 });

  const parsed = parseFonntePayload(body);
  if (parsed.kind === "ignored") return NextResponse.json({ ok: true, ignored: parsed.reason });

  const settings = await prisma.studioSettings.findUnique({ where: { id: "default" }, select: { waFonnteDevice: true } });
  if (settings?.waFonnteDevice && parsed.device && parsed.device !== settings.waFonnteDevice) {
    return NextResponse.json({ ok: true, ignored: "device" });
  }

  let id: string | null;
  try {
    id = await storeInboundMessage(parsed.message);
  } catch (error) {
    console.error("[fonnte] gagal menyimpan pesan masuk:", (error as Error).name);
    return new Response("Error", { status: 500 });
  }

  if (id) {
    const messageId = id;
    after(async () => {
      await expireOwnerQueries().catch(() => undefined);
      try {
        await handleInboundMessage(messageId);
      } catch (error) {
        console.error(`[fonnte] gagal memproses pesan dari ${maskPhone(parsed.message.waId)}:`, (error as Error).name);
      }
    });
  }
  return NextResponse.json({ ok: true });
}
