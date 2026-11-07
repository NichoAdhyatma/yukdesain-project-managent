import { createHash } from "node:crypto";
import { normalizePhone } from "./phone";
import { FONNTE_MEDIA_PREFIX } from "./media";
import type { InboundMessage } from "./payload";

// Webhook pesan masuk Kirimi (docs/WHATSAPP_CHANNEL_KIRIMI.md §4) → InboundMessage yang sama dengan Meta/Fonnte.
// Format data pesan masuk belum didokumentasikan publik, jadi pembaca ini toleran terhadap nama field yang umum
// dipakai gateway WhatsApp Web, dan `describeKirimiPayload` mencatat bentuk data untuk memastikannya.

export type KirimiPayload = Record<string, unknown>;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Ambil nilai pertama yang tidak kosong dari beberapa jalur ("a.b.c"). */
function pick(root: Obj, paths: string[]): unknown {
  for (const path of paths) {
    let cur: unknown = root;
    for (const key of path.split(".")) cur = isObj(cur) ? cur[key] : undefined;
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

const IMAGE_TYPES = /^(image|imageMessage|photo|sticker)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)(\?|$)/i;

/** Isi event: Kirimi bisa membungkus di `data` / `payload` / `message` (objek), atau langsung di root. */
function unwrap(body: KirimiPayload): Obj {
  for (const key of ["data", "payload"]) {
    if (isObj(body[key])) return body[key] as Obj;
  }
  return body;
}

export type ParsedKirimi =
  | { kind: "message"; device: string | null; message: InboundMessage }
  | { kind: "ignored"; reason: "not_message_event" | "from_me" | "group" | "empty" | "invalid_sender" | "lid" };

export function kirimiEventName(body: KirimiPayload, header: string | null): string | null {
  return header?.trim() || str(body.event).trim() || str(body.type).trim() || null;
}

export function parseKirimiPayload(body: KirimiPayload, eventHeader: string | null, now = new Date()): ParsedKirimi {
  const event = kirimiEventName(body, eventHeader);
  // Hanya pesan masuk; status kirim (message.sent/ack/failed) dan event lain diabaikan.
  if (event && event !== "message") return { kind: "ignored", reason: "not_message_event" };

  const m = unwrap(body);
  const fromMe = pick(m, ["fromMe", "from_me", "key.fromMe", "isFromMe", "is_from_me"]);
  if (fromMe === true || fromMe === "true") return { kind: "ignored", reason: "from_me" };

  const rawSender = str(pick(m, ["from", "sender", "phone", "number", "remoteJid", "key.remoteJid", "chatId", "chat_id", "jid"])).trim();
  const isGroup = pick(m, ["isGroup", "is_group", "group"]);
  if (isGroup === true || /@g\.us$/i.test(rawSender) || /@g\.us$/i.test(str(pick(m, ["chatId", "chat_id", "remoteJid", "key.remoteJid"])))) {
    return { kind: "ignored", reason: "group" };
  }
  if (/@lid$/i.test(rawSender)) return { kind: "ignored", reason: "lid" };
  const waId = normalizePhone(rawSender.replace(/@(s\.whatsapp\.net|c\.us)$/i, ""));
  if (!waId || waId.length < 10) return { kind: "ignored", reason: "invalid_sender" };

  const messageField = m.message;
  const text = str(
    typeof messageField === "string"
      ? messageField
      : pick(m, [
          "text",
          "body",
          "caption",
          "content",
          "message.conversation",
          "message.extendedTextMessage.text",
          "message.imageMessage.caption",
          "message.text",
        ]),
  );
  const mediaUrl = str(pick(m, ["media_url", "mediaUrl", "media.url", "url", "file_url", "fileUrl", "image.url", "image_url"])).trim();
  const type = str(pick(m, ["type", "messageType", "message_type", "media.type", "mimetype", "mime_type"])).trim();
  if (!text.trim() && !mediaUrl) return { kind: "ignored", reason: "empty" };

  const seconds = Number(pick(m, ["timestamp", "messageTimestamp", "t", "time"]));
  const sentAt = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds > 1e12 ? seconds : seconds * 1000) : now;
  const rawId = str(pick(m, ["id", "message_id", "messageId", "key.id", "msg_id"])).trim();
  // Id stabil untuk dedupe (kolom wamid unik); Kirimi mencoba ulang webhook sampai 7 kali.
  const id = rawId || createHash("sha256").update(`${waId}|${seconds}|${text}|${mediaUrl}`).digest("hex").slice(0, 32);

  const base = {
    wamid: `kirimi:in:${id}`,
    waId,
    profileName: str(pick(m, ["pushName", "push_name", "notifyName", "sender_name", "senderName", "name"])).trim() || null,
    sentAt,
    contextWamid: null,
  };
  const device = str(pick(body, ["device_id", "deviceId", "session", "sessionId"])) || str(pick(m, ["device_id", "deviceId"])) || null;

  if (mediaUrl) {
    const isImage = IMAGE_TYPES.test(type) || /^image\//i.test(type) || IMAGE_EXT.test(mediaUrl);
    return {
      kind: "message",
      device,
      message: isImage
        ? { ...base, type: "image", mediaId: `${FONNTE_MEDIA_PREFIX}${mediaUrl}`, mimeType: null, sha256: null, caption: text || null }
        : { ...base, type: "unsupported", originalType: type || "file" },
    };
  }
  return { kind: "message", device, message: { ...base, type: "text", body: text } };
}

/**
 * Bentuk payload untuk log: nama field (bertingkat satu level) dan jenis nilainya, tanpa isi pesan dan tanpa nomor.
 * Dipakai untuk memastikan format pesan masuk Kirimi dari data asli.
 */
export function describeKirimiPayload(body: KirimiPayload, eventHeader: string | null): string {
  const shape = (v: unknown): string => {
    if (Array.isArray(v)) return "array";
    if (isObj(v)) return `{${Object.keys(v).sort().join(",")}}`;
    if (typeof v === "string") {
      if (/@(g\.us|s\.whatsapp\.net|c\.us|lid)$/i.test(v)) return `jid${v.slice(v.indexOf("@"))}`;
      if (/^\+?\d{8,}$/.test(v)) return `digits(${v.replace(/\D/g, "").length})`;
      if (/^https?:\/\//i.test(v)) return "url";
      return `str(${v.length})`;
    }
    return typeof v;
  };
  const parts = Object.keys(body)
    .sort()
    .map((k) => `${k}:${shape(body[k])}`);
  const inner = unwrap(body);
  const innerParts = inner === body ? [] : Object.keys(inner).sort().map((k) => `${k}:${shape(inner[k])}`);
  return `event=${kirimiEventName(body, eventHeader) ?? "-"} root=[${parts.join(" ")}]${innerParts.length ? ` inner=[${innerParts.join(" ")}]` : ""}`;
}
