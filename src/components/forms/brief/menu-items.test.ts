import { describe, expect, it } from "vitest";
import { isMenuItemList, menuPriceLabel } from "./menu-items";

// Produksi 14 Nov: 13 item menu dari WhatsApp berharga teks ("15K", "3K"). parseInt membuat "15K" tampil "Rp15" di brief
// desainer dan portal klien; 26 item tanpa harga membuat seluruh daftar tampil sebagai JSON mentah.
describe("menuPriceLabel", () => {
  it("angka rupiah utuh → format rupiah", () => {
    expect(menuPriceLabel("15000")).toBe("Rp15.000");
    expect(menuPriceLabel("12.000")).toBe("Rp12.000");
    expect(menuPriceLabel(18000)).toBe("Rp18.000");
  });

  it("harga yang ditulis klien dengan singkatan / teks → apa adanya, bukan Rp15", () => {
    expect(menuPriceLabel("15K")).toBe("15K");
    expect(menuPriceLabel("3K")).toBe("3K");
    expect(menuPriceLabel("Rp 12.000/cup")).toBe("Rp 12.000/cup");
    expect(menuPriceLabel("15")).toBe("15");
  });

  it("kosong → null", () => {
    expect(menuPriceLabel("")).toBeNull();
    expect(menuPriceLabel("  ")).toBeNull();
    expect(menuPriceLabel(undefined)).toBeNull();
    expect(menuPriceLabel(null)).toBeNull();
  });
});

describe("isMenuItemList", () => {
  it("item dengan nama, dengan atau tanpa harga → daftar menu", () => {
    expect(isMenuItemList([{ id: "m1", name: "Es Teh", price: "3K" }])).toBe(true);
    expect(isMenuItemList([{ id: "filter-menu", name: "Hanya nasi goreng dan mie goreng", caption: "Menu lain tidak dimasukkan" }])).toBe(true);
  });

  it("bukan daftar menu", () => {
    expect(isMenuItemList([])).toBe(false);
    expect(isMenuItemList([{ sideName: "Kiri" }])).toBe(false);
    expect(isMenuItemList("x")).toBe(false);
  });
});
