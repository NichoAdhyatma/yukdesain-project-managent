import { beforeEach, describe, expect, it, vi } from "vitest";
import { $Enums } from "@prisma/client";

const db = vi.hoisted(() => ({
  studioSettings: { findUnique: vi.fn() },
  service: { findMany: vi.fn() },
}));
const guides = vi.hoisted(() => ({ getDraftGuide: vi.fn(), getPublishedGuide: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/storage", () => ({ getClient: () => ({}) }));
vi.mock("./bot-guide", async (orig) => ({ ...(await orig<typeof import("./bot-guide")>()), ...guides }));

import { BRAIN_FLOW, CAPABILITY_LABELS, buildBrain, splitBaseRules } from "./brain";
import { buildSystemPrompt } from "./system-prompt";
import { INTAKE_TOOLS } from "./tools";

const empty = { instructions: "", faqs: [], pricingRules: [], knowledgeFiles: [] };
const published = { ...empty, instructions: "Admin membalas 09.00-17.00." };
const draft = {
  ...published,
  knowledgeFiles: [{ title: "Gaya komunikasi", whenToUse: "", content: "Sapa dengan kak." }],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.studioSettings.findUnique.mockResolvedValue({ name: "YukDesain Studio", email: "hello@yukdesain.com", phone: "", address: "Jakarta" });
  db.service.findMany.mockResolvedValue([{ name: "Logo Minimalis", description: null, outputFormat: "AI, PNG" }]);
  guides.getDraftGuide.mockResolvedValue(draft);
  guides.getPublishedGuide.mockResolvedValue({ version: 3, publishedAt: new Date("2026-11-01"), guide: published });
});

describe("label tampilan tetap sinkron dengan bot", () => {
  it("setiap tool bot punya label kemampuan", () => {
    const missing = INTAKE_TOOLS.map((t) => t.name).filter((n) => !CAPABILITY_LABELS[n]);
    expect(missing).toEqual([]);
  });

  it("alur order mencakup semua status order WA", () => {
    expect(BRAIN_FLOW.map((s) => s.status).sort()).toEqual(Object.values($Enums.WaIntakeStatus).sort());
  });

  it("aturan dasar dipecah per heading, paragraf pembuka jadi Peran", () => {
    const sections = splitBaseRules(buildSystemPrompt("YukDesain Studio"));
    expect(sections.map((s) => s.title)).toEqual([
      "Peran",
      "Topik",
      "Batas yang tidak boleh dilanggar",
      "Cara menggali brief",
      "Permintaan di luar layanan",
      "Setelah ada harga (status QUOTED)",
      "Status project yang sudah berjalan",
      "Gaya",
    ]);
    expect(sections.every((s) => s.text.length > 0)).toBe(true);
  });
});

describe("buildBrain", () => {
  it("versi terbit: prompt = yang dipakai bot untuk klien, draft ditandai berbeda", async () => {
    const brain = await buildBrain("published");
    expect(brain.prompt.text).toBe(buildSystemPrompt("YukDesain Studio", published));
    expect(brain.guide.knowledgeFiles).toEqual([]);
    expect(brain.draftDiffers).toBe(true);
    expect(brain.guide.changed).toEqual({ instructions: false, knowledgeFiles: true, faqs: false, pricingRules: false });
    expect(brain.published?.version).toBe(3);
  });

  it("draft: prompt = yang dipakai Uji bot", async () => {
    const brain = await buildBrain("draft");
    expect(brain.prompt.text).toBe(buildSystemPrompt("YukDesain Studio", draft));
    expect(brain.prompt.text).toContain("Sapa dengan kak.");
    expect(brain.guide.knowledgeFiles).toHaveLength(1);
  });

  it("hanya layanan aktif, ukuran prompt termasuk definisi tools", async () => {
    const brain = await buildBrain("published");
    expect(db.service.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
    expect(brain.services).toEqual([{ name: "Logo Minimalis", description: "", outputFormat: "AI, PNG" }]);
    expect(brain.prompt.toolChars).toBe(JSON.stringify(INTAKE_TOOLS).length);
    expect(brain.prompt.approxTokens).toBeGreaterThan(0);
  });

  it("belum pernah terbit: tanpa panduan untuk klien", async () => {
    guides.getPublishedGuide.mockResolvedValue(null);
    const brain = await buildBrain("published");
    expect(brain.published).toBeNull();
    expect(brain.prompt.text).toBe(buildSystemPrompt("YukDesain Studio", null));
    expect(brain.draftDiffers).toBe(true);
  });
});
