import { describe, expect, it } from "vitest";
import { parseWhatsAppFormatting as parse } from "./whatsapp-format";

describe("parseWhatsAppFormatting", () => {
  it("tebal, miring, coret, dan teks biasa", () => {
    expect(parse("1. *Logo Minimalis*, desain _modern_ ~lama~")).toEqual([
      "1. ",
      { type: "bold", children: ["Logo Minimalis"] },
      ", desain ",
      { type: "italic", children: ["modern"] },
      " ",
      { type: "strike", children: ["lama"] },
    ]);
  });

  it("format bersarang", () => {
    expect(parse("*Diskon _spesial_*")).toEqual([
      { type: "bold", children: ["Diskon ", { type: "italic", children: ["spesial"] }] },
    ]);
  });

  it("kode inline dan blok kode tidak diformat di dalamnya", () => {
    expect(parse("pakai `*bukan tebal*` ya")).toEqual(["pakai ", { type: "code", text: "*bukan tebal*" }, " ya"]);
    expect(parse("```\nPRJ-001\n```")).toEqual([{ type: "codeblock", text: "PRJ-001\n" }]);
  });

  it.each([
    ["snake_case_name", "snake_case_name"],
    ["2*3*4 = 24", "2*3*4 = 24"],
    ["harga * diskon", "harga * diskon"],
    ["* bukan tebal *", "* bukan tebal *"],
    ["admin_yuk@mail.com", "admin_yuk@mail.com"],
  ])("tidak memformat %j", (input, expected) => {
    expect(parse(input)).toEqual([expected]);
  });

  it("penanda tidak menyeberang baris dan baris baru dipertahankan", () => {
    expect(parse("*awal\nakhir*")).toEqual(["*awal\nakhir*"]);
    expect(parse("Halo kak!\n\n*Paket Social Media*")).toEqual([
      "Halo kak!\n\n",
      { type: "bold", children: ["Paket Social Media"] },
    ]);
  });

  it("tanda baca setelah penutup tetap boleh", () => {
    expect(parse("Pilih *Logo Ilustrasi*, ya.")).toEqual([
      "Pilih ",
      { type: "bold", children: ["Logo Ilustrasi"] },
      ", ya.",
    ]);
  });
});
