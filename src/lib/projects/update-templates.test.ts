import { describe, expect, it } from "vitest";
import { UPDATE_TEMPLATES, applyTemplate } from "./update-templates";

// Template pesan update dari owner (2026-11-14): tombol pintas di form update progres desainer.
describe("UPDATE_TEMPLATES", () => {
  it("enam template sesuai urutan dari owner", () => {
    expect(UPDATE_TEMPLATES.map((t) => t.label)).toEqual([
      "Proses Pengerjaan",
      "Draft Awal Siap Direview",
      "Hasil Revisi Pertama",
      "Hasil Revisi Kedua",
      "Hasil Revisi Ketiga – Final",
      "Desain Selesai – File Final",
    ]);
  });

  it("teks owner apa adanya; penanda tebal Markdown dibuang (portal menampilkan tanda bintang mentah)", () => {
    const draft = UPDATE_TEMPLATES.find((t) => t.id === "draft")!;
    expect(draft.text).toContain("Kakak bisa klik tombol Minta Revisi yang sudah tersedia di portal.");
    expect(draft.text).toContain("Sebagai informasi, Kakak mendapatkan free 3x revisi. 😊");
    expect(UPDATE_TEMPLATES.every((t) => !t.text.includes("**"))).toBe(true);
  });

  it("hanya template file final yang menandai hasil akhir", () => {
    expect(UPDATE_TEMPLATES.filter((t) => t.final).map((t) => t.id)).toEqual(["final"]);
  });
});

describe("applyTemplate", () => {
  const draft = UPDATE_TEMPLATES[1].text;
  const process = UPDATE_TEMPLATES[0].text;

  it("catatan kosong → diisi template", () => {
    expect(applyTemplate("", draft)).toBe(draft);
    expect(applyTemplate("   ", draft)).toBe(draft);
  });

  it("catatan berisi template lain → diganti", () => {
    expect(applyTemplate(process, draft)).toBe(draft);
  });

  it("catatan ketikan desainer → template ditambahkan di bawahnya, ketikan tidak hilang", () => {
    expect(applyTemplate("Warna sudah diganti hijau.", draft)).toBe(`Warna sudah diganti hijau.\n\n${draft}`);
  });
});
