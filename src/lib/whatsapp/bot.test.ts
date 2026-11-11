import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  waMessage: { findUniqueOrThrow: vi.fn(), create: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  waConversation: { update: vi.fn(), updateMany: vi.fn() },
  waIntake: { findFirst: vi.fn() },
  studioSettings: { findUnique: vi.fn() },
  waOwnerQuery: { updateMany: vi.fn() },
}));
const owner = vi.hoisted(() => ({ resolveOwner: vi.fn(), handleOwnerMessage: vi.fn() }));
const api = vi.hoisted(() => ({ sendText: vi.fn(), markAsRead: vi.fn() }));
const media = vi.hoisted(() => ({ storeInboundMedia: vi.fn() }));
const ai = vi.hoisted(() => ({ runAiTurn: vi.fn() }));
const limits = vi.hoisted(() => ({
  checkInboundRate: vi.fn(),
  botReplyLimitReached: vi.fn(),
  imageLimitExceeded: vi.fn(),
}));
const tools = vi.hoisted(() => ({ findActiveIntake: vi.fn() }));
const guard = vi.hoisted(() => ({ getMonthlyBrake: vi.fn(), notifyOwnersBrakeOnce: vi.fn() }));

const notify = vi.hoisted(() => ({ notifyNewClient: vi.fn(), notifyNeedsAdmin: vi.fn(), notifyNeedsQuote: vi.fn(), notifyDpProof: vi.fn() }));
vi.mock("@/lib/notifications/owner-events", () => notify);
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("./client-api", async (orig) => ({
  ...(await orig<typeof import("./client-api")>()),
  sendText: api.sendText,
  markAsRead: api.markAsRead,
}));
vi.mock("./media", () => media);
vi.mock("./ai/conversation", () => ai);
vi.mock("./rate-limit", () => limits);
vi.mock("./ai/tools", () => tools);
vi.mock("./owner/identity", () => ({ resolveOwner: owner.resolveOwner }));
vi.mock("./owner/handle", () => ({ handleOwnerMessage: owner.handleOwnerMessage }));
vi.mock("./spam-guard", async (orig) => ({
  ...(await orig<typeof import("./spam-guard")>()),
  getMonthlyBrake: guard.getMonthlyBrake,
  notifyOwnersBrakeOnce: guard.notifyOwnersBrakeOnce,
}));

import { WhatsAppApiError } from "./client-api";
import { BOT_REPLIES, handleInboundMessage } from "./bot";
import { DP_PLACEHOLDER, PRICE_PLACEHOLDER } from "./ai/reply-guard";

function givenMessage(type: string, body = "halo", mode = "BOT") {
  db.waMessage.findUniqueOrThrow.mockResolvedValue({
    id: "msg_1",
    wamid: "wamid.IN",
    type,
    body,
    createdAt: new Date("2026-11-01T10:00:00Z"),
    conversation: { id: "conv_1", waId: "6281234567890", mode },
  });
}

const aiReply = (reply: string | null, intakeStatus: string | null = "COLLECTING", briefText = "{}", allowedPriceNumbers: string[] = []) =>
  ai.runAiTurn.mockResolvedValue({ reply, intakeStatus, briefText, allowedPriceNumbers, toolsCalled: [] });

const sentBodies = () => api.sendText.mock.calls.map(([, body]) => body);
const humanModeSet = () =>
  db.waConversation.updateMany.mock.calls.some(([arg]) => arg.data?.mode === "HUMAN");

