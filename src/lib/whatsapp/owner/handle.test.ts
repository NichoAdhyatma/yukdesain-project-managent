import { beforeEach, describe, expect, it, vi } from "vitest";

const reply = vi.hoisted(() => ({ sendBotText: vi.fn() }));
const ai = vi.hoisted(() => ({ runOwnerAiTurn: vi.fn() }));
const proposals = vi.hoisted(() => ({ findPendingProposal: vi.fn(), applyProposal: vi.fn(), cancelProposal: vi.fn() }));
const queries = vi.hoisted(() => ({ queryIdFromContext: vi.fn(), relayOwnerAnswer: vi.fn(), findFailedRelays: vi.fn() }));
vi.mock("../bot-reply", () => reply);
vi.mock("../ai/owner-conversation", () => ai);
vi.mock("./proposals", async (orig) => ({ ...(await orig<typeof import("./proposals")>()), ...proposals }));
vi.mock("./queries", () => queries);
const resume = vi.hoisted(() => ({ replyPendingAfterReturn: vi.fn() }));
vi.mock("../resume-after-return", () => resume);

import { OWNER_REPLIES } from "./proposals";
import { handleOwnerMessage } from "./handle";

const owner = { user: { id: "u_owner", name: "Rizal" }, target: "PUBLISH" as const };
const conv = { id: "conv_o", waId: "6281111111111", isSandbox: false };
const text = (body: string, contextWamid: string | null = null) => ({ id: "m_1", type: "text", body, contextWamid });
const sent = () => reply.sendBotText.mock.calls.map(([, body]) => body);
const pending = { id: "p_1", guide: { instructions: "", faqs: [], pricingRules: [] }, summary: "s", baseVersion: 1, target: "PUBLISH" };

beforeEach(() => {
  vi.clearAllMocks();
  queries.queryIdFromContext.mockResolvedValue(null);
  proposals.findPendingProposal.mockResolvedValue(pending);
  proposals.applyProposal.mockResolvedValue("Siap, panduan versi 2 sudah aktif untuk semua klien.");
  proposals.cancelProposal.mockResolvedValue(OWNER_REPLIES.cancelled);
  ai.runOwnerAiTurn.mockResolvedValue({ reply: "Oke", proposal: null, answeredQueryIds: [], resendQueryIds: [] });
  queries.relayOwnerAnswer.mockResolvedValue({ outcome: "sent", clientLabel: "zidan (6288****5389)" });
  queries.findFailedRelays.mockResolvedValue([]);
});

