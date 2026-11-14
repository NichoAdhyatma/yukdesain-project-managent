import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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
  | { kind: "message"; device: string | null; message: InboundMessage; lid: string | null }
  /** Pesan keluar dari perangkat (pantulan balasan bot, atau admin mengetik di HP). `to` = nomor 62… atau LID lawan bicara. */
  | { kind: "echo"; device: string | null; to: { waId: string | null; lid: string | null }; body: string; msgId: string | null; hasMedia: boolean }
  | { kind: "ignored"; reason: "not_message_event" | "from_me" | "group" | "empty" | "invalid_sender" | "lid" };

/** Angka LID dari "123…@lid"; `plain` = field yang memang berisi LID (originLid dikirim sebagai angka polos). */
function lidDigits(v: string, plain = false): string | null {
  if (/^\d{8,20}@lid$/i.test(v)) return v.slice(0, v.indexOf("@"));
  return plain && /^\d{8,20}$/.test(v) ? v : null;
}

export function kirimiEventName(body: KirimiPayload, header: string | null): string | null {
  return header?.trim() || str(body.event).trim() || str(body.type).trim() || null;
}

export function parseKirimiPayload(body: KirimiPayload, eventHeader: string | null, now = new Date()): ParsedKirimi {
  const event = kirimiEventName(body, eventHeader);
  // Hanya pesan masuk; status kirim (message.sent/ack/failed) dan event lain diabaikan.
  if (event && event !== "message") return { kind: "ignored", reason: "not_message_event" };

  const m = unwrap(body);
  const fromMe = pick(m, ["fromMe", "from_me", "key.fromMe", "isFromMe", "is_from_me"]);
  const device = str(pick(body, ["device_id", "deviceId", "session", "sessionId"])) || str(pick(m, ["device_id", "deviceId"])) || null;

  let rawSender = str(pick(m, ["from", "sender", "phone", "number", "remoteJid", "key.remoteJid", "chatId", "chat_id", "jid"])).trim();
  const isGroup = pick(m, ["isFromGroup", "isGroup", "is_group", "group"]);
  if (isGroup === true || /@g\.us$/i.test(rawSender) || /@g\.us$/i.test(str(pick(m, ["chatId", "chat_id", "remoteJid", "key.remoteJid"])))) {
    return { kind: "ignored", reason: "group" };
  }

  if (fromMe === true || fromMe === "true") {
    // Pantulan pesan keluar: `from` berisi lawan bicara (nomor 62… atau LID).
    const echoText = str(typeof m.message === "string" ? m.message : pick(m, ["text", "body", "caption", "message.conversation", "message.extendedTextMessage.text"]));
    const lid = lidDigits(rawSender);
    const alt = str(pick(m, ["senderAlt", "sender_alt", "senderPn"])).trim();
    const phoneRaw = lid ? (alt && !/@lid$/i.test(alt) ? alt : "") : rawSender;
    const waId = phoneRaw ? normalizePhone(phoneRaw.replace(/@(s\.whatsapp\.net|c\.us)$/i, "")) : null;
    const validWaId = waId && waId.length >= 10 ? waId : null;
    if (!lid && !validWaId) return { kind: "ignored", reason: "from_me" };
    return {
      kind: "echo",
      device,
      to: { waId: validWaId, lid },
      body: echoText,
      msgId: str(pick(m, ["msgId", "msg_id", "message_id", "messageId", "key.id"])).trim() || null,
      // Foto/dokumen dari HP admin: `message` hanya keterangannya (Mr.K4z 14 Nov: tersimpan sebagai teks "red velvet").
      hasMedia: str(pick(m, ["media_url", "mediaUrl", "media.url", "url", "file_url", "fileUrl", "image.url", "image_url"])).trim() !== "",
    };
  }

  // LID pengirim (Kirimi: originLid, atau `from` berupa @lid) untuk mengenali pantulan pesan keluar nanti.
  const lid = lidDigits(str(pick(m, ["originLid", "origin_lid"])).trim(), true) ?? lidDigits(rawSender);
  // Kontak dengan id privasi (@lid): Kirimi mengirim nomor aslinya di senderAlt.
  if (/@lid$/i.test(rawSender)) {
    const alt = str(pick(m, ["senderAlt", "sender_alt", "senderPn"])).trim();
    if (!alt || /@lid$/i.test(alt)) return { kind: "ignored", reason: "lid" };
    rawSender = alt;
  }
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
  const createdAt = Date.parse(str(pick(m, ["created_at", "createdAt"])));
  const sentAt =
    Number.isFinite(seconds) && seconds > 0
      ? new Date(seconds > 1e12 ? seconds : seconds * 1000)
      : Number.isFinite(createdAt)
        ? new Date(createdAt)
        : now;
  // msgId = id pesan WhatsApp (sama walau event dikirim ulang / lewat jalur lain); `id` = id event Kirimi.
  const rawId = str(pick(m, ["msgId", "msg_id", "message_id", "messageId", "key.id", "id"])).trim();
  // Id stabil untuk dedupe (kolom wamid unik); Kirimi mencoba ulang webhook sampai 7 kali.
  const id = rawId || createHash("sha256").update(`${waId}|${seconds}|${text}|${mediaUrl}`).digest("hex").slice(0, 32);

  const base = {
    wamid: `kirimi:in:${id}`,
    waId,
    profileName: str(pick(m, ["pushName", "push_name", "notifyName", "sender_name", "senderName", "name"])).trim() || null,
    sentAt,
    contextWamid: null,
  };

  if (mediaUrl) {
    const isImage = IMAGE_TYPES.test(type) || /^image\//i.test(type) || IMAGE_EXT.test(mediaUrl);
    return {
      kind: "message",
      device,
      lid,
      message: isImage
        ? { ...base, type: "image", mediaId: `${FONNTE_MEDIA_PREFIX}${mediaUrl}`, mimeType: null, sha256: null, caption: text || null }
        : { ...base, type: "unsupported", originalType: type || "file" },
    };
  }
  return { kind: "message", device, lid, message: { ...base, type: "text", body: text } };
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

/** Signature resmi Kirimi (tab Webhook dashboard): hex HMAC-SHA256 dari `${timestamp}.${body}`. */
export function kirimiSignatureValid(raw: string, signature: string | null, timestamp: string | null, secret: string): boolean {
  if (!signature || !timestamp) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const given = signature.replace(/^sha256=/i, "").trim().toLowerCase();
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