describe("handleInboundMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: true });
    db.waMessage.count.mockResolvedValue(0);
    api.sendText.mockResolvedValue("wamid.OUT");
    api.markAsRead.mockResolvedValue(undefined);
    guard.getMonthlyBrake.mockResolvedValue({ cap: 2000, used: 10, active: false, month: "2026-11" });
    db.waConversation.updateMany.mockResolvedValue({ count: 1 });
    guard.notifyOwnersBrakeOnce.mockResolvedValue(undefined);
    aiReply("Halo kak, mau desain apa?");
    limits.checkInboundRate.mockResolvedValue("ok");
    limits.botReplyLimitReached.mockResolvedValue(false);
    limits.imageLimitExceeded.mockResolvedValue(false);
    tools.findActiveIntake.mockResolvedValue({ createdAt: new Date("2026-11-01T00:00:00Z") });
    owner.resolveOwner.mockResolvedValue(null);
  });

  it("banjir pesan: pesan pertama yang lewat batas mendapat peringatan, tanpa AI", async () => {
    givenMessage("text");
    limits.checkInboundRate.mockResolvedValue("warn");
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.tooManyMessages]);
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("banjir pesan: berikutnya diabaikan tanpa balasan", async () => {
    givenMessage("text");
    limits.checkInboundRate.mockResolvedValue("ignore");
    await handleInboundMessage("msg_1");
    expect(api.sendText).not.toHaveBeenCalled();
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("gambar lebih dari batas per order → ditolak, tidak disimpan", async () => {
    givenMessage("image", "");
    limits.imageLimitExceeded.mockResolvedValue(true);
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.tooManyImages]);
    expect(media.storeInboundMedia).not.toHaveBeenCalled();
    expect(limits.imageLimitExceeded).toHaveBeenCalledWith("conv_1", new Date("2026-11-01T00:00:00Z"));
  });

  it("80 balasan bot dalam sehari → mode HUMAN, tanpa AI", async () => {
    givenMessage("text");
    limits.botReplyLimitReached.mockResolvedValue(true);
    await handleInboundMessage("msg_1");
    expect(humanModeSet()).toBe(true);
    expect(sentBodies()).toEqual([BOT_REPLIES.dailyLimit]);
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("bot nonaktif → tidak membalas, AI tidak dipanggil", async () => {
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: false });
    givenMessage("text");
    await handleInboundMessage("msg_1");
    expect(api.sendText).not.toHaveBeenCalled();
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("settings belum ada → dianggap nonaktif", async () => {
    db.studioSettings.findUnique.mockResolvedValue(null);
    givenMessage("text");
    await handleInboundMessage("msg_1");
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("mode HUMAN → tidak membalas", async () => {
    givenMessage("text", "halo", "HUMAN");
    await handleInboundMessage("msg_1");
    expect(api.sendText).not.toHaveBeenCalled();
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("teks → tandai dibaca, balasan AI dikirim dan disimpan", async () => {
    givenMessage("text");
    await handleInboundMessage("msg_1");
    expect(api.markAsRead).toHaveBeenCalledWith("wamid.IN");
    expect(ai.runAiTurn).toHaveBeenCalledWith({ conversationId: "conv_1", messageId: "msg_1" });
    expect(sentBodies()).toEqual(["Halo kak, mau desain apa?"]);
    expect(db.waMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ direction: "OUTBOUND", wamid: "wamid.OUT", sentByBot: true }),
    });
  });

  it.each(["admin", " ADMIN ", "cs", "Cs"])("kata kunci %j → mode HUMAN tanpa AI", async (body) => {
    givenMessage("text", body);
    await handleInboundMessage("msg_1");
    expect(humanModeSet()).toBe(true);
    expect(sentBodies()).toEqual([BOT_REPLIES.handoff]);
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("kalimat yang memuat kata admin tetap ke AI", async () => {
    givenMessage("text", "admin nya ada?");
    await handleInboundMessage("msg_1");
    expect(ai.runAiTurn).toHaveBeenCalled();
  });

  it("tipe tidak didukung → balasan standar tanpa AI", async () => {
    givenMessage("unsupported", "");
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.unsupported]);
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("gambar valid → disimpan lalu AI", async () => {
    givenMessage("image", "");
    media.storeInboundMedia.mockResolvedValue({ ok: true, media: {} });
    await handleInboundMessage("msg_1");
    expect(media.storeInboundMedia).toHaveBeenCalledWith("msg_1");
    expect(ai.runAiTurn).toHaveBeenCalled();
  });

  it.each(["MEDIA_TOO_LARGE", "MEDIA_TYPE_NOT_ALLOWED"] as const)("gambar ditolak (%s) → alasan, tanpa AI", async (reason) => {
    givenMessage("image", "");
    media.storeInboundMedia.mockResolvedValue({ ok: false, reason });
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES[reason]]);
    expect(ai.runAiTurn).not.toHaveBeenCalled();
  });

  it("sudah ada pesan masuk yang lebih baru → dilewati (gambar tetap disimpan)", async () => {
    givenMessage("image", "");
    media.storeInboundMedia.mockResolvedValue({ ok: true, media: {} });
    db.waMessage.count.mockResolvedValue(1);
    await handleInboundMessage("msg_1");
    expect(media.storeInboundMedia).toHaveBeenCalled();
    expect(ai.runAiTurn).not.toHaveBeenCalled();
    expect(api.sendText).not.toHaveBeenCalled();
  });

  it("pesan baru masuk selama AI berpikir → balasan tidak dikirim", async () => {
    givenMessage("text");
    // 1: belum ada pesan lebih baru, 2: ada pesan baru setelah AI selesai
    db.waMessage.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await handleInboundMessage("msg_1");
    expect(ai.runAiTurn).toHaveBeenCalled();
    expect(api.sendText).not.toHaveBeenCalled();
  });

  it("AI error → balasan sibuk + mode HUMAN, log tanpa nomor utuh", async () => {
    givenMessage("text");
    ai.runAiTurn.mockRejectedValue(new Error("boom: isi chat rahasia"));
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.busy]);
    expect(humanModeSet()).toBe(true);
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("6281234567890");
    expect(logged).not.toContain("rahasia");
  });

  it("balasan AI kosong → balasan sibuk + mode HUMAN", async () => {
    givenMessage("text");
    aiReply(null);
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.busy]);
    expect(humanModeSet()).toBe(true);
  });

  it("sebelum ada harga: kalimat yang menyebut harga dibuang", async () => {
    givenMessage("text");
    aiReply("Siap kak. Harga logo biasanya Rp500.000 ya. Boleh tahu nama brandnya?", "COLLECTING");
    await handleInboundMessage("msg_1");
    const [sent] = sentBodies();
    expect(sent).not.toMatch(/500/);
    expect(sent).toContain("Boleh tahu nama brandnya?");
    expect(sent).toContain(PRICE_PLACEHOLDER);
  });

  it("belum ada order sama sekali juga dijaga", async () => {
    givenMessage("text");
    aiReply("Pengerjaan logo selesai dalam 3 hari kak.", null);
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([PRICE_PLACEHOLDER]);
  });

  it("setelah QUOTED: harga dari STATE boleh disebut", async () => {
    givenMessage("text");
    const reply = "Harga order Rp2.500.000 sesuai invoice ya kak.";
    aiReply(reply, "QUOTED");
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([reply]);
  });

  it.each(["QUOTED", "DP_REVIEW"])("status %s: nominal DP dari bot dihapus, merujuk invoice", async (status) => {
    givenMessage("text");
    aiReply("DP-nya Rp75.000 ya kak. Kirim bukti transfernya di sini ya.", status);
    await handleInboundMessage("msg_1");
    const [sent] = sentBodies();
    expect(sent).not.toContain("75.000");
    expect(sent).toContain(DP_PLACEHOLDER);
  });

  it("balasan berisi markup tool-call → tidak dikirim, fallback sibuk + HUMAN", async () => {
    givenMessage("text");
    aiReply("]<]minimax[>[<tool_call>\n<invoke name=\"get_brief\">");
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual([BOT_REPLIES.busy]);
    expect(humanModeSet()).toBe(true);
  });

  it("markup tool-call sekali lalu balasan normal → percobaan ulang yang dikirim, tetap mode BOT", async () => {
    givenMessage("text");
    const turn = { intakeStatus: "COLLECTING", briefText: "{}", allowedPriceNumbers: [], toolsCalled: [] };
    ai.runAiTurn
      .mockResolvedValueOnce({ ...turn, reply: '<tool_call>\n<invoke name="get_brief">' })
      .mockResolvedValueOnce({ ...turn, reply: "Siap kak, layanan nomor 11 ya. Nama brandnya apa?" });
    await handleInboundMessage("msg_1");
    expect(ai.runAiTurn).toHaveBeenCalledTimes(2);
    expect(sentBodies()).toEqual(["Siap kak, layanan nomor 11 ya. Nama brandnya apa?"]);
    expect(humanModeSet()).toBe(false);
    const warned = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(warned).toContain("tool_markup");
    expect(warned).not.toContain("get_brief");
  });

  it("balasan rusak dua kali → baru fallback sibuk", async () => {
    givenMessage("text");
    aiReply("<tool_call>");
    await handleInboundMessage("msg_1");
    expect(ai.runAiTurn).toHaveBeenCalledTimes(2);
    expect(sentBodies()).toEqual([BOT_REPLIES.busy]);
  });

  describe("notifikasi owner (docs/OWNER_NOTIFICATIONS_INBOX.md)", () => {
    it("pesan pertama dari nomor baru → notifikasi klien baru, juga saat bot nonaktif", async () => {
      givenMessage("text");
      db.waMessage.findFirst.mockResolvedValue({ id: "msg_1" });
      db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: false });
      await handleInboundMessage("msg_1");
      expect(notify.notifyNewClient).toHaveBeenCalledWith("conv_1");
    });

    it("pesan beruntun klien baru: pesan pertama tetap memicu notifikasi walau pesan kedua sudah tersimpan", async () => {
      givenMessage("text");
      // Setelah jeda gabung pesan, sudah ada 2 pesan masuk; yang menentukan adalah pesan paling awal.
      db.waMessage.count.mockResolvedValue(2);
      db.waMessage.findFirst.mockResolvedValue({ id: "msg_1" });
      await handleInboundMessage("msg_1");
      expect(notify.notifyNewClient).toHaveBeenCalledWith("conv_1");
      expect(db.waMessage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { conversationId: "conv_1", direction: "INBOUND" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      );
    });

    it("bukan pesan pertama → tanpa notifikasi klien baru", async () => {
      givenMessage("text");
      db.waMessage.findFirst.mockResolvedValue({ id: "msg_0" });
      await handleInboundMessage("msg_1");
      expect(notify.notifyNewClient).not.toHaveBeenCalled();
    });

    it("klien minta admin → notifikasi menunggu admin (hanya jika chat baru pindah dari bot)", async () => {
      givenMessage("text", "admin");
      await handleInboundMessage("msg_1");
      expect(notify.notifyNeedsAdmin).toHaveBeenCalledWith("conv_1", "client_asked");
      vi.clearAllMocks();
      db.waConversation.updateMany.mockResolvedValue({ count: 0 });
      givenMessage("text", "admin");
      await handleInboundMessage("msg_1");
      expect(notify.notifyNeedsAdmin).not.toHaveBeenCalled();
    });

    it("AI gagal → notifikasi menunggu admin", async () => {
      givenMessage("text");
      ai.runAiTurn.mockRejectedValue(new Error("boom"));
      await handleInboundMessage("msg_1");
      expect(notify.notifyNeedsAdmin).toHaveBeenCalledWith("conv_1", "ai_failed");
    });
  });

  describe("owner tes sebagai klien (#klien / #owner)", () => {
    const ownerCtx = { user: { id: "u_owner", name: "Rizal" }, target: "PUBLISH" as const };
    const givenOwnerMessage = (body: string, ownerActsAsClient: boolean) =>
      db.waMessage.findUniqueOrThrow.mockResolvedValue({
        id: "msg_o",
        wamid: "wamid.O",
        type: "text",
        body,
        createdAt: new Date("2026-11-01T10:00:00Z"),
        conversation: { id: "conv_o", waId: "6289700000000", mode: "BOT", isSandbox: false, ownerActsAsClient },
      });
    beforeEach(() => owner.resolveOwner.mockResolvedValue(ownerCtx));

    it("#klien → mode klien aktif, chat kembali ke bot, konfirmasi dikirim", async () => {
      givenOwnerMessage("#Klien", false);
      await handleInboundMessage("msg_o");
      expect(db.waConversation.update).toHaveBeenCalledWith({ where: { id: "conv_o" }, data: { ownerActsAsClient: true, mode: "BOT" } });
      expect(sentBodies()).toEqual([BOT_REPLIES.ownerClientModeOn]);
      expect(owner.handleOwnerMessage).not.toHaveBeenCalled();
    });

    it("mode klien: pesan owner dilayani alur klien (AI), bukan instruksi owner", async () => {
      givenOwnerMessage("mau bikin logo", true);
      await handleInboundMessage("msg_o");
      expect(owner.handleOwnerMessage).not.toHaveBeenCalled();
      expect(ai.runAiTurn).toHaveBeenCalled();
    });

    it("mode klien tetap jalan saat balas otomatis nonaktif", async () => {
      givenOwnerMessage("mau bikin logo", true);
      db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: false });
      await handleInboundMessage("msg_o");
      expect(ai.runAiTurn).toHaveBeenCalled();
    });

    it("#owner dari mode klien → kembali ke instruksi", async () => {
      givenOwnerMessage(" #owner ", true);
      await handleInboundMessage("msg_o");
      expect(db.waConversation.update).toHaveBeenCalledWith({ where: { id: "conv_o" }, data: { ownerActsAsClient: false } });
      expect(sentBodies()).toEqual([BOT_REPLIES.ownerClientModeOff]);
      expect(ai.runAiTurn).not.toHaveBeenCalled();
    });

    it("mode owner (default): instruksi owner seperti biasa", async () => {
      givenOwnerMessage("tambah diskon 5 pcs", false);
      await handleInboundMessage("msg_o");
      expect(owner.handleOwnerMessage).toHaveBeenCalled();
      expect(ai.runAiTurn).not.toHaveBeenCalled();
    });
  });

  describe("perlindungan spam (docs/WHATSAPP_SPAM_GUARD.md)", () => {
    it("nomor diblokir → tidak dibaca, tidak dibalas, tanpa AI", async () => {
      db.waMessage.findUniqueOrThrow.mockResolvedValue({
        id: "msg_1",
        wamid: "wamid.IN",
        type: "text",
        body: "halo",
        createdAt: new Date("2026-11-01T10:00:00Z"),
        conversation: { id: "conv_1", waId: "6281234567890", mode: "BOT", blockedAt: new Date() },
      });
      await handleInboundMessage("msg_1");
      expect(api.markAsRead).not.toHaveBeenCalled();
      expect(api.sendText).not.toHaveBeenCalled();
      expect(ai.runAiTurn).not.toHaveBeenCalled();
    });

    it("rem bulanan aktif → satu pesan, mode HUMAN, owner diberi tahu, tanpa AI", async () => {
      givenMessage("text");
      guard.getMonthlyBrake.mockResolvedValue({ cap: 2000, used: 2000, active: true, month: "2026-11" });
      await handleInboundMessage("msg_1");
      expect(sentBodies()).toEqual([BOT_REPLIES.monthlyCap]);
      expect(humanModeSet()).toBe(true);
      expect(guard.notifyOwnersBrakeOnce).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
      expect(ai.runAiTurn).not.toHaveBeenCalled();
    });

    it.each(["AWAITING_QUOTE", "DP_REVIEW"])("basa-basi saat %s → tidak dibalas, tanpa AI", async (status) => {
      givenMessage("text", "ok makasih kak 🙏");
      tools.findActiveIntake.mockResolvedValue({ id: "i1", status, createdAt: new Date() });
      await handleInboundMessage("msg_1");
      expect(ai.runAiTurn).not.toHaveBeenCalled();
      expect(api.sendText).not.toHaveBeenCalled();
    });

    it("basa-basi setelah order jadi project → tidak dibalas", async () => {
      givenMessage("text", "makasih");
      tools.findActiveIntake.mockResolvedValue(null);
      db.waIntake.findFirst.mockResolvedValue({ status: "APPROVED" });
      await handleInboundMessage("msg_1");
      expect(ai.runAiTurn).not.toHaveBeenCalled();
    });

    it.each(["COLLECTING", "QUOTED"])("'ok' saat %s tetap diproses AI (bisa berarti setuju)", async (status) => {
      givenMessage("text", "ok");
      tools.findActiveIntake.mockResolvedValue({ id: "i1", status, createdAt: new Date() });
      await handleInboundMessage("msg_1");
      expect(ai.runAiTurn).toHaveBeenCalled();
    });

    it("pertanyaan setelah brief tetap dijawab", async () => {
      givenMessage("text", "ok, kapan jadinya?");
      tools.findActiveIntake.mockResolvedValue({ id: "i1", status: "AWAITING_QUOTE", createdAt: new Date() });
      await handleInboundMessage("msg_1");
      expect(ai.runAiTurn).toHaveBeenCalled();
    });
  });

  it("kode layanan internal dibuang dari balasan", async () => {
    givenMessage("text");
    aiReply("Siap kak, order *Logo Minimalis* (SVC-01) sudah dimulai. Nama brandnya apa?");
    await handleInboundMessage("msg_1");
    expect(sentBodies()).toEqual(["Siap kak, order *Logo Minimalis* sudah dimulai. Nama brandnya apa?"]);
  });

  it("gagal kirim → OUTBOUND failed dengan errorCode", async () => {
    givenMessage("text");
    api.sendText.mockRejectedValue(new WhatsAppApiError(400, "131047"));
    await handleInboundMessage("msg_1");
    const data = db.waMessage.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ direction: "OUTBOUND", deliveryStatus: "failed", errorCode: "131047" });
    expect(data.wamid).toBeUndefined();
  });
});

