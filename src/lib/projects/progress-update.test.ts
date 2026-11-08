import { describe, expect, it } from "vitest";
import { latestProgress, parseAttachmentIds, parseProgress, parseNotifyClient } from "./progress-update";

describe("parseProgress", () => {
  it("kosong → null (update tanpa persen tetap boleh)", () => {
    expect(parseProgress(null)).toEqual({ ok: true, value: null });
    expect(parseProgress(undefined)).toEqual({ ok: true, value: null });
    expect(parseProgress("  ")).toEqual({ ok: true, value: null });
  });

  it("angka dan string angka 0–100 diterima", () => {
    expect(parseProgress(0)).toEqual({ ok: true, value: 0 });
    expect(parseProgress(100)).toEqual({ ok: true, value: 100 });
    expect(parseProgress("75")).toEqual({ ok: true, value: 75 });
  });

  it("di luar rentang ditolak, tidak dipotong diam-diam", () => {
    expect(parseProgress(101).ok).toBe(false);
    expect(parseProgress(-1).ok).toBe(false);
  });

  it("pecahan, teks, dan NaN ditolak", () => {
    expect(parseProgress(50.5).ok).toBe(false);
    expect(parseProgress("abc").ok).toBe(false);
    expect(parseProgress(Number.NaN).ok).toBe(false);
    expect(parseProgress({}).ok).toBe(false);
  });
});

describe("parseAttachmentIds", () => {
  it("tidak ada lampiran → array kosong", () => {
    expect(parseAttachmentIds(undefined)).toEqual({ ok: true, value: [] });
    expect(parseAttachmentIds([])).toEqual({ ok: true, value: [] });
  });

  it("satu lampiran diterima, duplikat digabung", () => {
    expect(parseAttachmentIds(["a"])).toEqual({ ok: true, value: ["a"] });
    expect(parseAttachmentIds(["a", "a"])).toEqual({ ok: true, value: ["a"] });
  });

  it("lebih dari satu lampiran ditolak (Attachment.updateId unik)", () => {
    expect(parseAttachmentIds(["a", "b"]).ok).toBe(false);
  });

  it("bukan array string ditolak", () => {
    expect(parseAttachmentIds("a").ok).toBe(false);
    expect(parseAttachmentIds([1]).ok).toBe(false);
    expect(parseAttachmentIds([""]).ok).toBe(false);
  });
});

describe("latestProgress", () => {
  it("ambil persen terbaru yang tidak kosong", () => {
    expect(latestProgress([{ progress: null }, { progress: 60 }, { progress: 30 }])).toBe(60);
  });

  it("belum pernah diisi → null", () => {
    expect(latestProgress([])).toBeNull();
    expect(latestProgress([{ progress: null }])).toBeNull();
  });
});

describe("parseNotifyClient (kabari klien, docs/CLIENT_NOTIFICATIONS.md)", () => {
  it("kosong → true (default tercentang); boolean dipakai apa adanya", () => {
    expect(parseNotifyClient(undefined)).toEqual({ ok: true, value: true });
    expect(parseNotifyClient(null)).toEqual({ ok: true, value: true });
    expect(parseNotifyClient(true)).toEqual({ ok: true, value: true });
    expect(parseNotifyClient(false)).toEqual({ ok: true, value: false });
  });
  it("selain boolean ditolak", () => {
    expect(parseNotifyClient("false").ok).toBe(false);
    expect(parseNotifyClient(0).ok).toBe(false);
  });
});
