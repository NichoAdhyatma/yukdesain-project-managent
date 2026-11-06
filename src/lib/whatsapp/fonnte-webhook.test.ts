import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/storage", () => ({ getClient: () => ({}) }));

import { parseFonntePayload } from "./fonnte-webhook";

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
        wamid: "fonnte:in:987",
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
  ])("diabaikan: %j → %s", (body, reason) => {
    expect(parseFonntePayload(body, now)).toEqual({ kind: "ignored", reason });
  });

  it("tanpa inboxid → id dari isi pesan, stabil untuk kiriman ulang", () => {
    const body = { sender: "6281234567890", message: "halo", timestamp: "1793700000" };
    const a = parseFonntePayload(body, now);
    const b = parseFonntePayload({ ...body }, now);
    expect(a.kind === "message" && b.kind === "message" && a.message.wamid === b.message.wamid).toBe(true);
  });
});
