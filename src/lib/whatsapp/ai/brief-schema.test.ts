import { describe, expect, it } from "vitest";
import {
  aiWritableBriefFields,
  allowedBriefFields,
  mergeBriefDraft,
  missingRequiredFields,
  validateBriefFields,
} from "./brief-schema";

const LOGO = "SVC-01";
const POSTER = "SVC-03";
const BOX = "SVC-07";

describe("allowed fields per layanan", () => {
  it("mengikuti SERVICE_BRIEF_CONFIGS", () => {
    expect(allowedBriefFields(LOGO)).toEqual(["brand_name", "business_desc", "colors", "tagline", "reference_items_json"]);
  });

  it("AI tidak boleh menulis field gambar", () => {
    expect(aiWritableBriefFields(LOGO)).not.toContain("reference_items_json");
    expect(aiWritableBriefFields(POSTER)).toEqual(["main_text", "size", "style", "menu_items_json"]);
  });

  it("layanan tidak dikenal → kosong", () => {
    expect(allowedBriefFields("SVC-99")).toEqual([]);
  });
});

describe("validateBriefFields", () => {
  it("menerima field yang valid dan merapikan spasi", () => {
    expect(validateBriefFields(LOGO, { brand_name: "  Kopi Senja ", colors: "coklat" }, "AI")).toEqual({
      ok: true,
      data: { brand_name: "Kopi Senja", colors: "coklat" },
    });
  });

  it("menolak kunci di luar config layanan", () => {
    const r = validateBriefFields(LOGO, { brand_name: "A", sticker_shape: "bulat" }, "AI");
    expect(r).toMatchObject({ ok: false, invalidKeys: ["sticker_shape"] });
  });

  it("menolak AI menulis field gambar, admin boleh", () => {
    const refs = [{ id: "a", type: "image", url: "https://pub.r2.dev/x.jpg", caption: "c" }];
    expect(validateBriefFields(LOGO, { reference_items_json: refs }, "AI")).toMatchObject({
      ok: false,
      invalidKeys: ["reference_items_json"],
    });
    expect(validateBriefFields(LOGO, { reference_items_json: refs }, "ADMIN")).toMatchObject({ ok: true });
  });

  it("menolak URL non-https untuk admin", () => {
    const refs = [{ id: "a", type: "url", url: "http://example.com", caption: "c" }];
    expect(validateBriefFields(LOGO, { reference_items_json: refs }, "ADMIN")).toMatchObject({ ok: false });
    expect(validateBriefFields(LOGO, { reference_items_json: [{ id: "a", type: "url", url: "javascript:alert(1)" }] }, "ADMIN"))
      .toMatchObject({ ok: false });
  });

  it("item menu dari AI tidak boleh membawa gambar", () => {
    const r = validateBriefFields(
      POSTER,
      { menu_items_json: [{ id: "m1", name: "Es Kopi", price: "18rb", image: "https://evil.example/x.png" }] },
      "AI",
    );
    expect(r).toEqual({ ok: true, data: { menu_items_json: [{ id: "m1", name: "Es Kopi", price: "18rb" }] } });
  });

  it("menolak teks kosong dan tipe yang salah", () => {
    expect(validateBriefFields(LOGO, { brand_name: "   " }, "AI")).toMatchObject({ ok: false, invalidKeys: ["brand_name"] });
    expect(validateBriefFields(LOGO, { brand_name: 123 }, "AI")).toMatchObject({ ok: false });
    expect(validateBriefFields(LOGO, ["brand_name"], "AI")).toMatchObject({ ok: false });
  });

  it("null = hapus field", () => {
    expect(validateBriefFields(LOGO, { tagline: null }, "AI")).toEqual({ ok: true, data: { tagline: null } });
  });
});

describe("missingRequiredFields", () => {
  it("field wajib yang kosong", () => {
    expect(missingRequiredFields(LOGO, { brand_name: "A", colors: " " })).toEqual(["business_desc", "colors"]);
  });

  it("lengkap → kosong", () => {
    expect(missingRequiredFields(BOX, { dimensions: "20x20x10", mandatory_info: "BPOM" })).toEqual([]);
  });
});

describe("mergeBriefDraft", () => {
  it("menimpa per kunci, null menghapus, draft lama tidak berubah", () => {
    const draft = { brand_name: "A", tagline: "lama" };
    expect(mergeBriefDraft(draft, { brand_name: "B", tagline: null, colors: "merah" })).toEqual({
      brand_name: "B",
      colors: "merah",
    });
    expect(draft).toEqual({ brand_name: "A", tagline: "lama" });
  });
});
