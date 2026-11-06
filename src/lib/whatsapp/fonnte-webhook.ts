import { createHash, randomUUID } from "node:crypto";
import { normalizePhone } from "./phone";
import { FONNTE_MEDIA_PREFIX } from "./media";
import type { InboundMessage } from "./payload";

// Payload webhook pesan masuk Fonnte (https://docs.fonnte.com/webhook-reply-message/) → InboundMessage
// yang sama dengan webhook Meta, supaya alur bot tidak perlu tahu salurannya.

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export type FonntePayload = Record<string, unknown>;

const text = (v: unknown) => (typeof v === "string" ? v : v === undefined || v === null ? "" : String(v));

export type ParsedFonnte =
  | { kind: "message"; device: string | null; message: InboundMessage }
  | { kind: "ignored"; reason: "group" | "empty" | "invalid_sender" | "lid" };

// Akhiran JID WhatsApp yang bisa ikut terkirim di `sender` / `member`.
const PERSONAL_JID = /@(s\.whatsapp\.net|c\.us)$/i;

function jidKind(value: string): "group" | "lid" | "personal" | "other" {
  if (/@g\.us$/i.test(value)) return "group";
  if (/@lid$/i.test(value)) return "lid";
  if (!value.includes("@") || PERSONAL_JID.test(value)) return "personal";
  return "other";
}

export function parseFonntePayload(body: FonntePayload, now = new Date()): ParsedFonnte {
  const rawSender = text(body.sender).trim();
  const senderKind = jidKind(rawSender);
  if (senderKind === "group") return { kind: "ignored", reason: "group" };
  // Id privasi WhatsApp (@lid) tidak memuat nomor, jadi tidak bisa dicocokkan ke klien.
  if (senderKind === "lid") return { kind: "ignored", reason: "lid" };
  if (senderKind === "other") return { kind: "ignored", reason: "invalid_sender" };
  const waId = normalizePhone(rawSender.replace(PERSONAL_JID, ""));
  if (!waId || waId.length < 10) return { kind: "ignored", reason: "invalid_sender" };
  // Grup: `member` berisi anggota yang menulis. Di chat pribadi `member` kosong atau sama dengan pengirim.
  const member = text(body.member).trim();
  if (member && normalizePhone(member.replace(PERSONAL_JID, "")) !== waId) return { kind: "ignored", reason: "group" };

  const messageText = text(body.message);
  const url = text(body.url).trim();
  const extension = text(body.extension).trim().toLowerCase().replace(/^\./, "");
  if (!messageText.trim() && !url) return { kind: "ignored", reason: "empty" };

  const seconds = Number(body.timestamp);
  const sentAt = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : now;
  // Fonnte bisa mengirim ulang, jadi id harus stabil untuk dedupe (kolom wamid unik). `inboxid` tidak bisa
  // dipakai sendiri: Fonnte mengirim 0 untuk setiap pesan, sehingga semua pesan setelah yang pertama
  // dianggap duplikat. Tanpa timestamp tidak ada pegangan dedupe, jadi id dibuat unik per kiriman.
  const timestamp = text(body.timestamp).trim();
  const salt = timestamp ? "" : `${now.getTime()}|${randomUUID()}`;
  const id = createHash("sha256")
    .update(`${waId}|${timestamp}|${text(body.inboxid).trim()}|${messageText}|${url}|${salt}`)
    .digest("hex")
    .slice(0, 32);

  const base = {
    wamid: `fonnte:in:${id}`,
    waId,
    profileName: text(body.name).trim() || null,
    sentAt,
    // Fonnte tidak mengirim id pesan yang dibalas.
    contextWamid: null,
  };
  const device = normalizePhone(text(body.device)) || null;

  if (url) {
    const isImage = IMAGE_EXTENSIONS.has(extension) || /\.(jpe?g|png|webp)(\?|$)/i.test(url);
    return {
      kind: "message",
      device,
      message: isImage
        ? { ...base, type: "image", mediaId: `${FONNTE_MEDIA_PREFIX}${url}`, mimeType: null, sha256: null, caption: messageText || null }
        : { ...base, type: "unsupported", originalType: extension || "file" },
    };
  }
  return { kind: "message", device, message: { ...base, type: "text", body: messageText } };
}

/**
 * Ringkasan bentuk payload untuk log saat pesan diabaikan: nama field dan format pengirim/perangkat,
 * tanpa isi pesan dan tanpa nomor lengkap.
 */
export function describeFonntePayload(body: FonntePayload): string {
  const shape = (v: unknown) => {
    const s = text(v).trim();
    if (!s) return "-";
    const at = s.indexOf("@");
    const head = at >= 0 ? s.slice(0, at) : s;
    const suffix = at >= 0 ? s.slice(at) : "";
    const digits = /^\+?\d+$/.test(head) ? `${head.replace(/\D/g, "").slice(0, 2)}…(${head.replace(/\D/g, "").length} digit)` : `teks(${head.length})`;
    return `${digits}${suffix}`;
  };
  const keys = Object.keys(body).sort().join(",");
  return `keys=[${keys}] sender=${shape(body.sender)} member=${shape(body.member)} device=${shape(body.device)}`;
}
