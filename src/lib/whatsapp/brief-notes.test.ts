import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waIntake: { findFirst: vi.fn(), update: vi.fn() },
  waConversation: { findUnique: vi.fn() },
  project: { findFirst: vi.fn() },
  brief: { update: vi.fn() },
  waMessage: { findFirst: vi.fn() },
  attachment: { create: vi.fn() },
}));
const storage = vi.hoisted(() => ({ copyToPublicBucket: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/storage", () => storage);
vi.mock("./env", () => ({ getPrivateBucket: () => "private-bucket" }));
vi.mock("./media", () => ({ mimeFromStorageKey: () => "image/jpeg" }));

import { addClientBriefNote, appendNote, attachImageToProjectBrief } from "./brief-notes";

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

  // Produksi 13 Nov (Mr.K4z): "semua harga naik 1.000" saat brief dikumpulkan tidak punya field, bot bilang
  // "diteruskan ke tim" tetapi tidak ada yang tersimpan.
  it("order yang masih mengumpulkan brief: catatan bebas juga masuk brief order", async () => {
    db.waIntake.findFirst.mockResolvedValue({ id: "i1", status: "COLLECTING", briefDraft: { size: "A3" } });
    const result = await addClientBriefNote("conv1", "Semua harga menu naik 1.000, kecuali Amerikano dan teh hijau naik 2.000", now);
    expect(result).toEqual({ ok: true, target: "ORDER" });
    expect(db.waIntake.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { briefDraft: { size: "A3", client_notes: "• 12 Nov 21.19: Semua harga menu naik 1.000, kecuali Amerikano dan teh hijau naik 2.000" } },
    });
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
        // Desainer diberi tanda bahwa brief bertambah setelah project berjalan (kasus Yeni 13 Nov).
        clientUpdatedAt: now,
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

// Produksi 13 Nov (Yeni): gambar referensi "ini lucu" dikirim saat sketsa sudah dibuat. Bot hanya bisa mencatat
// deskripsinya; gambarnya tidak sampai ke desainer.
describe("attachImageToProjectBrief", () => {
  const project = (responses: unknown[]) => ({ id: "p1", projectNumber: "PRJ-1", brief: { id: "b1", responses } });

  beforeEach(() => {
    db.waIntake.findFirst.mockResolvedValue(null);
    db.waMessage.findFirst.mockResolvedValue({ id: "m9", mediaStorageKey: "wa-media/conv1/abc.jpg" });
    storage.copyToPublicBucket.mockResolvedValue("https://assets.example.com/project-brief/p1/m9.jpg");
  });

  it("menyalin ke storage publik, menambah ke referensi brief, membuat lampiran, dan memberi tanda waktu", async () => {
    db.project.findFirst.mockResolvedValue(
      project([
        { questionId: "brand_name", question: "brand name", answer: "Dapur" },
        { questionId: "reference_items_json", question: "reference items json", answer: JSON.stringify([{ id: "wa-m1", type: "image", url: "u1", caption: "logo lama" }]) },
      ]),
    );
    const result = await attachImageToProjectBrief("conv1", "m9", "gaya gambar dipakai sebagian", now);
    expect(result).toEqual({ ok: true, target: "PROJECT", projectNumber: "PRJ-1" });
    expect(db.waMessage.findFirst.mock.calls[0][0].where).toEqual({ id: "m9", conversationId: "conv1", direction: "INBOUND", type: "image" });
    expect(storage.copyToPublicBucket).toHaveBeenCalledWith("private-bucket", "wa-media/conv1/abc.jpg", "project-brief/p1/m9.jpg", "image/jpeg");
    const data = db.brief.update.mock.calls[0][0].data;
    expect(data.clientUpdatedAt).toEqual(now);
    expect(JSON.parse(data.responses[1].answer)).toEqual([
      { id: "wa-m1", type: "image", url: "u1", caption: "logo lama" },
      { id: "wa-m9", type: "image", url: "https://assets.example.com/project-brief/p1/m9.jpg", caption: "gaya gambar dipakai sebagian" },
    ]);
    expect(db.attachment.create).toHaveBeenCalledWith({
      data: {
        filename: "m9.jpg",
        mimeType: "image/jpeg",
        size: 0,
        storageKey: "project-brief/p1/m9.jpg",
        caption: "gaya gambar dipakai sebagian",
        category: "BRIEF_REFERENCE",
        projectId: "p1",
        uploaderId: "whatsapp",
      },
    });
  });

  it("brief tanpa field referensi → field referensi dibuat", async () => {
    db.project.findFirst.mockResolvedValue(project([{ questionId: "brand_name", question: "brand name", answer: "Dapur" }]));
    await attachImageToProjectBrief("conv1", "m9", "contoh", now);
    const responses = db.brief.update.mock.calls[0][0].data.responses;
    expect(responses[1]).toMatchObject({ questionId: "reference_items_json", question: "reference items json" });
    expect(JSON.parse(responses[1].answer)).toHaveLength(1);
  });

  it("gambar yang sama tidak dilampirkan dua kali", async () => {
    db.project.findFirst.mockResolvedValue(
      project([{ questionId: "reference_items_json", question: "reference items json", answer: JSON.stringify([{ id: "wa-m9", type: "image", url: "u" }]) }]),
    );
    expect(await attachImageToProjectBrief("conv1", "m9", "x", now)).toEqual({ ok: true, target: "PROJECT", projectNumber: "PRJ-1" });
    expect(storage.copyToPublicBucket).not.toHaveBeenCalled();
    expect(db.brief.update).not.toHaveBeenCalled();
  });

  it("gambar bukan milik percakapan ini / belum tersimpan → ditolak", async () => {
    db.project.findFirst.mockResolvedValue(project([]));
    db.waMessage.findFirst.mockResolvedValue({ id: "m9", mediaStorageKey: null });
    expect(await attachImageToProjectBrief("conv1", "m9", "x", now)).toMatchObject({ ok: false });
    expect(storage.copyToPublicBucket).not.toHaveBeenCalled();
  });

  it("tidak ada project yang sedang dikerjakan → ditolak", async () => {
    db.project.findFirst.mockResolvedValue(null);
    expect(await attachImageToProjectBrief("conv1", "m9", "x", now)).toMatchObject({ ok: false });
  });
});
