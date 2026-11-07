import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/storage", () => ({ getClient: () => ({}) }));

import { describeKirimiPayload, parseKirimiPayload } from "./kirimi-webhook";

const now = new Date("2026-11-07T09:00:00Z");

describe("parseKirimiPayload (docs/WHATSAPP_CHANNEL_KIRIMI.md)", () => {
  it("teks datar: pengirim 62…, nama, id dedupe", () => {
    const r = parseKirimiPayload({ device_id: "D-1", from: "6281234567890", message: "Halo mau logo", pushName: "Sari", id: "ABC", timestamp: 1793700000 }, "message", now);
    expect(r).toEqual({
      kind: "message",
      device: "D-1",
      message: { wamid: "kirimi:in:ABC", waId: "6281234567890", profileName: "Sari", sentAt: new Date(1793700000 * 1000), contextWamid: null, type: "text", body: "Halo mau logo" },
    });
  });

  it("bentuk terbungkus data + JID gaya Baileys", () => {
    const r = parseKirimiPayload(
      { event: "message", device_id: "D-1", data: { key: { remoteJid: "6281234567890@s.whatsapp.net", fromMe: false, id: "K1" }, message: { conversation: "halo" }, pushName: "Budi" } },
      null,
      now,
    );
    expect(r.kind === "message" && r.message).toMatchObject({ waId: "6281234567890", wamid: "kirimi:in:K1", type: "text", body: "halo" });
  });

  it("gambar dengan caption → image lewat URL; file lain → unsupported", () => {
    const img = parseKirimiPayload({ from: "6281234567890", type: "image", media_url: "https://cdn.kirimi.id/a.jpg", caption: "bukti transfer" }, "message", now);
    expect(img.kind === "message" && img.message).toMatchObject({ type: "image", mediaId: "url:https://cdn.kirimi.id/a.jpg", caption: "bukti transfer" });
    const pdf = parseKirimiPayload({ from: "6281234567890", type: "document", media_url: "https://cdn.kirimi.id/a.pdf" }, "message", now);
    expect(pdf.kind === "message" && pdf.message).toMatchObject({ type: "unsupported", originalType: "document" });
  });

  it.each([
    [{ from: "6281234567890", message: "x" }, "message.sent", "not_message_event"],
    [{ from: "6281234567890", message: "x", fromMe: true }, "message", "from_me"],
    [{ from: "120363@g.us", message: "x" }, "message", "group"],
    [{ from: "6281234567890", message: "x", isGroup: true }, "message", "group"],
    [{ from: "1234567890@lid", message: "x" }, "message", "lid"],
    [{ from: "abc", message: "x" }, "message", "invalid_sender"],
    [{ from: "6281234567890", message: "  " }, "message", "empty"],
  ])("diabaikan: %j (%s) → %s", (body, event, reason) => {
    expect(parseKirimiPayload(body, event, now)).toEqual({ kind: "ignored", reason });
  });

  it("tanpa id → hash stabil untuk kiriman ulang", () => {
    const body = { from: "6281234567890", message: "halo", timestamp: 1793700000 };
    const a = parseKirimiPayload(body, "message", now);
    const b = parseKirimiPayload({ ...body }, "message", now);
    expect(a.kind === "message" && b.kind === "message" && a.message.wamid === b.message.wamid).toBe(true);
  });
});

describe("describeKirimiPayload", () => {
  it("bentuk saja, tanpa isi pesan dan nomor", () => {
    const d = describeKirimiPayload({ event: "message", data: { from: "6281234567890@s.whatsapp.net", message: "rahasia", media_url: "https://x/y.jpg" } }, null);
    expect(d).toBe("event=message root=[data:{from,media_url,message} event:str(7)] inner=[from:jid@s.whatsapp.net media_url:url message:str(7)]");
    expect(d).not.toContain("rahasia");
    expect(d).not.toContain("6281234567890");
  });
});
