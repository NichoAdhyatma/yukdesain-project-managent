import { beforeEach, describe, expect, it, vi } from "vitest";

const reply = vi.hoisted(() => ({ sendBotText: vi.fn() }));
const ai = vi.hoisted(() => ({ runOwnerAiTurn: vi.fn() }));
const proposals = vi.hoisted(() => ({ findPendingProposal: vi.fn(), applyProposal: vi.fn(), cancelProposal: vi.fn() }));
const queries = vi.hoisted(() => ({ queryIdFromContext: vi.fn(), relayOwnerAnswer: vi.fn() }));
vi.mock("../bot-reply", () => reply);
vi.mock("../ai/owner-conversation", () => ai);
vi.mock("./proposals", async (orig) => ({ ...(await orig<typeof import("./proposals")>()), ...proposals }));
vi.mock("./queries", () => queries);

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
  ai.runOwnerAiTurn.mockResolvedValue({ reply: "Oke", proposal: null, answeredQueryIds: [] });
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
    });
    await handleOwnerMessage(text("kasih diskon 50rb kalau >5pcs"), conv, owner);
    expect(sent()[0]).toContain("Usulan perubahan panduan bot");
    expect(sent()[0]).toContain("Balas *YA*");
    expect(sent()[0]).not.toContain("teks AI");
  });

  it("jawaban owner diteruskan ke klien setelah owner dibalas", async () => {
    ai.runOwnerAiTurn.mockResolvedValue({ reply: "Sudah diteruskan ke klien.", proposal: null, answeredQueryIds: ["q_1"] });
    await handleOwnerMessage(text("BISA, pakai layanan kemasan"), conv, owner);
    expect(sent()).toEqual(["Sudah diteruskan ke klien."]);
    expect(queries.relayOwnerAnswer).toHaveBeenCalledWith("q_1");
  });

  it("AI menulis teks usulan sendiri (tanpa tool) → tidak dikirim, owner diminta mengirim ulang", async () => {
    ai.runOwnerAiTurn.mockResolvedValue({
      reply: "*Usulan perubahan panduan bot*\n• Express +50%\n\nBalas *YA* untuk menerapkan, atau *BATAL*.",
      proposal: null,
      answeredQueryIds: [],
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
