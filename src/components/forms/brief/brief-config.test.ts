import { describe, expect, it } from "vitest";
import { BRIEF_FIELD_SCHEMAS, missingRequiredFields, validateBriefFields } from "@/lib/whatsapp/ai/brief-schema";
import { BRIEF_FIELD_DESCRIPTIONS } from "@/lib/whatsapp/ai/system-prompt";
import { BRIEF_FIELD_LABELS } from "./field-labels";
import { SERVICE_BRIEF_CONFIGS, SERVICE_CODES } from "./types";

// Layanan baru dari knowledge base (spec 2026-11-11-kb-merge-design §4.4).
describe("konfigurasi brief layanan KB", () => {
  const config = (code: string) => SERVICE_BRIEF_CONFIGS.find((c) => c.code === code);

  it.each([
    ["SVC-12", "Buku Menu", ["brand_name", "page_count", "size", "style"]],
    ["SVC-13", "Social Media Auto Pilot", ["package_choice", "brand_name", "sosmed_platform", "sosmed_vibe"]],
    ["SVC-14", "Social Media Design Package", ["package_choice", "brand_name", "sosmed_platform", "sosmed_vibe"]],
    ["SVC-15", "Paket Duo Pack (Sticker Label + Box)", ["brand_name", "dimensions", "sticker_text", "mandatory_info"]],
  ])("%s %s punya konfigurasi", (code, name, required) => {
    expect(config(code)).toMatchObject({ name, requiredFields: required });
  });

  it("kode layanan baru terdaftar", () => {
    expect(SERVICE_CODES).toMatchObject({ BUKU_MENU: "SVC-12", SOSMED_AUTO_PILOT: "SVC-13", SOSMED_DESIGN_PACKAGE: "SVC-14", DUO_PACK: "SVC-15" });
  });

  it("paket / jumlah opsional di layanan lama", () => {
    expect(config("SVC-09")?.optionalFields).toContain("package_choice");
    expect(config("SVC-08")?.optionalFields).toContain("variant_count");
    expect(config("SVC-02")?.optionalFields).toContain("pose_count");
  });

  it("setiap kunci konfigurasi punya skema, deskripsi bot, dan label", () => {
    for (const c of SERVICE_BRIEF_CONFIGS) {
      for (const key of [...c.requiredFields, ...c.optionalFields]) {
        expect(BRIEF_FIELD_SCHEMAS[key], key).toBeDefined();
        expect(BRIEF_FIELD_DESCRIPTIONS[key], key).toBeTruthy();
        if (!key.endsWith("_json") && !key.endsWith("_url")) expect(BRIEF_FIELD_LABELS[key], key).toBeTruthy();
      }
    }
  });

  it("jumlah halaman wajib untuk Buku Menu dan harus bilangan bulat positif", () => {
    expect(missingRequiredFields("SVC-12", {})).toContain("page_count");
    expect(validateBriefFields("SVC-12", { page_count: "6" }, "AI")).toEqual({ ok: true, data: { page_count: 6 } });
    expect(validateBriefFields("SVC-12", { page_count: 2.5 }, "AI").ok).toBe(false);
    expect(validateBriefFields("SVC-12", { page_count: 0 }, "AI").ok).toBe(false);
  });
});
