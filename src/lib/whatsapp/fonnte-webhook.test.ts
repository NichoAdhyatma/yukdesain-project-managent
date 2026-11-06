import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/storage", () => ({ getClient: () => ({}) }));

import { describeFonntePayload, parseFonntePayload } from "./fonnte-webhook";

const now = new Date("2026-11-06T10:00:00Z");

describe("parseFonntePayload", () => {
  it("teks → pesan masuk dengan nomor 62…, nama, waktu, dan id dedupe", () => {
    const r = parseFonntePayload(
      { device: "6285100000000", sender: "081234567890", name: "Sari", message: "Halo mau logo", timestamp: "1793700000", inboxid: "987" },
      now,
    );
    expect(r).toEqual({
      kind: "message",
      device: "6285100000000",
      message: {
        wamid: expect.stringMatching(/^fonnte:in:[0-9a-f]{32}$/),
        waId: "6281234567890",
        profileName: "Sari",
        sentAt: new Date(1793700000 * 1000),
        contextWamid: null,
        type: "text",
        body: "Halo mau logo",
      },
    });
  });

  it("gambar dengan caption → image dengan mediaId url:", () => {
    const r = parseFonntePayload({ sender: "6281234567890", message: "bukti transfer", url: "https://cdn.fonnte.com/a.jpg", extension: "jpg" }, now);
    expect(r.kind === "message" && r.message).toMatchObject({ type: "image", mediaId: "url:https://cdn.fonnte.com/a.jpg", caption: "bukti transfer" });
  });

  it("file selain gambar → unsupported", () => {
    const r = parseFonntePayload({ sender: "6281234567890", url: "https://cdn.fonnte.com/a.pdf", extension: "pdf" }, now);
    expect(r.kind === "message" && r.message).toMatchObject({ type: "unsupported", originalType: "pdf" });
  });

  it.each([
    [{ sender: "120363@g.us", message: "halo grup" }, "group"],
    [{ sender: "6281234567890", member: "6289999", message: "halo" }, "group"],
    [{ sender: "6281234567890", message: "   " }, "empty"],
    [{ sender: "abc", message: "halo" }, "invalid_sender"],
    [{ sender: "1234567890@lid", message: "halo" }, "lid"],
    [{ sender: "6281234567890@g.us", message: "halo" }, "group"],
  ])("diabaikan: %j → %s", (body, reason) => {
    expect(parseFonntePayload(body, now)).toEqual({ kind: "ignored", reason });
  });

  it("tanpa inboxid → id dari isi pesan, stabil untuk kiriman ulang", () => {
    const body = { sender: "6281234567890", message: "halo", timestamp: "1793700000" };
    const a = parseFonntePayload(body, now);
    const b = parseFonntePayload({ ...body }, now);
    expect(a.kind === "message" && b.kind === "message" && a.message.wamid === b.message.wamid).toBe(true);
  });

  it.each([
    [{ sender: "6281234567890@s.whatsapp.net", message: "halo" }],
    [{ sender: "6281234567890", member: "6281234567890", message: "halo" }],
    [{ sender: "081234567890", member: "6281234567890@s.whatsapp.net", message: "halo" }],
  ])("chat pribadi dengan format JID / member sama dengan pengirim: %j", (body) => {
    const r = parseFonntePayload(body, now);
    expect(r.kind === "message" && r.message.waId).toBe("6281234567890");
  });
});

describe("parseFonntePayload — id dedupe", () => {
  const wamid = (body: Record<string, unknown>) => {
    const r = parseFonntePayload(body, now);
    return r.kind === "message" ? r.message.wamid : null;
  };

  it("inboxid 0 dari Fonnte: pesan berbeda tetap mendapat id berbeda", () => {
    const a = wamid({ sender: "6281234567890", message: "hai", timestamp: "1793700000", inboxid: 0 });
    const b = wamid({ sender: "6281234567890", message: "mau logo", timestamp: "1793700060", inboxid: 0 });
    expect(a).not.toBe(b);
  });

  it("pesan sama di detik berbeda → id berbeda", () => {
    const a = wamid({ sender: "6281234567890", message: "ok", timestamp: "1793700000", inboxid: 0 });
    const b = wamid({ sender: "6281234567890", message: "ok", timestamp: "1793700005", inboxid: 0 });
    expect(a).not.toBe(b);
  });

  it("tanpa timestamp → tidak didedupe (id unik per kiriman)", () => {
    const body = { sender: "6281234567890", message: "ok" };
    expect(wamid(body)).not.toBe(wamid({ ...body }));
  });
});

describe("describeFonntePayload", () => {
  it("tanpa isi pesan dan tanpa nomor lengkap", () => {
    const d = describeFonntePayload({ sender: "6281234567890@s.whatsapp.net", device: "6285100000000", message: "rahasia" });
    expect(d).toBe("keys=[device,message,sender] sender=62…(13 digit)@s.whatsapp.net member=- device=62…(13 digit)");
    expect(d).not.toContain("rahasia");
    expect(d).not.toContain("1234567890");
  });
});