describe("handleOwnerMessage", () => {
  it("YA dengan usulan menunggu → diterapkan server, AI tidak dipanggil", async () => {
    await handleOwnerMessage(text("YA"), conv, owner);
    expect(proposals.applyProposal).toHaveBeenCalledWith(pending, owner);
    expect(ai.runOwnerAiTurn).not.toHaveBeenCalled();
    expect(sent()).toEqual(["Siap, panduan versi 2 sudah aktif untuk semua klien."]);
  });

  it("BATAL → usulan dibatalkan", async () => {
    await handleOwnerMessage(text("batal"), conv, owner);
    expect(proposals.cancelProposal).toHaveBeenCalled();
    expect(sent()).toEqual([OWNER_REPLIES.cancelled]);
  });

  it("YA tanpa usulan menunggu → diteruskan ke AI", async () => {
    proposals.findPendingProposal.mockResolvedValue(null);
    await handleOwnerMessage(text("ya"), conv, owner);
    expect(ai.runOwnerAiTurn).toHaveBeenCalled();
  });

  it("balasan (reply) ke pertanyaan klien tidak dianggap YA/BATAL", async () => {
    queries.queryIdFromContext.mockResolvedValue("q_1");
    await handleOwnerMessage(text("ya", "wamid.Q"), conv, owner);
    expect(proposals.applyProposal).not.toHaveBeenCalled();
    expect(ai.runOwnerAiTurn).toHaveBeenCalledWith({ owner, conversationId: "conv_o", repliedQueryId: "q_1" });
  });

  it("AI membuat usulan → pesan konfirmasi dari server, bukan teks AI", async () => {
    ai.runOwnerAiTurn.mockResolvedValue({
      reply: "teks AI",
      proposal: { id: "p_2", guide: pending.guide, base: pending.guide, summary: "Tambah aturan.", baseVersion: 1 },
      answeredQueryIds: [],
      resendQueryIds: [],
    });
    await handleOwnerMessage(text("kasih diskon 50rb kalau >5pcs"), conv, owner);
    expect(sent()[0]).toContain("Usulan perubahan panduan bot");
    expect(sent()[0]).toContain("Balas *YA*");
    expect(sent()[0]).not.toContain("teks AI");
  });

  it("jawaban owner: dicatat, lalu hasil kirim yang sebenarnya dilaporkan server", async () => {
    ai.runOwnerAiTurn.mockResolvedValue({ reply: "Siap, jawabannya dicatat.", proposal: null, answeredQueryIds: ["q_1"], resendQueryIds: [] });
    await handleOwnerMessage(text("BISA, pakai layanan kemasan"), conv, owner);
    expect(queries.relayOwnerAnswer).toHaveBeenCalledWith("q_1", { force: false });
    expect(sent()).toEqual(["Siap, jawabannya dicatat.", "Jawaban untuk zidan (6288****5389) sudah terkirim ke klien."]);
  });

  it.each([
    ["failed", ["belum terkirim", "*kirim ulang*"]],
    ["admin", ["sedang ditangani admin"]],
    ["window_closed", ["24 jam"]],
  ])("hasil kirim %s dilaporkan jujur ke owner", async (outcome, phrases) => {
    ai.runOwnerAiTurn.mockResolvedValue({ reply: "Dicatat.", proposal: null, answeredQueryIds: ["q_1"], resendQueryIds: [] });
    queries.relayOwnerAnswer.mockResolvedValue({ outcome, clientLabel: "zidan (6288****5389)" });
    await handleOwnerMessage(text("TIDAK, tawarkan 2D"), conv, owner);
    const report = sent()[1];
    for (const phrase of phrases) expect(report).toContain(phrase);
    expect(report).not.toContain("sudah terkirim");
  });

  it("AI meminta kirim ulang → dikirim dengan force dan dilaporkan", async () => {
    ai.runOwnerAiTurn.mockResolvedValue({ reply: null, proposal: null, answeredQueryIds: [], resendQueryIds: ["q_1"] });
    await handleOwnerMessage(text("coba kirim ulang ke zidan"), conv, owner);
    expect(queries.relayOwnerAnswer).toHaveBeenCalledWith("q_1", { force: true });
    expect(sent()).toEqual(["Jawaban untuk zidan (6288****5389) sudah terkirim ke klien."]);
  });

  it("\"kirim ulang\" dengan satu jawaban gagal kirim → dikirim ulang oleh server tanpa AI", async () => {
    queries.findFailedRelays.mockResolvedValue([{ id: "q_1" }]);
    await handleOwnerMessage(text("kirim ulang"), conv, owner);
    expect(ai.runOwnerAiTurn).not.toHaveBeenCalled();
    expect(queries.relayOwnerAnswer).toHaveBeenCalledWith("q_1", { force: true });
    expect(sent()).toEqual(["Jawaban untuk zidan (6288****5389) sudah terkirim ke klien."]);
  });

  // Owner menyalin kata tebal dari laporan bot: "*kirim ulang*" (produksi 2026-11-12 10:20).
  it.each(["*kirim ulang", "*kirim ulang*", "_kirim ulang_", "  *Kirim Ulang* ya"])("%j dikenali server seperti \"kirim ulang\"", async (body) => {
    queries.findFailedRelays.mockResolvedValue([{ id: "q_1" }]);
    await handleOwnerMessage(text(body), conv, owner);
    expect(ai.runOwnerAiTurn).not.toHaveBeenCalled();
    expect(queries.relayOwnerAnswer).toHaveBeenCalledWith("q_1", { force: true });
  });

  it("\"kirim ulang\" dengan beberapa jawaban gagal → AI yang menanyakan yang mana", async () => {
    queries.findFailedRelays.mockResolvedValue([{ id: "q_1" }, { id: "q_2" }]);
    await handleOwnerMessage(text("kirim ulang"), conv, owner);
    expect(ai.runOwnerAiTurn).toHaveBeenCalled();
  });

  it("balasan AI berisi pertanyaan klarifikasi + \"balas YA\" palsu → klarifikasinya tetap dikirim, ajakan YA dibuang", async () => {
    ai.runOwnerAiTurn.mockResolvedValue({
      reply: "Maksudnya harga total Rp100.000 khusus Sndy?\nBalas *YA* kalau benar.",
      proposal: null,
      answeredQueryIds: [],
      resendQueryIds: [],
    });
    await handleOwnerMessage(text("100rb aja untuk sndy"), conv, owner);
    expect(sent()).toEqual(["Maksudnya harga total Rp100.000 khusus Sndy?"]);
  });

  it("AI gagal dengan status provider → dicatat di log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { AiProviderError } = await import("@/lib/ai/client");
    ai.runOwnerAiTurn.mockRejectedValue(new AiProviderError("rate", 429));
    await handleOwnerMessage(text("halo"), conv, owner);
    expect(error.mock.calls.flat().join(" ")).toContain("provider_429");
  });

  it("AI tanpa balasan → sibuk, alasan berhenti dicatat", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    ai.runOwnerAiTurn.mockResolvedValue({ reply: null, proposal: null, answeredQueryIds: [], resendQueryIds: [], stopReason: "max_tokens" });
    await handleOwnerMessage(text("halo"), conv, owner);
    expect(sent()).toEqual([OWNER_REPLIES.busy]);
    expect(warn.mock.calls.flat().join(" ")).toContain("max_tokens");
  });

  it("AI menulis teks usulan sendiri (tanpa tool) → tidak dikirim, owner diminta mengirim ulang", async () => {
    ai.runOwnerAiTurn.mockResolvedValue({
      reply: "*Usulan perubahan panduan bot*\n• Express +50%\n\nBalas *YA* untuk menerapkan, atau *BATAL*.",
      proposal: null,
      answeredQueryIds: [],
      resendQueryIds: [],
    });
    await handleOwnerMessage(text("tambah paket express 50%"), conv, owner);
    expect(sent()).toEqual([OWNER_REPLIES.notRecorded]);
  });

  it("AI gagal → balasan sibuk ke owner", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    ai.runOwnerAiTurn.mockRejectedValue(new Error("boom"));
    await handleOwnerMessage(text("halo"), conv, owner);
    expect(sent()).toEqual([OWNER_REPLIES.busy]);
  });

  it("gambar → minta teks", async () => {
    await handleOwnerMessage({ ...text(""), type: "image" }, conv, owner);
    expect(sent()).toEqual([OWNER_REPLIES.textOnly]);
  });
});

