import { describe, expect, it } from "vitest";
import { briefFieldLabel } from "./field-labels";

// Produksi 13 Nov (Yeni): brief dari WhatsApp menyimpan question = kunci mentah ("client notes", "colors"), jadi
// desainer melihat "client notes" alih-alih "Catatan Tambahan Klien".
describe("briefFieldLabel", () => {
  it("field yang dikenal → label resmi, walau question berisi kunci mentah", () => {
    expect(briefFieldLabel("client_notes", "client notes")).toBe("Catatan Tambahan Klien");
    expect(briefFieldLabel("colors", "colors")).toBe("Warna yang Diinginkan");
  });

  it("pertanyaan khusus dari Form Link (tidak ada di daftar label) → teks pertanyaannya", () => {
    expect(briefFieldLabel("q_custom_1", "Siapa target pasar Anda?")).toBe("Siapa target pasar Anda?");
  });

  it("tanpa label dan tanpa teks pertanyaan → kunci dirapikan", () => {
    expect(briefFieldLabel("menu_style", "")).toBe("Menu Style");
  });
});

// Label daftar menu tampil "Menu Items" (bahasa Inggris, dari kunci mentah) di brief internal.
describe("label daftar JSON", () => {
  it("daftar menu dan referensi berlabel bahasa Indonesia", () => {
    expect(briefFieldLabel("menu_items")).toBe("Daftar Menu");
    expect(briefFieldLabel("kopi_menu_items")).toBe("Menu Kopi");
  });
});
