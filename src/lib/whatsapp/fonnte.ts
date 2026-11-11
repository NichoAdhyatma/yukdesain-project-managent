import { getFonnteEnv } from "./env";

// Klien tipis untuk Fonnte (https://docs.fonnte.com), gateway WhatsApp tidak resmi untuk testing
// (docs/WHATSAPP_CHANNEL_FONNTE.md). Semua endpoint POST form dengan header Authorization = token device.

const BASE_URL = "https://api.fonnte.com";
const TIMEOUT_MS = 15_000;

export class FonnteApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string | null,
  ) {
    super(`Fonnte API error ${status}${reason ? ` (${reason})` : ""}`);
    this.name = "FonnteApiError";
  }
}

type FonnteResponse = { status?: boolean; reason?: string; detail?: string } & Record<string, unknown>;

async function fonnteFetch(path: string, fields: Record<string, string> = {}): Promise<FonnteResponse> {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: getFonnteEnv().FONNTE_DEVICE_TOKEN },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as FonnteResponse | null;
  if (!res.ok || !json) throw new FonnteApiError(res.status, null);
  return json;
}

const reasonOf = (json: FonnteResponse) => (typeof json.reason === "string" ? json.reason : typeof json.detail === "string" ? json.detail : null);

/** Kirim teks. Return id pesan Fonnte (diawali "fonnte:" supaya tidak bentrok dengan wamid Meta). */
export async function fonnteSendText(to: string, message: string): Promise<string> {
  const json = await fonnteFetch("/send", { target: to, message });
  if (json.status !== true) throw new FonnteApiError(200, reasonOf(json));
  const id = Array.isArray(json.id) ? json.id[0] : json.id;
  return `fonnte:${id ?? `${Date.now()}`}`;
}

/** Kirim gambar dari URL publik: `url` + caption sebagai `message`. */
export async function fonnteSendImage(to: string, imageUrl: string, caption: string): Promise<string> {
  const json = await fonnteFetch("/send", { target: to, message: caption, url: imageUrl });
  if (json.status !== true) throw new FonnteApiError(200, reasonOf(json));
  const id = Array.isArray(json.id) ? json.id[0] : json.id;
  return `fonnte:${id ?? `${Date.now()}`}`;
}

export type FonnteDevice = {
  device: string | null;
  name: string | null;
  connected: boolean;
  package: string | null;
  quota: string | null;
  expired: string | null;
};

const str = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));

export async function fonnteGetDevice(): Promise<FonnteDevice> {
  const json = await fonnteFetch("/device");
  if (json.status !== true) throw new FonnteApiError(200, reasonOf(json));
  return {
    device: str(json.device),
    name: str(json.name),
    connected: json.device_status === "connect",
    package: str(json.package),
    quota: str(json.quota),
    expired: str(json.expired),
  };
}

/** QR untuk menghubungkan nomor. `alreadyConnected` jika perangkat sudah tersambung. */
export async function fonnteGetQr(): Promise<{ qrPngBase64: string | null; alreadyConnected: boolean }> {
  const json = await fonnteFetch("/qr", { type: "qr" });
  if (json.status === true && typeof json.url === "string") return { qrPngBase64: json.url, alreadyConnected: false };
  const reason = reasonOf(json);
  if (reason && /already connect/i.test(reason)) return { qrPngBase64: null, alreadyConnected: true };
  throw new FonnteApiError(200, reason);
}

export async function fonnteDisconnect(): Promise<void> {
  const json = await fonnteFetch("/disconnect");
  const reason = reasonOf(json);
  if (json.status !== true && !(reason && /already disconnect/i.test(reason))) throw new FonnteApiError(200, reason);
}

/** Pasang URL webhook pesan masuk. Autoread aktif supaya pesan klien tertandai dibaca. */
export async function fonnteSetWebhook(p: { name: string; device: string; webhookUrl: string }): Promise<void> {
  const json = await fonnteFetch("/update-device", {
    name: p.name,
    device: p.device,
    webhook: p.webhookUrl,
    autoread: "true",
    personal: "true",
    group: "false",
  });
  if (json.status !== true) throw new FonnteApiError(200, reasonOf(json));
}