describe("handleInboundMessage — Uji bot (sandbox)", () => {
  function givenSandboxMessage(body = "halo") {
    db.waMessage.findUniqueOrThrow.mockResolvedValue({
      id: "msg_s",
      wamid: null,
      type: "text",
      body,
      createdAt: new Date("2026-11-01T10:00:00Z"),
      conversation: { id: "conv_s", waId: "sandbox:u_owner", mode: "BOT", isSandbox: true },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    owner.resolveOwner.mockResolvedValue(null);
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: false });
    db.waMessage.count.mockResolvedValue(0);
    aiReply("Halo kak, mau desain apa?");
    limits.botReplyLimitReached.mockResolvedValue(false);
  });

  it("bot nonaktif tetap membalas; balasan disimpan, tidak dikirim ke WhatsApp", async () => {
    givenSandboxMessage();
    await handleInboundMessage("msg_s");
    expect(ai.runAiTurn).toHaveBeenCalled();
    expect(api.sendText).not.toHaveBeenCalled();
    expect(api.markAsRead).not.toHaveBeenCalled();
    expect(db.waMessage.create).toHaveBeenCalledWith({
      data: {
        conversationId: "conv_s",
        direction: "OUTBOUND",
        body: "Halo kak, mau desain apa?",
        sentByBot: true,
        deliveryStatus: "sandbox",
      },
    });
  });

  it("tanpa batas banjir pesan; batas harga tetap berlaku", async () => {
    givenSandboxMessage("berapa harganya?");
    aiReply("Harga logo Rp1.500.000 ya kak. Ada lagi?", "COLLECTING");
    await handleInboundMessage("msg_s");
    expect(limits.checkInboundRate).not.toHaveBeenCalled();
    const body = db.waMessage.create.mock.calls[0][0].data.body as string;
    expect(body).not.toContain("1.500.000");
  });

  it("kata kunci admin → mode HUMAN, balasan handoff tersimpan", async () => {
    givenSandboxMessage("admin");
    await handleInboundMessage("msg_s");
    expect(humanModeSet()).toBe(true);
    expect(db.waMessage.create.mock.calls[0][0].data.body).toBe(BOT_REPLIES.handoff);
    expect(api.sendText).not.toHaveBeenCalled();
  });
});

describe("handleInboundMessage — nomor owner (docs/WHATSAPP_OWNER_COMMANDS.md §3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.studioSettings.findUnique.mockResolvedValue({ waBotEnabled: false });
    owner.resolveOwner.mockResolvedValue({ user: { id: "u_owner", name: "Rizal" }, target: "PUBLISH" });
  });

  it("pesan owner → alur owner, walau bot nonaktif; alur klien tidak jalan", async () => {
    givenMessage("text", "kasih diskon 50rb");
    await handleInboundMessage("msg_1");
    expect(owner.handleOwnerMessage).toHaveBeenCalled();
    expect(ai.runAiTurn).not.toHaveBeenCalled();
    expect(limits.checkInboundRate).not.toHaveBeenCalled();
    expect(api.markAsRead).toHaveBeenCalledWith("wamid.IN");
  });
});
