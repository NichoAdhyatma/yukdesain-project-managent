import { describe, expect, it } from "vitest";
import { briefResponsesToEntries } from "./responses";

// Salinan logika POST /api/client-links/[token]/brief sebelum diekstrak (commit bd60c4d9),
// sebagai pembanding regression.
function legacyFormat(responses: Record<string, unknown>) {
  return Object.entries(responses)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({
      questionId: key,
      question: key.replace(/_/g, " "),
      answer: typeof value === "object" ? JSON.stringify(value) : String(value),
    }));
}

const formSubmission = {
  brand_name: "Kopi Senja",
  tagline: "",
  business_desc: "Kedai kopi keliling",
  colors: "coklat, krem",
  main_text: "Kopi Senja",
  logos_json: [{ url: "https://pub.r2.dev/brief-logo/x.png", caption: "logo lama" }],
  cart_sides_json: [{ sideName: "Depan", dimensions: "100x50", textBrief: "Nama brand besar" }],
  kopi_menu_items_json: [],
  reference_items_json: [
    { id: "att_1", type: "image", url: "https://pub.r2.dev/brief-reference/a.jpg", caption: "suka warnanya" },
    { id: "u1", type: "url", url: "https://pinterest.com/pin/1", caption: undefined },
  ],
  vendor_logo_url: undefined,
  size: null,
  count: 3,
};

describe("briefResponsesToEntries", () => {
  it("hasil identik dengan route brief lama", () => {
    expect(briefResponsesToEntries(formSubmission)).toEqual(legacyFormat(formSubmission));
  });

  it("membuang undefined, null, string kosong; array kosong tetap", () => {
    const keys = briefResponsesToEntries(formSubmission).map((e) => e.questionId);
    expect(keys).not.toContain("tagline");
    expect(keys).not.toContain("vendor_logo_url");
    expect(keys).not.toContain("size");
    expect(keys).toContain("kopi_menu_items_json");
  });

  it("objek di-JSON-kan, angka jadi string, label dari key", () => {
    const entries = briefResponsesToEntries({ logos_json: [{ url: "u", caption: "c" }], count: 3 });
    expect(entries).toEqual([
      { questionId: "logos_json", question: "logos json", answer: '[{"url":"u","caption":"c"}]' },
      { questionId: "count", question: "count", answer: "3" },
    ]);
  });
});
