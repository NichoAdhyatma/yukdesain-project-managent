import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const db = vi.hoisted(() => ({
  waBotGuideVersion: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  studioSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { WA_BOT_GUIDE_LIMITS } from "@/lib/constants";
import {
  GuideConflictError,
  botGuideSchema,
  getDraftGuide,
  publishDraftGuide,
  renderGuideSection,
  restoreGuideVersion,
} from "./bot-guide";

const guide = { instructions: "Admin membalas jam 09.00-17.00 WIB.", faqs: [{ question: "Ada file mentah?", answer: "Ada, AI dan PDF." }] };
const versionRow = (version: number, g = guide) => ({ version, publishedAt: new Date("2026-11-01"), instructions: g.instructions, faqs: g.faqs });

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
});

describe("botGuideSchema", () => {
  it("merapikan spasi dan menerima panduan kosong", () => {
    expect(botGuideSchema.parse({ instructions: "  halo  ", faqs: [] })).toEqual({ instructions: "halo", faqs: [] });
  });

  it("menolak teks terlalu panjang, FAQ terlalu banyak, dan FAQ kosong", () => {
    const long = "a".repeat(WA_BOT_GUIDE_LIMITS.instructionsMaxChars + 1);
    expect(botGuideSchema.safeParse({ instructions: long, faqs: [] }).success).toBe(false);
    const faqs = Array.from({ length: WA_BOT_GUIDE_LIMITS.faqMaxItems + 1 }, (_, i) => ({ question: `q${i}`, answer: "a" }));
    expect(botGuideSchema.safeParse({ instructions: "", faqs }).success).toBe(false);
    expect(botGuideSchema.safeParse({ instructions: "", faqs: [{ question: " ", answer: "a" }] }).success).toBe(false);
  });
});

describe("renderGuideSection", () => {
  it("kosong → tidak ada bagian", () => {
    expect(renderGuideSection(null, "YukDesain Studio")).toBe("");
    expect(renderGuideSection({ instructions: "", faqs: [] }, "YukDesain Studio")).toBe("");
  });

  it("memuat aturan, FAQ, dan pernyataan bahwa batas wajib tetap berlaku", () => {
    const text = renderGuideSection(guide, "YukDesain Studio");
    expect(text).toContain("# Panduan dari pemilik YukDesain Studio");
    expect(text).toContain("Batas yang tidak boleh dilanggar");
    expect(text).toContain("## Aturan tambahan\nAdmin membalas jam 09.00-17.00 WIB.");
    expect(text).toContain("- Pertanyaan: Ada file mentah?\n  Jawaban: Ada, AI dan PDF.");
  });

  it("hanya FAQ → tanpa judul aturan tambahan", () => {
    expect(renderGuideSection({ instructions: "", faqs: guide.faqs }, "X")).not.toContain("Aturan tambahan");
  });
});

describe("getDraftGuide", () => {
  it("belum pernah diedit → salinan versi terbit", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waBotGuideDraft: null });
    db.waBotGuideVersion.findFirst.mockResolvedValue(versionRow(2));
    expect(await getDraftGuide()).toEqual(guide);
  });

  it("draft rusak di DB → dianggap belum ada", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waBotGuideDraft: { instructions: 5 } });
    db.waBotGuideVersion.findFirst.mockResolvedValue(null);
    expect(await getDraftGuide()).toEqual({ instructions: "", faqs: [] });
  });
});

describe("publishDraftGuide", () => {
  it("versi berikutnya = versi aktif + 1, dengan penerbit", async () => {
    const draft = { instructions: "baru", faqs: [] };
    db.studioSettings.findUnique.mockResolvedValue({ waBotGuideDraft: draft });
    db.waBotGuideVersion.findFirst.mockResolvedValue(versionRow(2));
    db.waBotGuideVersion.create.mockResolvedValue({ version: 3, publishedAt: new Date() });

    const result = await publishDraftGuide("user_owner");

    expect(db.waBotGuideVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { version: 3, instructions: "baru", faqs: [], publishedById: "user_owner" } }),
    );
    expect(result.version).toBe(3);
  });

  it("versi pertama = 1", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waBotGuideDraft: guide });
    db.waBotGuideVersion.findFirst.mockResolvedValue(null);
    db.waBotGuideVersion.create.mockResolvedValue({ version: 1, publishedAt: new Date() });
    await publishDraftGuide("u");
    expect(db.waBotGuideVersion.create.mock.calls[0][0].data.version).toBe(1);
  });

  it("draft sama dengan versi aktif → ditolak", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waBotGuideDraft: guide });
    db.waBotGuideVersion.findFirst.mockResolvedValue(versionRow(2));
    await expect(publishDraftGuide("u")).rejects.toBeInstanceOf(GuideConflictError);
    expect(db.waBotGuideVersion.create).not.toHaveBeenCalled();
  });

  it("terbit bersamaan (nomor versi bentrok) → GuideConflictError", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waBotGuideDraft: { instructions: "x", faqs: [] } });
    db.waBotGuideVersion.findFirst.mockResolvedValue(null);
    db.waBotGuideVersion.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "5.22.0" }),
    );
    await expect(publishDraftGuide("u")).rejects.toBeInstanceOf(GuideConflictError);
  });
});

describe("restoreGuideVersion", () => {
  it("menyalin versi lama ke draft", async () => {
    db.waBotGuideVersion.findUnique.mockResolvedValue(versionRow(1));
    expect(await restoreGuideVersion(1)).toEqual(guide);
    expect(db.studioSettings.upsert.mock.calls[0][0].update).toEqual({ waBotGuideDraft: guide });
  });

  it("versi tidak ada → null, draft tidak diubah", async () => {
    db.waBotGuideVersion.findUnique.mockResolvedValue(null);
    expect(await restoreGuideVersion(9)).toBeNull();
    expect(db.studioSettings.upsert).not.toHaveBeenCalled();
  });
});
