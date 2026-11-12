import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waIntake: { findFirst: vi.fn(), update: vi.fn() },
  waConversation: { findUnique: vi.fn() },
  project: { findFirst: vi.fn() },
  brief: { update: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));

import { addClientBriefNote, appendNote } from "./brief-notes";

const now = new Date("2026-11-12T14:19:40Z"); // 21:19 WIB

beforeEach(() => {
  vi.resetAllMocks();
  db.waConversation.findUnique.mockResolvedValue({ clientId: "c1" });
});

describe("appendNote", () => {
  it("menambah baris bertanggal WIB, catatan lama tetap", () => {
    expect(appendNote(undefined, "Di sebelah rasa ada harga 12k", now)).toBe("• 12 Nov 21.19: Di sebelah rasa ada harga 12k");
    expect(appendNote("• 12 Nov 21.10: A", "B", now)).toBe("• 12 Nov 21.10: A\n• 12 Nov 21.19: B");
  });
});

// Kasus Alfa Indah 12 Nov: minta "harga 12k di sebelah rasa" setelah kirim bukti DP → bot mengalihkan chat ke admin.
describe("addClientBriefNote", () => {
  it("order yang sudah ada invoice/bukti DP: dicatat di brief order (ikut ke project saat DP disetujui)", async () => {
    db.waIntake.findFirst.mockResolvedValue({ id: "i1", status: "DP_REVIEW", briefDraft: { main_text: "Haura" } });
    const result = await addClientBriefNote("conv1", "Di sebelah rasa ada harga 12k", now);
    expect(result).toEqual({ ok: true, target: "ORDER" });
    expect(db.waIntake.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { briefDraft: { main_text: "Haura", client_notes: "• 12 Nov 21.19: Di sebelah rasa ada harga 12k" } },
    });
  });

  it("order masih mengumpulkan brief: ditolak, pakai update_brief_draft", async () => {
    db.waIntake.findFirst.mockResolvedValue({ id: "i1", status: "COLLECTING", briefDraft: {} });
    const result = await addClientBriefNote("conv1", "x", now);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("update_brief_draft") });
    expect(db.waIntake.update).not.toHaveBeenCalled();
  });

  it("tanpa order aktif: dicatat di brief project klien yang sedang berjalan", async () => {
    db.waIntake.findFirst.mockResolvedValue(null);
    db.project.findFirst.mockResolvedValue({
      projectNumber: "PRJ-1",
      brief: { id: "b1", responses: [{ questionId: "main_text", question: "main text", answer: "Haura" }] },
    });
    const result = await addClientBriefNote("conv1", "Tambah harga 12k", now);
    expect(result).toEqual({ ok: true, target: "PROJECT", projectNumber: "PRJ-1" });
    expect(db.project.findFirst.mock.calls[0][0].where).toEqual({ clientId: "c1", finalSubmittedAt: null, status: { not: "SELESAI" } });
    expect(db.brief.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: {
        responses: [
          { questionId: "main_text", question: "main text", answer: "Haura" },
          { questionId: "client_notes", question: "client notes", answer: "• 12 Nov 21.19: Tambah harga 12k" },
        ],
      },
    });
  });

  it("catatan project yang sudah ada ditambah, bukan diganti", async () => {
    db.waIntake.findFirst.mockResolvedValue(null);
    db.project.findFirst.mockResolvedValue({
      projectNumber: "PRJ-1",
      brief: { id: "b1", responses: [{ questionId: "client_notes", question: "client notes", answer: "• 12 Nov 21.00: A" }] },
    });
    await addClientBriefNote("conv1", "B", now);
    expect(db.brief.update.mock.calls[0][0].data.responses).toEqual([
      { questionId: "client_notes", question: "client notes", answer: "• 12 Nov 21.00: A\n• 12 Nov 21.19: B" },
    ]);
  });

  it("tidak ada order maupun project berjalan (atau hasil akhir sudah dikirim) → ditolak", async () => {
    db.waIntake.findFirst.mockResolvedValue(null);
    db.project.findFirst.mockResolvedValue(null);
    expect(await addClientBriefNote("conv1", "x", now)).toMatchObject({ ok: false });
    db.waConversation.findUnique.mockResolvedValue({ clientId: null });
    expect(await addClientBriefNote("conv1", "x", now)).toMatchObject({ ok: false, error: expect.stringContaining("get_my_projects") });
  });
});
