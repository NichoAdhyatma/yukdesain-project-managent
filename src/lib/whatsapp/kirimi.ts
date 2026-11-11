import { randomUUID } from "node:crypto";
import { getKirimiEnv } from "./env";

// Klien tipis untuk Kirimi (https://kirimi.id/docs, salinan referensi 2026-11-07 di docs/WHATSAPP_CHANNEL_KIRIMI.md).
// Semua endpoint POST JSON; user_code + secret ikut di body. Selalu periksa `success`, bukan hanya status HTTP.

const BASE_URL = "https://api.kirimi.id";
const TIMEOUT_MS = 15_000;

export class KirimiApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(`Kirimi API error ${status}${reason ? ` (${reason})` : ""}`);
    this.name = "KirimiApiError";
  }
}

type Envelope<T> = { success?: boolean; data?: T; message?: string };

async function kirimiFetch<T>(path: string, fields: Record<string, unknown> = {}): Promise<T> {
  const env = getKirimiEnv();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_code: env.KIRIMI_USER_CODE, secret: env.KIRIMI_SECRET, ...fields }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success !== true) {
    throw new KirimiApiError(res.status, typeof json?.message === "string" ? json.message.slice(0, 200) : null);
  }
  return json.data as T;
}

/** Kirim teks lewat perangkat QR. Return id pesan dengan awalan "kirimi:" (tidak bentrok dengan wamid Meta). */
export async function kirimiSendText(to: string, message: string): Promise<string> {
  const env = getKirimiEnv();
  // clientMsgId: retry dari sisi kita tidak mengirim pesan dobel (diingat Kirimi 24 jam per perangkat).
  const clientMsgId = `yd-${randomUUID()}`;
  const data = await kirimiFetch<{ message_id?: string; id?: string } | null>("/v1/send-message", {
    device_id: env.KIRIMI_DEVICE_ID,
    receiver: to,
    message,
    enableTypingEffect: false,
    clientMsgId,
  });
  return `kirimi:${data?.message_id ?? data?.id ?? clientMsgId}`;
}

/** Kirim gambar dari URL publik (paket Pro): `send-message` dengan `media_url`, caption sebagai `message`. */
export async function kirimiSendImage(to: string, imageUrl: string, caption: string): Promise<string> {
  const env = getKirimiEnv();
  const clientMsgId = `yd-${randomUUID()}`;
  const data = await kirimiFetch<{ message_id?: string; id?: string } | null>("/v1/send-message", {
    device_id: env.KIRIMI_DEVICE_ID,
    receiver: to,
    message: caption,
    media_url: imageUrl,
    enableTypingEffect: false,
    clientMsgId,
  });
  return `kirimi:${data?.message_id ?? data?.id ?? clientMsgId}`;
}

export type KirimiDevice = {
  deviceId: string;
  name: string | null;
  connected: boolean;
  status: string | null;
  waNumber: string | null;
  packageName: string | null;
  expiresAt: string | null;
  expired: boolean;
  aiEnabled: boolean;
  /** Webhook URL yang dipasang di dashboard Kirimi (jalur pesan masuk yang dipakai Kirimi). */
  webhookUrl: string | null;
};

type DeviceStatusData = {
  device_id?: string;
  device_name?: string;
  status?: string;
  is_connected?: boolean;
  wa_number?: string | null;
  package?: { nama?: string } | null;
  expired_at?: number | null;
  is_expired?: boolean;
  ai_enabled?: boolean;
  webhook_url?: string | null;
};

export async function kirimiDeviceStatus(): Promise<KirimiDevice> {
  const env = getKirimiEnv();
  const d = await kirimiFetch<DeviceStatusData>("/v1/device-status", { device_id: env.KIRIMI_DEVICE_ID });
  return {
    deviceId: d.device_id ?? env.KIRIMI_DEVICE_ID,
    name: d.device_name ?? null,
    connected: d.is_connected === true || d.status === "connected",
    status: d.status ?? null,
    waNumber: d.wa_number ?? null,
    packageName: d.package?.nama ?? null,
    expiresAt: typeof d.expired_at === "number" ? new Date(d.expired_at * 1000).toISOString() : null,
    expired: d.is_expired === true,
    aiEnabled: d.ai_enabled === true,
    webhookUrl: d.webhook_url ?? null,
  };
}

/**
 * Langganan webhook lewat API (`/v1/webhook/subscribe`) tidak dipakai Kirimi untuk pesan masuk (temuan 2026-11-07,
 * docs/WHATSAPP_CHANNEL_KIRIMI.md §8). Dipakai sekali untuk menghapus langganan lama perangkat ini.
 */
export async function kirimiRemoveApiSubscriptions(): Promise<number> {
  const env = getKirimiEnv();
  const existing = await kirimiFetch<{ items?: { id: string; device_id?: string | null }[] }>("/v1/webhook/list");
  let removed = 0;
  for (const sub of existing.items ?? []) {
    if (sub.device_id !== env.KIRIMI_DEVICE_ID) continue;
    await kirimiFetch("/v1/webhook/unsubscribe", { id: sub.id });
    removed++;
  }
  return removed;
}