describe("chat klien dikembalikan ke bot lewat perintah owner (13 Nov, Mif)", () => {
  const returned = { reply: "Siap, chat Mif saya kembalikan ke bot.", proposal: null, answeredQueryIds: [], resendQueryIds: [], returnedChats: [{ conversationId: "c_mif", label: "Mif (6281****2367)" }] };

  it("bot langsung membalas pesan klien yang tertinggal, hasilnya dilaporkan ke owner", async () => {
    ai.runOwnerAiTurn.mockResolvedValue(returned);
    resume.replyPendingAfterReturn.mockResolvedValue("replied");
    await handleOwnerMessage(text("nomor berakhiran 2367 coba kamu jawab"), conv, owner);
    expect(resume.replyPendingAfterReturn).toHaveBeenCalledWith("c_mif");
    expect(sent()).toEqual(["Siap, chat Mif saya kembalikan ke bot.", "Chat Mif (6281****2367) sudah dilayani bot lagi, dan bot sudah membalas pesan terakhir klien."]);
  });

  it("tidak ada pesan yang perlu dibalas / bot gagal / balas otomatis mati → laporan sesuai", async () => {
    ai.runOwnerAiTurn.mockResolvedValue(returned);
    resume.replyPendingAfterReturn.mockResolvedValueOnce("nothing_pending").mockResolvedValueOnce("failed").mockResolvedValueOnce("skipped");
    await handleOwnerMessage(text("Mif balas pakai bot"), conv, owner);
    await handleOwnerMessage(text("Mif balas pakai bot"), conv, owner);
    await handleOwnerMessage(text("Mif balas pakai bot"), conv, owner);
    const reports = sent().filter((t) => t.startsWith("Chat Mif"));
    expect(reports[0]).toContain("Belum ada pesan klien yang perlu dibalas");
    expect(reports[1]).toContain("bot gagal membalas");
    expect(reports[2]).toContain("Balas otomatis");
  });
});
