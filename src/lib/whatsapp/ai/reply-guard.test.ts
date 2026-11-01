import { describe, expect, it } from "vitest";
import { PRICE_PLACEHOLDER, WA_TEXT_LIMIT, clampReply, mentionsPriceOrDeadline, stripPriceMentions } from "./reply-guard";

describe("mentionsPriceOrDeadline", () => {
  it.each([
    "Harga logo mulai Rp500.000",
    "biayanya sekitar 750rb kak",
    "Kisaran 1-2 juta",
    "estimasi 1.500.000",
    "Rp 300.000 untuk desain logo",
    "Pengerjaan selesai dalam 3 hari",
    "estimasi 2-3 minggu",
    "bisa jadi 2 hari kak",
  ])("terdeteksi: %s", (s) => {
    expect(mentionsPriceOrDeadline(s)).toBe(true);
  });

  it.each([
    "Harga akan dikirim tim kami setelah brief lengkap ya.",
    "Ukuran A3, 60x160 cm",
    "Boleh tahu nama brandnya?",
    "Logonya mau 2 warna?",
  ])("aman: %s", (s) => {
    expect(mentionsPriceOrDeadline(s)).toBe(false);
  });
});

describe("stripPriceMentions", () => {
  it("membuang kalimat bermasalah dan menambahkan kalimat standar sekali", () => {
    const r = stripPriceMentions("Siap kak! Harga logo Rp500.000. Selesai dalam 3 hari. Nama brandnya apa?");
    expect(r.changed).toBe(true);
    expect(r.text).toBe(`Siap kak! Nama brandnya apa?\n\n${PRICE_PLACEHOLDER}`);
  });

  it("tanpa sebutan harga → tidak berubah", () => {
    expect(stripPriceMentions("Halo kak, mau desain apa?")).toEqual({ text: "Halo kak, mau desain apa?", changed: false });
  });

  it("seluruh balasan bermasalah → hanya kalimat standar", () => {
    expect(stripPriceMentions("Harganya 1 juta kak.").text).toBe(PRICE_PLACEHOLDER);
  });

  it("harga item menu dari brief klien tidak dibuang", () => {
    const brief = JSON.stringify({ menu_items_json: [{ id: "1", name: "Es Kopi", price: "18.000" }] });
    const text = "Ringkasan: menu Es Kopi harga 18.000. Sudah sesuai?";
    expect(stripPriceMentions(text, brief)).toEqual({ text, changed: false });
  });

  it("angka yang tidak ada di brief tetap dibuang walau ada angka brief", () => {
    const brief = JSON.stringify({ menu_items_json: [{ id: "1", name: "Es Kopi", price: "18.000" }] });
    expect(stripPriceMentions("Es kopi 18.000, harga desainnya Rp500.000.", brief).changed).toBe(true);
  });
});

describe("clampReply", () => {
  it("memotong di batas WhatsApp", () => {
    const out = clampReply("a".repeat(5000));
    expect(out.length).toBe(WA_TEXT_LIMIT);
    expect(out.endsWith("…")).toBe(true);
  });
});
