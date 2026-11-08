import { describe, expect, it } from "vitest";
import { clientNoticeText, type ClientNoticeKind } from "./client-notice-text";

const base = { clientName: "Sari", serviceName: "Logo Minimalis", portalUrl: "https://p/x", studioName: "YukDesain Studio" };
const KINDS: ClientNoticeKind[] = ["STARTED", "PROGRESS", "FINAL_SUBMITTED", "REVISION_DONE", "COMPLETED"];

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
    expect(final).toContain("Cek dan setujui lewat link ini: https://p/x");
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
