import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waOwnerProposal: { updateMany: vi.fn(), update: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  activityLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const guide = vi.hoisted(() => ({ publishGuideFromWhatsApp: vi.fn(), saveDraftGuide: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("../ai/bot-guide", async (orig) => ({ ...(await orig<typeof import("../ai/bot-guide")>()), ...guide }));

import { GuideConflictError } from "../ai/bot-guide";
import { OWNER_REPLIES, applyProposal, parseConfirmKeyword, proposalMessage } from "./proposals";

const owner = { user: { id: "u_owner", name: "Rizal" }, target: "PUBLISH" as const };
const empty = { instructions: "", faqs: [], pricingRules: [], knowledgeFiles: [] };
const withDiscount = {
  ...empty,
  pricingRules: [
    { id: "diskon-5pcs", kind: "DISCOUNT" as const, name: "Diskon >5 pcs", condition: "jumlah lebih dari 5 pcs", amountType: "FIXED" as const, amount: 50000, note: "" },
  ],
};
const proposal = { id: "p_1", guide: withDiscount, baseVersion: 2, target: "PUBLISH" as const };

beforeEach(() => {
  vi.clearAllMocks();
  db.waOwnerProposal.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: typeof db) => unknown)(db)));
});

describe("parseConfirmKeyword", () => {
  it.each(["YA", "ya", "Iya!", " ya. ", "yes"])("%j → YES", (t) => expect(parseConfirmKeyword(t)).toBe("YES"));
  it.each(["BATAL", "gak jadi", "Batalkan"])("%j → CANCEL", (t) => expect(parseConfirmKeyword(t)).toBe("CANCEL"));
  it.each(["ya tapi diskonnya 30rb aja", "tidak", "BISA", "oke"])("%j → bukan kata kunci", (t) =>
    expect(parseConfirmKeyword(t)).toBeNull(),
  );
});

describe("proposalMessage", () => {
  it("dibangun server: ringkasan, aturan harga baru, dan cara konfirmasi", () => {
    const text = proposalMessage({ ...proposal, base: empty, summary: "Tambah diskon untuk order banyak." });
    expect(text).toContain("Tambah diskon untuk order banyak.");
    expect(text).toContain("Diskon >5 pcs: potongan Rp");
    expect(text).toContain("50.000");
    expect(text).toContain("Balas *YA* untuk menerapkan ke semua klien");
    expect(text).not.toContain("Aturan tambahan");
  });

  it("Uji bot: YA menyimpan ke draft", () => {
    expect(proposalMessage({ ...proposal, target: "DRAFT", base: empty, summary: "x" })).toContain("menyimpan ke draft");
  });
});

describe("applyProposal", () => {
  it("terbit sebagai versi baru dari WhatsApp + activity log", async () => {
    guide.publishGuideFromWhatsApp.mockResolvedValue({ version: 3, publishedAt: new Date(), guide: withDiscount });
    const reply = await applyProposal(proposal, owner);
    expect(guide.publishGuideFromWhatsApp).toHaveBeenCalledWith(withDiscount, { userId: "u_owner", baseVersion: 2 });
    expect(db.activityLog.create.mock.calls[0][0].data).toMatchObject({ action: "WA_BOT_GUIDE_PUBLISHED", newValue: { version: 3, source: "WHATSAPP" } });
    expect(reply).toContain("versi 3");
  });

  it("Uji bot (DRAFT): hanya disimpan ke draft", async () => {
    const reply = await applyProposal({ ...proposal, target: "DRAFT" }, { ...owner, target: "DRAFT" });
    expect(guide.saveDraftGuide).toHaveBeenCalledWith(withDiscount);
    expect(guide.publishGuideFromWhatsApp).not.toHaveBeenCalled();
    expect(reply).toContain("draft");
  });

  it("panduan sudah berubah sejak usulan → tidak terbit, minta kirim ulang", async () => {
    guide.publishGuideFromWhatsApp.mockRejectedValue(new GuideConflictError("berubah"));
    expect(await applyProposal(proposal, owner)).toBe(OWNER_REPLIES.conflict);
    expect(db.waOwnerProposal.update).toHaveBeenCalledWith({ where: { id: "p_1" }, data: { status: "CANCELLED" } });
  });

  it("YA ganda: usulan yang sudah diklaim tidak diterbitkan lagi", async () => {
    db.waOwnerProposal.updateMany.mockResolvedValue({ count: 0 });
    await applyProposal(proposal, owner);
    expect(guide.publishGuideFromWhatsApp).not.toHaveBeenCalled();
  });
});
