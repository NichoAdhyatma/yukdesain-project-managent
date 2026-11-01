import { getWhatsAppEnv, type WhatsAppEnv } from "./env";

// Klien tipis untuk WhatsApp Cloud API (Graph). Tidak ada retry otomatis:
// pemanggil yang memutuskan (webhook dikirim ulang Meta, pesan admin bisa "Kirim ulang").

const TIMEOUT_MS = 15_000;

type GraphEnv = Pick<
  WhatsAppEnv,
  "WHATSAPP_ACCESS_TOKEN" | "WHATSAPP_PHONE_NUMBER_ID" | "WHATSAPP_GRAPH_VERSION" | "WHATSAPP_GRAPH_BASE_URL"
>;

export class WhatsAppApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`WhatsApp API error ${status}${code ? ` (code ${code})` : ""}`);
    this.name = "WhatsAppApiError";
  }
}

async function graphFetch(path: string, init: RequestInit = {}, env: GraphEnv = getWhatsAppEnv()) {
  const url = `${env.WHATSAPP_GRAPH_BASE_URL}/${env.WHATSAPP_GRAPH_VERSION}/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    // Body error Meta tidak di-log/diteruskan: bisa memuat nomor tujuan.
    const body = (await res.json().catch(() => null)) as { error?: { code?: number } } | null;
    const code = body?.error?.code;
    throw new WhatsAppApiError(res.status, code === undefined ? null : String(code));
  }
  return res;
}

async function sendMessage(payload: Record<string, unknown>, env?: GraphEnv): Promise<string> {
  const e = env ?? getWhatsAppEnv();
  const res = await graphFetch(
    `${e.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
    },
    e,
  );
  const json = (await res.json()) as { messages?: { id?: string }[] };
  const wamid = json.messages?.[0]?.id;
  if (!wamid) throw new WhatsAppApiError(res.status, "NO_MESSAGE_ID");
  return wamid;
}

/** Kirim teks bebas. Hanya valid di dalam jendela layanan 24 jam (§5.2). Return wamid. */
export function sendText(to: string, body: string, env?: GraphEnv): Promise<string> {
  return sendMessage({ to, type: "text", text: { body, preview_url: false } }, env);
}

/** Kirim message template yang sudah disetujui Meta. Return wamid. */
export function sendTemplate(
  to: string,
  name: string,
  languageCode: string,
  bodyParams: string[],
  env?: GraphEnv,
): Promise<string> {
  return sendMessage(
    {
      to,
      type: "template",
      template: {
        name,
        language: { code: languageCode },
        components: bodyParams.length
          ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
          : [],
      },
    },
    env,
  );
}

export async function markAsRead(wamid: string, env?: GraphEnv): Promise<void> {
  const e = env ?? getWhatsAppEnv();
  await graphFetch(
    `${e.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: wamid }) },
    e,
  );
}

export type MediaInfo = { url: string; mimeType: string; sha256: string | null; fileSize: number | null };

export async function getMediaInfo(mediaId: string, env?: GraphEnv): Promise<MediaInfo> {
  const res = await graphFetch(encodeURIComponent(mediaId), {}, env);
  const json = (await res.json()) as { url?: string; mime_type?: string; sha256?: string; file_size?: number | string };
  if (!json.url || !json.mime_type) throw new WhatsAppApiError(res.status, "INVALID_MEDIA_INFO");
  return {
    url: json.url,
    mimeType: json.mime_type,
    sha256: json.sha256 ?? null,
    fileSize: json.file_size === undefined ? null : Number(json.file_size),
  };
}

export class MediaTooLargeError extends Error {
  constructor() {
    super("Media melebihi batas ukuran");
    this.name = "MediaTooLargeError";
  }
}

/**
 * Unduh isi media dari URL Meta (berlaku singkat, wajib header Authorization).
 * Berhenti membaca begitu melewati maxBytes.
 */
export async function downloadMediaContent(url: string, maxBytes: number, env?: GraphEnv): Promise<Buffer> {
  const e = env ?? getWhatsAppEnv();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok || !res.body) throw new WhatsAppApiError(res.status, "MEDIA_DOWNLOAD_FAILED");

  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new MediaTooLargeError();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new MediaTooLargeError();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
