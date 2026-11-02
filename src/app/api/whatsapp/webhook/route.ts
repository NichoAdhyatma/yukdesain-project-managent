import { NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { getWhatsAppEnv, type WhatsAppEnv } from "@/lib/whatsapp/env";
import { verifySignature } from "@/lib/whatsapp/signature";
import { parseWebhook } from "@/lib/whatsapp/payload";
import { applyStatusUpdate, storeInboundMessage } from "@/lib/whatsapp/inbound";
import { handleInboundMessage } from "@/lib/whatsapp/bot";
import { maskPhone } from "@/lib/whatsapp/phone";

// Unduh media + panggilan Claude di after() bisa lebih dari 10 detik (§6).
export const maxDuration = 60;

function loadEnv(): WhatsAppEnv | null {
  try {
    return getWhatsAppEnv();
  } catch (error) {
    console.error("[whatsapp] webhook dinonaktifkan:", (error as Error).message);
    return null;
  }
}

// Verifikasi endpoint oleh Meta saat webhook didaftarkan.
export async function GET(request: Request) {
  const env = loadEnv();
  if (!env) return new Response("Not configured", { status: 503 });

  const params = new URL(request.url).searchParams;
  const challenge = params.get("hub.challenge");
  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN &&
    challenge
  ) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const env = loadEnv();
  if (!env) return new Response("Not configured", { status: 503 });

  // Signature dihitung dari body mentah — baca sebagai teks sebelum JSON.parse.
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), env.WHATSAPP_APP_SECRET)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = parseWebhook(json, env.WHATSAPP_PHONE_NUMBER_ID);
  if (!parsed) {
    // Payload bertanda tangan valid tapi bukan bentuk yang kita kenal. Balas 200
    // supaya Meta tidak mengirim ulang terus-menerus.
    console.warn("[whatsapp] payload webhook tidak dikenali, diabaikan");
    return NextResponse.json({ ok: true });
  }

  const stored: { id: string; waId: string }[] = [];
  try {
    for (const status of parsed.statuses) {
      await applyStatusUpdate(status);
    }
    for (const message of parsed.messages) {
      const id = await storeInboundMessage(message);
      if (id) stored.push({ id, waId: message.waId });
    }
  } catch (error) {
    // 500 → Meta mengirim ulang; pesan yang sudah tersimpan akan terlewati via wamid unik.
    // Jangan log error.message: pesan Prisma bisa memuat isi chat klien (§16).
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : (error as Error).name;
    console.error("[whatsapp] gagal menyimpan webhook:", code);
    return new Response("Error", { status: 500 });
  }

  // Diproses setelah 200 terkirim: Meta mengharapkan balasan cepat.
  // Pesan duplikat (wamid sudah ada) tidak diproses ulang.
  if (stored.length) {
    after(async () => {
      for (const { id, waId } of stored) {
        try {
          await handleInboundMessage(id);
        } catch (error) {
          console.error(`[whatsapp] gagal memproses pesan dari ${maskPhone(waId)}:`, (error as Error).name);
        }
      }
    });
  }

  return NextResponse.json({ ok: true });
}
