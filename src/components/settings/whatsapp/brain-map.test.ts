import { describe, expect, it } from "vitest";
import { MAP_VISIBLE_ITEMS, buildBrainMap, visibleItems, type Brain } from "./brain-map";

const brain = (over: Partial<Brain> = {}): Brain => ({
  source: "published",
  published: { version: 7, publishedAt: "2026-11-04T08:45:31.653Z" },
  draftDiffers: true,
  studio: { name: "YukDesain Studio", email: "hello@yukdesain.com", phone: "", address: "Jakarta" },
  services: Array.from({ length: 11 }, (_, i) => ({ name: `Layanan ${i + 1}`, description: i === 0 ? "Logo modern" : "", outputFormat: "AI, PNG" })),
  pricingRules: [{ name: "Paket Express", value: "biaya tambahan 50% dari total", condition: "butuh cepat", note: "" }],
  flow: [{ status: "COLLECTING", label: "Sedang konsultasi", actor: "Bot dan klien", detail: "…" }],
  baseRules: [{ title: "Gaya", text: "- Sapa *kak*" }],
  guide: {
    instructions: "Admin membalas 09.00-17.00.",
    knowledgeFiles: [{ title: "Gaya komunikasi", whenToUse: "semua balasan", content: "# Nada\n- ramah" }],
    faqs: [{ question: "Ada file mentah?", answer: "Ada." }],
    changed: { instructions: false, knowledgeFiles: true, faqs: false, pricingRules: false },
  },
  capabilities: [{ name: "list_services", label: "Melihat daftar layanan", detail: "" }],
  prompt: { text: "", chars: 0, toolChars: 0, approxTokens: 0 },
  ...over,
});

describe("buildBrainMap", () => {
  it("7 cabang: 4 di kiri, 3 di kanan, urutan tetap", () => {
    const map = buildBrainMap(brain());
    expect(map.map((b) => `${b.side}:${b.id}`)).toEqual([
      "left:studio",
      "left:services",
      "left:pricing",
      "left:flow",
      "right:rules",
      "right:guide",
      "right:capabilities",
    ]);
  });

  it("cabang panjang: beberapa item tampil, sisanya +N lainnya", () => {
    const services = buildBrainMap(brain()).find((b) => b.id === "services")!;
    expect(visibleItems(services)).toMatchObject({ hidden: 11 - MAP_VISIBLE_ITEMS });
    expect(visibleItems(services).shown).toHaveLength(MAP_VISIBLE_ITEMS);
  });

  it("penanda draft: dari versi terbit 'Ada perubahan di draft', dari draft 'Belum terbit'", () => {
    const fromPublished = buildBrainMap(brain()).find((b) => b.id === "guide")!;
    expect(fromPublished.note).toBe("Ada perubahan di draft");
    expect(fromPublished.groups?.find((g) => g.id === "knowledge")?.note).toBe("Ada perubahan di draft");
    expect(fromPublished.groups?.find((g) => g.id === "faq")?.note).toBeNull();
    const fromDraft = buildBrainMap(brain({ source: "draft" })).find((b) => b.id === "guide")!;
    expect(fromDraft.note).toBe("Belum terbit");
  });

  it("isi Markdown ditandai untuk dirender; Ubah menuju bagian Panduan yang tepat", () => {
    const guide = buildBrainMap(brain()).find((b) => b.id === "guide")!;
    const file = guide.items.find((i) => i.group === "knowledge")!;
    expect(file).toMatchObject({ title: "Gaya komunikasi", markdown: true, body: "# Nada\n- ramah" });
    expect(guide.groups?.find((g) => g.id === "knowledge")?.edit).toEqual({ kind: "guide", section: "knowledge", label: "file pengetahuan" });
    const pricing = buildBrainMap(brain()).find((b) => b.id === "pricing")!;
    expect(pricing.edit).toMatchObject({ kind: "guide", section: "pricing" });
    expect(buildBrainMap(brain()).find((b) => b.id === "studio")!.edit).toMatchObject({ kind: "link", href: "/settings?tab=general" });
  });

  it("cabang yang dikunci tidak punya tombol Ubah", () => {
    for (const b of buildBrainMap(brain()).filter((b) => b.locked)) expect(b.edit).toBeUndefined();
  });
});
