import { describe, expect, it } from "vitest";
import { toFinalFiles } from "./link-dto";

// File final terkunci sampai lunas (2026-11-12); cara kirim link / WhatsApp (2026-11-14) ikut aturan yang sama:
// link Drive tidak pernah sampai ke klien sebelum lunas.
describe("toFinalFiles", () => {
  const files = [{ id: "f1", filename: "logo.ai", storageKey: "final/p1/logo.ai" }];

  it("file, belum lunas: nama terlihat, key disembunyikan", () => {
    expect(toFinalFiles(files, "DP_PAID", null, null)).toEqual({
      locked: true,
      method: "FILE",
      link: null,
      files: [{ id: "f1", filename: "logo.ai", storageKey: null }],
    });
  });

  it("link, belum lunas: link disembunyikan", () => {
    expect(toFinalFiles([], "DP_PAID", "LINK", "https://drive.google.com/x")).toMatchObject({ locked: true, method: "LINK", link: null });
  });

  it("link, lunas: link terlihat", () => {
    expect(toFinalFiles([], "PAID", "LINK", "https://drive.google.com/x")).toMatchObject({ locked: false, method: "LINK", link: "https://drive.google.com/x" });
  });

  it("WhatsApp: tanpa file dan link", () => {
    expect(toFinalFiles([], "PAID", "WHATSAPP", null)).toEqual({ locked: false, method: "WHATSAPP", link: null, files: [] });
  });
});
