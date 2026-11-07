import { NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { getKirimiEnv } from "@/lib/whatsapp/env";
import { getChannel } from "@/lib/whatsapp/channel";
import { describeKirimiPayload, kirimiSignatureValid, parseKirimiPayload, type KirimiPayload } from "@/lib/whatsapp/kirimi-webhook";
import { storeInboundMessage } from "@/lib/whatsapp/inbound";
import { handleInboundMessage } from "@/lib/whatsapp/bot";
import { expireOwnerQueries } from "@/lib/whatsapp/owner/queries";
import { waitForBurst } from "@/lib/whatsapp/spam-guard";
import { maskPhone } from "@/lib/whatsapp/phone";
import { ECHO_SETTLE_MS, handleKirimiEcho, rememberConversationLid } from "@/lib/whatsapp/phone-takeover";

// Webhook pesan masuk Kirimi (docs/WHATSAPP_CHANNEL_KIRIMI.md). URL memuat KIRIMI_WEBHOOK_SECRET; device_id
// dicocokkan dengan KIRIMI_DEVICE_ID; X-Kirimi-Signature wajib bila KIRIMI_SIGNING_SECRET tersimpan. Pantulan pesan
// keluar (isFromMe) dipakai untuk mengenali admin yang membalas dari HP (docs/WHATSAPP_CHANNEL_KIRIMI.md §10).

export const maxDuration = 60;

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Cocokkan signature dengan beberapa bentuk HMAC-SHA256 yang umum; untuk log saat signing secret belum disimpan. */
function signatureCheck(raw: string, signature: string | null, timestamp: string | null, secret: string | null): string {
  if (!signature) return "tanpa signature";
  if (!secret) return "secret langganan belum tersimpan";
  const sig = signature.replace(/^sha256=/i, "").trim();
  const candidates: [string, string][] = [
    ["hex(body)", createHmac("sha256", secret).update(raw).digest("hex")],
    ["base64(body)", createHmac("sha256", secret).update(raw).digest("base64")],
    ...(timestamp
      ? ([
          ["hex(ts.body)", createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")],
          ["hex(ts+body)", createHmac("sha256", secret).update(`${timestamp}${raw}`).digest("hex")],
        ] as [string, string][])
      : []),
  ];
  const hit = candidates.find(([, v]) => v.length === sig.length && timingSafeEqual(Buffer.from(v), Buffer.from(sig)));
  return hit ? `cocok ${hit[0]}` : "tidak cocok";
}

type Params = { params: Promise<{ secret: string }> };

/** Tes URL dari dashboard Kirimi (bila memakai GET): cukup cek secret. */
export async function GET(_request: Request, { params }: Params) {
  let expected: string;
  try {
    expected = getKirimiEnv().KIRIMI_WEBHOOK_SECRET;
  } catch {
    return new Response("Not configured", { status: 503 });
  }
  const { secret } = await params;
  if (!secretMatches(secret, expected)) return new Response("Not found", { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: Params) {
  let env: ReturnType<typeof getKirimiEnv>;
  try {
    env = getKirimiEnv();
  } catch {
    return new Response("Not configured", { status: 503 });
  }
  const { secret } = await params;
  if (!secretMatches(secret, env.KIRIMI_WEBHOOK_SECRET)) return new Response("Not found", { status: 404 });

  const raw = await request.text();
  let body: KirimiPayload | null = null;
  try {
    const parsedJson = JSON.parse(raw) as unknown;
    body = parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson) ? (parsedJson as KirimiPayload) : null;
  } catch {
    body = null;
  }
  if (!body) {
    // Tes URL dari dashboard Kirimi bisa tanpa body JSON; dijawab 200 supaya URL bisa disimpan.
    console.info(`[kirimi] webhook tanpa body JSON (content-type: ${request.headers.get("content-type") ?? "-"}, ${raw.length} byte)`);
    return NextResponse.json({ ok: true, ignored: "no_body" });
  }

  const eventHeader = request.headers.get("x-kirimi-event");
  const sigHeader = request.headers.get("x-kirimi-signature");
  const tsHeader = request.headers.get("x-kirimi-timestamp");
  const signingSecret = process.env.KIRIMI_SIGNING_SECRET?.trim() || null;

  // Tes URL dari dashboard dikirim tanpa signature dan tidak pernah diproses sebagai pesan.
  if (body.event === "webhook.test" || body.test === true) {
    console.info(`[kirimi] tes URL dari dashboard diterima`);
    return NextResponse.json({ ok: true, ignored: "test" });
  }

  let signature: string;
  if (signingSecret) {
    // Signing secret tersimpan → signature wajib cocok (docs/WHATSAPP_CHANNEL_KIRIMI.md §8).
    if (!kirimiSignatureValid(raw, sigHeader, tsHeader, signingSecret)) {
      console.warn(`[kirimi] webhook ditolak: signature ${sigHeader ? "tidak cocok" : "tidak ada"} (event=${body.event ?? eventHeader ?? "-"})`);
      return new Response("Invalid signature", { status: 401 });
    }
    signature = "valid";
  } else {
    const settings = await prisma.studioSettings.findUnique({ where: { id: "default" }, select: { waKirimiWebhookSecret: true } });
    signature = signatureCheck(raw, sigHeader, tsHeader, settings?.waKirimiWebhookSecret ?? null);
  }
  // Bentuk data (tanpa isi pesan / nomor) untuk memantau format Kirimi.
  console.info(`[kirimi] webhook ${describeKirimiPayload(body, eventHeader)} signature=${signature}`);

  // Saluran lain aktif → pesan Kirimi tidak dibalas (balasan akan lewat saluran yang salah).
  if ((await getChannel()) !== "KIRIMI") return NextResponse.json({ ok: true, ignored: "channel" });

  const parsed = parseKirimiPayload(body, eventHeader);
  if (parsed.kind === "ignored") return NextResponse.json({ ok: true, ignored: parsed.reason });
  if (parsed.device && parsed.device !== env.KIRIMI_DEVICE_ID) {
    console.warn("[kirimi] pesan diabaikan: device_id berbeda");
    return NextResponse.json({ ok: true, ignored: "device" });
  }

  if (parsed.kind === "echo") {
    const echo = parsed;
    const receivedAt = new Date();
    after(async () => {
      // Tunggu pesan bot/portal tersimpan dulu, baru dicocokkan dengan pantulannya.
      await new Promise((resolve) => setTimeout(resolve, ECHO_SETTLE_MS));
      try {
        const outcome = await handleKirimiEcho(echo, receivedAt);
        if (outcome !== "own" && outcome !== "duplicate") {
          console.info(`[kirimi] pesan keluar dari HP ke ${maskPhone(echo.to.waId ?? "")}: ${outcome}`);
        }
      } catch (error) {
        console.error("[kirimi] gagal memproses pesan keluar dari HP:", (error as Error).name);
      }
    });
    return NextResponse.json({ ok: true, echo: true });
  }

  let id: string | null;
  try {
    id = await storeInboundMessage(parsed.message);
    if (parsed.lid) await rememberConversationLid(parsed.message.waId, parsed.lid);
  } catch (error) {
    console.error("[kirimi] gagal menyimpan pesan masuk:", (error as Error).name);
    return new Response("Error", { status: 500 });
  }

  if (id) {
    const messageId = id;
    after(async () => {
      await expireOwnerQueries().catch(() => undefined);
      // Tunggu pesan susulan: pesan beruntun dibalas sekali (docs/WHATSAPP_SPAM_GUARD.md §2).
      await waitForBurst();
      try {
        await handleInboundMessage(messageId);
      } catch (error) {
        console.error(`[kirimi] gagal memproses pesan dari ${maskPhone(parsed.message.waId)}:`, (error as Error).name);
      }
    });
  }
  return NextResponse.json({ ok: true });
}
