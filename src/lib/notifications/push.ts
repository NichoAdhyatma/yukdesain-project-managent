import { WebPushError, sendNotification, setVapidDetails } from "web-push";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStudioSettings } from "@/lib/studio";

// Web push ke owner (docs/OWNER_NOTIFICATIONS_INBOX.md §2). Gratis, tanpa kuota pesan WhatsApp.
// Kunci VAPID hanya di env server; kunci publik boleh ke browser untuk berlangganan.

export const NOTIFY_EVENTS = ["NEEDS_QUOTE", "DP_PROOF", "NEW_CLIENT", "NEEDS_ADMIN"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export const NOTIFY_EVENT_LABELS: Record<NotifyEvent, { label: string; description: string }> = {
  NEEDS_QUOTE: { label: "Perlu harga", description: "Brief sudah dikonfirmasi klien; harga, DP, dan deadline perlu diisi." },
  DP_PROOF: { label: "Bukti DP masuk", description: "Klien mengirim bukti transfer yang perlu dicek." },
  NEW_CLIENT: { label: "Klien baru", description: "Nomor baru menghubungi bot untuk pertama kali." },
  NEEDS_ADMIN: { label: "Chat menunggu admin", description: "Klien minta admin, AI gagal, atau batas bot tercapai." },
};

const vapidSchema = z.object({
  VAPID_PUBLIC_KEY: z.string().trim().min(20),
  VAPID_PRIVATE_KEY: z.string().trim().min(20),
  VAPID_SUBJECT: z
    .string()
    .trim()
    .regex(/^(mailto:|https:\/\/)/, "Harus mailto: atau https://"),
});

const readVapid = () => vapidSchema.safeParse(process.env);

export function isPushConfigured(): boolean {
  return readVapid().success;
}

export function getVapidPublicKey(): string | null {
  const v = readVapid();
  return v.success ? v.data.VAPID_PUBLIC_KEY : null;
}

let vapidApplied: string | null = null;
function applyVapid(): boolean {
  const v = readVapid();
  if (!v.success) return false;
  if (vapidApplied !== v.data.VAPID_PUBLIC_KEY) {
    setVapidDetails(v.data.VAPID_SUBJECT, v.data.VAPID_PUBLIC_KEY, v.data.VAPID_PRIVATE_KEY);
    vapidApplied = v.data.VAPID_PUBLIC_KEY;
  }
  return true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** Kejadian yang dimatikan user. `notifyPrefs` null / tidak valid = semua aktif. */
export function disabledEvents(prefs: unknown): Set<NotifyEvent> {
  const parsed = z.object({ disabled: z.array(z.enum(NOTIFY_EVENTS)) }).safeParse(prefs);
  return new Set(parsed.success ? parsed.data.disabled : []);
}

/**
 * Kirim ke semua perangkat milik owner aktif yang tidak mematikan kejadian ini. Tidak pernah melempar error:
 * notifikasi gagal tidak boleh menghentikan alur bot. Langganan yang ditolak layanan push (404/410) dihapus.
 */
export async function notifyOwnersPush(event: NotifyEvent, payload: PushPayload): Promise<number> {
  if (!applyVapid()) return 0;
  try {
    const owners = await prisma.user.findMany({
      where: { isActive: true, roles: { has: "OWNER" }, pushSubscriptions: { some: {} } },
      select: { notifyPrefs: true, pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } } },
    });
    const targets = owners.filter((o) => !disabledEvents(o.notifyPrefs).has(event)).flatMap((o) => o.pushSubscriptions);
    // Dicatat juga saat berhasil, supaya "notifikasi masuk atau tidak" bisa dipastikan dari log server.
    if (targets.length === 0) {
      console.info(`[push] ${event} tidak terkirim: tidak ada perangkat owner yang berlangganan dan mengaktifkan kejadian ini`);
      return 0;
    }
    const body = await encodePayload({ ...payload, tag: payload.tag ?? event });
    const results = await Promise.all(targets.map((sub) => sendOne(sub, body)));
    const sent = results.filter(Boolean).length;
    console.info(`[push] ${event} terkirim ke ${sent}/${targets.length} perangkat`);
    return sent;
  } catch (error) {
    console.error(`[push] gagal mengirim ${event}:`, (error as Error).name);
    return 0;
  }
}

/** Payload untuk service worker (public/sw.js); ikon = logo studio jika ada. */
async function encodePayload(payload: PushPayload): Promise<string> {
  const studio = await getStudioSettings().catch(() => null);
  const icon = studio?.logoUrl?.trim() || "/favicon.ico";
  return JSON.stringify({ ...payload, icon });
}

/** Notifikasi uji ke semua perangkat milik satu user. Return jumlah yang terkirim. */
export async function sendTestPush(userId: string): Promise<number> {
  if (!applyVapid()) return 0;
  const subs = await prisma.webPushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  const body = await encodePayload({ title: "Notifikasi aktif", body: "Perangkat ini akan menerima notifikasi Order WA.", url: "/wa-orders", tag: "test" });
  const results = await Promise.all(subs.map((sub) => sendOne(sub, body)));
  return results.filter(Boolean).length;
}

async function sendOne(sub: { id: string; endpoint: string; p256dh: string; auth: string }, body: string): Promise<boolean> {
  try {
    await sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
      TTL: 24 * 60 * 60,
      urgency: "high",
      timeout: 10_000,
    });
    await prisma.webPushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } });
    return true;
  } catch (error) {
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      await prisma.webPushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
    } else {
      console.error("[push] layanan push menolak:", error instanceof WebPushError ? error.statusCode : (error as Error).name);
    }
    return false;
  }
}
