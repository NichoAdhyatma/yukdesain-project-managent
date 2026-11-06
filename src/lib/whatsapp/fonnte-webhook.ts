import { createHash } from "node:crypto";
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
  | { kind: "ignored"; reason: "group" | "empty" | "invalid_sender" };

export function parseFonntePayload(body: FonntePayload, now = new Date()): ParsedFonnte {
  const sender = text(body.sender).trim();
  // Pesan grup: sender berupa id grup, atau ada `member` (anggota grup yang menulis).
  if (sender.includes("@") || text(body.member).trim()) return { kind: "ignored", reason: "group" };
  const waId = normalizePhone(sender);
  if (!waId || waId.length < 10) return { kind: "ignored", reason: "invalid_sender" };

  const messageText = text(body.message);
  const url = text(body.url).trim();
  const extension = text(body.extension).trim().toLowerCase().replace(/^\./, "");
  if (!messageText.trim() && !url) return { kind: "ignored", reason: "empty" };

  const seconds = Number(body.timestamp);
  const sentAt = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : now;
  const inboxId = text(body.inboxid).trim();
  // Fonnte bisa mengirim ulang; id stabil untuk dedupe (kolom wamid unik).
  const id = inboxId || createHash("sha256").update(`${waId}|${text(body.timestamp)}|${messageText}|${url}`).digest("hex").slice(0, 32);

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
