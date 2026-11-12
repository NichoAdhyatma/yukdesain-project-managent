import { describe, expect, it } from "vitest";
import { clientNoticeText, type ClientNoticeKind } from "./client-notice-text";

const base = { clientName: "Sari", serviceName: "Logo Minimalis", portalUrl: "https://p/x", studioName: "YukDesain Studio" };
const KINDS: ClientNoticeKind[] = ["STARTED", "PROGRESS", "FINAL_SUBMITTED", "REVISION_DONE", "COMPLETED", "FILES_UNLOCKED"];

describe("clientNoticeText (docs/CLIENT_NOTIFICATIONS.md)", () => {
  it("mulai dikerjakan", () => {
    expect(clientNoticeText("STARTED", base)).toBe(
      "Halo kak Sari, project *Logo Minimalis* mulai dikerjakan desainer kami.\nPantau progresnya di sini: https://p/x",
    );
  });

  it("update progres: persen, catatan, link", () => {
    const text = clientNoticeText("PROGRESS", { ...base, progress: 59, note: "Sketsa tahap 2" });
    expect(text).toContain("Update project *Logo Minimalis*: progres *59%*.");
    expect(text).toContain("Catatan: Sketsa tahap 2");
    expect(text).toContain("Lihat detail dan file: https://p/x");
  });

  it("progres tanpa persen tidak menulis %, catatan panjang dipotong 300 karakter", () => {
    const text = clientNoticeText("PROGRESS", { ...base, progress: null, note: "a".repeat(400) });
    expect(text).not.toContain("%");
    expect(text).toContain(`Catatan: ${"a".repeat(300)}…`);
    expect(text).not.toContain("a".repeat(301));
  });

  it("hasil final, revisi selesai, project selesai", () => {
    const final = clientNoticeText("FINAL_SUBMITTED", base);
    expect(final).toContain("Hasil final project *Logo Minimalis* sudah siap");
    // Tanpa sisa tagihan = sudah lunas: file langsung bisa diunduh.
    expect(final).toContain("Cek, setujui, dan unduh filenya lewat link ini: https://p/x");
    expect(clientNoticeText("REVISION_DONE", { ...base, revisionNumber: 2 })).toContain("Revisi #2 untuk project *Logo Minimalis* sudah dikerjakan.");
    const done = clientNoticeText("COMPLETED", base);
    expect(done).toContain("Project *Logo Minimalis* sudah selesai.");
    expect(done).toContain("YukDesain Studio");
  });

  it("tanpa link portal tidak ada baris link; tanpa nama → \"Halo kak,\"; tanpa em dash", () => {
    for (const kind of KINDS) {
      const text = clientNoticeText(kind, { ...base, clientName: null, portalUrl: null, progress: 10, note: "x", revisionNumber: 1 });
      expect(text).not.toContain("http");
      expect(text).not.toMatch(/: $/m);
      expect(text).not.toContain("—");
      expect(text.startsWith("Halo kak,")).toBe(true);
    }
  });
});

// Project Nicho 12 Nov: hasil final dikirim saat baru dibayar Rp50.000 dari Rp250.000.
describe("file final terkunci sampai lunas (2026-11-12)", () => {
  const accounts = [{ name: "BCA", accountNumber: "2141358555", accountHolder: "Mochammad Rizal" }];

  it("hasil final belum lunas: sisa pelunasan dan cara bayar, file terbuka setelah lunas", () => {
    const text = clientNoticeText("FINAL_SUBMITTED", { ...base, balance: 200000, accounts });
    expect(text).toContain("Hasil final project *Logo Minimalis* sudah siap.");
    expect(text).toContain("Cek dan setujui lewat link ini: https://p/x");
    expect(text).toContain("File final bisa diunduh setelah pelunasan *Rp200.000*.");
    expect(text).toContain("• BCA 2141358555 a.n. Mochammad Rizal");
    expect(text).toContain("kirim bukti transfernya di chat ini");
  });

  it("hasil final sudah lunas: langsung bisa diunduh, tanpa tagihan", () => {
    const text = clientNoticeText("FINAL_SUBMITTED", { ...base, balance: 0, accounts });
    expect(text).toContain("Cek, setujui, dan unduh filenya lewat link ini: https://p/x");
    expect(text).not.toContain("pelunasan");
    expect(text).not.toContain("BCA");
  });

  it("project selesai tapi belum lunas: diingatkan sisa pelunasan", () => {
    const text = clientNoticeText("COMPLETED", { ...base, balance: 200000, accounts });
    expect(text).toContain("Project *Logo Minimalis* sudah selesai.");
    expect(text).toContain("File final bisa diunduh setelah pelunasan *Rp200.000*.");
  });

  it("pelunasan diterima: file final sudah bisa diunduh", () => {
    expect(clientNoticeText("FILES_UNLOCKED", base)).toBe(
      "Halo kak Sari,\nPelunasan project *Logo Minimalis* sudah kami terima, terima kasih. File final sudah bisa diunduh.\nUnduh di sini: https://p/x",
    );
  });
});
