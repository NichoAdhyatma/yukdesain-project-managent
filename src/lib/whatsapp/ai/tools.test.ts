import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const d = {
    service: { findMany: vi.fn(), findFirst: vi.fn() },
    waIntake: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    waMessage: { findFirst: vi.fn(), update: vi.fn() },
    paymentProof: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    paymentAccount: { findMany: vi.fn() },
    waLookupAttempt: { count: vi.fn(), create: vi.fn() },
    waConversation: { update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    waOwnerQuery: { update: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  d.$transaction.mockImplementation(async (fn: (tx: typeof d) => unknown) => fn(d));
  return d;
});
const storage = vi.hoisted(() => ({ copyToPublicBucket: vi.fn() }));

const briefNotes = vi.hoisted(() => ({ addClientBriefNote: vi.fn() }));
vi.mock("../brief-notes", () => briefNotes);
vi.mock("@/lib/notifications/owner-events", () => ({ notifyNeedsQuote: vi.fn(), notifyDpProof: vi.fn(), notifyNeedsAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/storage", () => storage);
vi.mock("../env", () => ({ getWhatsAppEnv: () => ({ STORAGE_PRIVATE_BUCKET: "private-bucket" }), getPrivateBucket: () => "private-bucket" }));
const media = vi.hoisted(() => ({
  movePrivateMedia: vi.fn(),
  readPrivateMedia: vi.fn(),
  mimeFromStorageKey: (k: string) => (k.endsWith(".png") ? "image/png" : "image/jpeg"),
}));
vi.mock("../media", () => media);
vi.mock("./ai-config", () => ({ getAiTargets: async () => ({ proof: { providerKey: "env:ANTHROPIC", model: "x" } }) }));
const extraction = vi.hoisted(() => ({ extractPaymentProof: vi.fn() }));
const dto = vi.hoisted(() => ({ getClientProjectSummaries: vi.fn(), getProjectDetailByCode: vi.fn() }));
vi.mock("./client-safe-dto", () => dto);
const phoneLookup = vi.hoisted(() => ({ findClientsByPhone: vi.fn() }));
vi.mock("@/lib/clients/find-by-phone", () => phoneLookup);
vi.mock("@/lib/studio", () => ({
  getStudioSettings: async () => ({ name: "YukDesain Studio", email: "hello@x", phone: "0812", address: "Jakarta", logoUrl: "l", tagline: "t" }),
}));
const owners = vi.hoisted(() => ({ listOwnerNumbers: vi.fn() }));

vi.mock("../owner/identity", () => owners);
const queryStore = vi.hoisted(() => ({ findPendingQuery: vi.fn(), createOwnerQuery: vi.fn(), notifyOwners: vi.fn() }));
vi.mock("../owner/query-store", () => queryStore);
const guides = vi.hoisted(() => ({ getDraftGuide: vi.fn(), getPublishedGuide: vi.fn() }));
vi.mock("./bot-guide", () => guides);
vi.mock("./extract-payment-proof", async (orig) => ({
  ...(await orig<typeof import("./extract-payment-proof")>()),
  extractPaymentProof: extraction.extractPaymentProof,
}));

import { INTAKE_TOOLS, executeTool } from "./tools";

const ctx = { conversationId: "conv_1" };
const run = async (name: string, input: unknown) => {
  const r = await executeTool(name, input, ctx);
  return { ...r, data: JSON.parse(r.content) };
};

const logoService = { id: "svc_logo", code: "SVC-01", name: "Logo Minimalis" };
const activeIntake = (over: Record<string, unknown> = {}) => ({
  id: "in_1",
  status: "COLLECTING",
  briefDraft: {},
  service: { id: "svc_logo", code: "SVC-01" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.waIntake.updateMany.mockResolvedValue({ count: 1 });
  db.waConversation.updateMany.mockResolvedValue({ count: 1 });
});

describe("definisi tool", () => {
  it("tidak ada tool penulis yang bisa mengubah harga, status DP, atau project", () => {
    const names = INTAKE_TOOLS.map((t) => t.name);
    expect(names).toEqual([
      "list_services",
      "start_intake",
      "update_brief_draft",
      // Tambahan brief setelah brief dikunci: hanya menambah catatan teks, tidak mengubah harga/status.
      "add_brief_note",
      "attach_image_to_brief",
      "set_client_profile",
      "confirm_brief",
      "submit_payment_proof",
      "cancel_intake",
      "get_my_projects",
      "get_project_by_code",
      "get_studio_info",
      // Hanya menghitung dari katalog (server), tidak menulis apa pun.
      "calculate_price",
      // Menulis catatan untuk tim (pertanyaan ke owner, aturan harga yang dijanjikan), bukan harga/status.
      "ask_owner",
      "apply_pricing_rule",
      "request_human_handoff",
    ]);
    // Tool penulis tidak punya input untuk harga/deadline/project/nominal.
    // Tool get_* hanya membaca (diuji di "status project (read-only)").
    for (const t of INTAKE_TOOLS.filter((tool) => !tool.name.startsWith("get_"))) {
      expect(JSON.stringify(t.input_schema)).not.toMatch(/price|harga|deadline|project|amount/i);
    }
  });
});

describe("executeTool", () => {
  it("tool tidak dikenal → error ke model", async () => {
    expect(await run("approve_dp", {})).toMatchObject({ isError: true });
  });

  it("input tidak valid → error ke model, handler tidak jalan", async () => {
    const r = await run("start_intake", { service_code: 42 });
    expect(r.isError).toBe(true);
    expect(db.service.findFirst).not.toHaveBeenCalled();
  });
});

describe("calculate_price (spec §4.2)", () => {
  const posterRow = {
    code: "SVC-08",
    name: "Poster Menu",
    description: null,
    outputFormat: null,
    startingPrice: 135000,
    priceNote: null,
    suitableFor: null,
    botNotes: null,
    priceMode: "FIXED",
    packages: null,
    unitPricing: { unitLabel: "item", includedUnits: 35, extraUnitPrice: 5000, minUnits: null },
    estimate: "3 hari",
  };

  it("menghitung dari katalog aktif dan mencatat total untuk penjaga harga", async () => {
    db.service.findFirst.mockResolvedValue(posterRow);
    const turn = { conversationId: "conv_1", calculatedTotals: [] as number[] };
    const r = await executeTool("calculate_price", { service_code: "SVC-08", units: 40 }, turn);
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.content)).toMatchObject({ total: 160000, priceMode: "FIXED" });
    expect(db.service.findFirst.mock.calls[0][0].where).toEqual({ code: "SVC-08", isActive: true });
    expect(turn.calculatedTotals).toEqual([160000]);
  });

  it("kesalahan kalkulator dikembalikan ke model, tidak dicatat", async () => {
    db.service.findFirst.mockResolvedValue(posterRow);
    const turn = { conversationId: "conv_1", calculatedTotals: [] as number[] };
    const r = await executeTool("calculate_price", { service_code: "SVC-08", units: 2.5 }, turn);
    expect(r.isError).toBe(true);
    expect(turn.calculatedTotals).toEqual([]);
  });

  it("layanan tidak dikenal / tanpa konfigurasi brief ditolak", async () => {
    db.service.findFirst.mockResolvedValue(null);
    expect(await run("calculate_price", { service_code: "SVC-77" })).toMatchObject({ isError: true });
  });
});

describe("list_services", () => {
  it("hanya layanan aktif yang punya konfigurasi brief, dengan harga mulai tapi tanpa catatan bot", async () => {
    db.service.findMany.mockResolvedValue([
      { code: "SVC-01", name: "Logo Minimalis", description: null, outputFormat: "PNG", startingPrice: 150000, priceNote: null, suitableFor: "brand modern" },
      { code: "SVC-99", name: "Layanan Lain", description: null, outputFormat: null, startingPrice: null, priceNote: null, suitableFor: null },
    ]);
    const r = await run("list_services", {});
    expect(r.data.services.map((s: { code: string }) => s.code)).toEqual(["SVC-01"]);
    const select = db.service.findMany.mock.calls[0][0].select;
    expect(select).toMatchObject({ startingPrice: true, priceNote: true, suitableFor: true, outputFormat: true });
    expect(select).not.toHaveProperty("botNotes");
  });
});

describe("start_intake", () => {
  beforeEach(() => db.service.findFirst.mockResolvedValue(logoService));

  it("belum ada intake aktif → buat COLLECTING, dengan kunci baris percakapan", async () => {
    db.waIntake.findFirst.mockResolvedValue(null);
    db.waIntake.create.mockResolvedValue({ id: "in_new" });
    const r = await run("start_intake", { service_code: "SVC-01" });
    expect(r.data).toMatchObject({ started: true, intakeId: "in_new" });
    // Gambar yang sudah dikirim sebelum order dibuat bisa langsung dimasukkan di giliran yang sama (kasus Yeni).
    expect(r.data).toMatchObject({ imageTargets: ["reference_items_json"] });
    expect(JSON.stringify(r.data)).toContain("attach_image_to_brief");
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.waIntake.create).toHaveBeenCalledWith({
      data: { conversationId: "conv_1", serviceId: "svc_logo" },
      select: { id: true },
    });
  });

  it("layanan tidak dikenal → error", async () => {
    db.service.findFirst.mockResolvedValue(null);
    expect((await run("start_intake", { service_code: "SVC-77" })).isError).toBe(true);
  });

  it("intake aktif di luar COLLECTING → tidak bisa diganti", async () => {
    db.waIntake.findFirst.mockResolvedValue(activeIntake({ status: "QUOTED", service: { id: "x", code: "SVC-03" } }));
    const r = await run("start_intake", { service_code: "SVC-01" });
    expect(r).toMatchObject({ isError: true, data: { status: "QUOTED" } });
    expect(db.waIntake.create).not.toHaveBeenCalled();
  });

  it("ganti layanan dengan brief terisi → minta konfirmasi dulu", async () => {
    db.waIntake.findFirst.mockResolvedValue(
      activeIntake({ briefDraft: { main_text: "x" }, service: { id: "svc_poster", code: "SVC-03" } }),
    );
    const r = await run("start_intake", { service_code: "SVC-01" });
    expect(r.data.needsConfirmation).toBe(true);
    expect(db.waIntake.updateMany).not.toHaveBeenCalled();
  });

  it("ganti layanan setelah konfirmasi → brief dikosongkan", async () => {
    db.waIntake.findFirst.mockResolvedValue(
      activeIntake({ briefDraft: { main_text: "x" }, service: { id: "svc_poster", code: "SVC-03" } }),
    );
    const r = await run("start_intake", { service_code: "SVC-01", confirm_reset: true });
    expect(r.data.serviceChanged).toBe(true);
    expect(db.waIntake.updateMany).toHaveBeenCalledWith({
      where: { id: "in_1", status: "COLLECTING" },
      data: { serviceId: "svc_logo", briefDraft: {} },
    });
  });

  it("layanan sama → tidak berubah", async () => {
    db.waIntake.findFirst.mockResolvedValue(activeIntake());
    expect((await run("start_intake", { service_code: "SVC-01" })).data.unchanged).toBe(true);
  });
});

describe("attach_image_to_brief", () => {
  beforeEach(() => {
    db.waIntake.findFirst.mockResolvedValue(activeIntake());
    db.waMessage.findFirst.mockResolvedValue({ id: "msg_img", mediaStorageKey: "wa-media/conv_1/abc.png" });
    storage.copyToPublicBucket.mockResolvedValue("https://pub.r2.dev/wa-intake/in_1/msg_img.png");
    db.waIntake.findUnique.mockResolvedValue({
      ...activeIntake(),
      updatedAt: new Date(),
    });
  });

  it("menyalin ke bucket publik dan menulis item dengan bentuk ServiceBriefForm", async () => {
    const r = await run("attach_image_to_brief", { message_id: "msg_img", target: "reference_items_json", caption: "logo lama" });
    expect(r.isError).toBe(false);
    expect(storage.copyToPublicBucket).toHaveBeenCalledWith(
      "private-bucket",
      "wa-media/conv_1/abc.png",
      "wa-intake/in_1/msg_img.png",
      "image/png",
    );
    expect(db.waIntake.updateMany.mock.calls[0][0].data.briefDraft).toEqual({
      reference_items_json: [
        { id: "wa-msg_img", type: "image", url: "https://pub.r2.dev/wa-intake/in_1/msg_img.png", caption: "logo lama" },
      ],
    });
  });

  it("hanya gambar milik percakapan ini", async () => {
    await run("attach_image_to_brief", { message_id: "msg_img", target: "reference_items_json", caption: "x" });
    expect(db.waMessage.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "msg_img",
      conversationId: "conv_1",
      direction: "INBOUND",
      type: "image",
    });
    db.waMessage.findFirst.mockResolvedValue(null);
    const r = await run("attach_image_to_brief", { message_id: "msg_lain", target: "reference_items_json", caption: "x" });
    expect(r.isError).toBe(true);
    expect(storage.copyToPublicBucket).toHaveBeenCalledTimes(1);
  });

  it("target tidak berlaku untuk layanan → error dengan daftar target", async () => {
    const r = await run("attach_image_to_brief", { message_id: "msg_img", target: "logos_json", caption: "x" });
    expect(r).toMatchObject({ isError: true, data: { validTargets: ["reference_items_json"] } });
  });

  it("gambar yang sama tidak ditambahkan dua kali", async () => {
    db.waIntake.findFirst.mockResolvedValue(
      activeIntake({ briefDraft: { reference_items_json: [{ id: "wa-msg_img", type: "image", url: "u" }] } }),
    );
    const r = await run("attach_image_to_brief", { message_id: "msg_img", target: "reference_items_json", caption: "x" });
    expect(r.data.alreadyAttached).toBe(true);
    expect(storage.copyToPublicBucket).not.toHaveBeenCalled();
  });

  const U = "https://pub.r2.dev/wa-intake/in_1/msg_img.png";
  it.each([
    ["SVC-03", "logos_json", { url: U, caption: "C" }],
    ["SVC-07", "box_references_json", { id: "wa-msg_img", description: "C", imageUrl: U }],
    ["SVC-11", "cart_references_json", { id: "wa-msg_img", imageUrl: U, description: "C" }],
  ])("%s → %s memakai bentuk item form", async (code, target, item) => {
    db.waIntake.findFirst.mockResolvedValue(activeIntake({ service: { id: "s", code } }));
    db.waIntake.findUnique.mockResolvedValue({ ...activeIntake({ service: { code } }), updatedAt: new Date() });
    const r = await run("attach_image_to_brief", { message_id: "msg_img", target, caption: "C" });
    expect(r.isError).toBe(false);
    expect(db.waIntake.updateMany.mock.calls[0][0].data.briefDraft).toEqual({ [target]: [item] });
  });

  it("vendor_logo_url diisi string URL", async () => {
    db.waIntake.findFirst.mockResolvedValue(activeIntake({ service: { id: "s", code: "SVC-09" } }));
    db.waIntake.findUnique.mockResolvedValue({ ...activeIntake({ service: { code: "SVC-09" } }), updatedAt: new Date() });
    await run("attach_image_to_brief", { message_id: "msg_img", target: "vendor_logo_url", caption: "logo vendor" });
    expect(db.waIntake.updateMany.mock.calls[0][0].data.briefDraft).toEqual({
      vendor_logo_url: "https://pub.r2.dev/wa-intake/in_1/msg_img.png",
    });
  });
});

describe("tool lain", () => {
  it("update_brief_draft tanpa intake aktif → error", async () => {
    db.waIntake.findFirst.mockResolvedValue(null);
    const r = await run("update_brief_draft", { fields: { brand_name: "A" } });
    expect(r.isError).toBe(true);
  });

  it("set_client_profile menolak email tidak valid", async () => {
    db.waIntake.findFirst.mockResolvedValue(activeIntake());
    expect((await run("set_client_profile", { name: "Budi", email: "bukan-email" })).isError).toBe(true);
    expect((await run("set_client_profile", { name: "Budi", email: "" })).isError).toBe(false);
    expect(db.waIntake.update).toHaveBeenLastCalledWith({
      where: { id: "in_1" },
      data: { clientName: "Budi", clientEmail: null },
    });
  });

  it("cancel_intake saat DP_REVIEW → ditolak (AI tidak boleh)", async () => {
    db.waIntake.findFirst.mockResolvedValue(activeIntake({ status: "DP_REVIEW" }));
    const r = await run("cancel_intake", { reason: "batal" });
    expect(r.isError).toBe(true);
    expect(db.waIntake.updateMany).not.toHaveBeenCalled();
  });

  it("request_human_handoff → mode HUMAN", async () => {
    await run("request_human_handoff", { reason: "minta diskon" });
    expect(db.waConversation.updateMany).toHaveBeenCalledWith({ where: { id: "conv_1", mode: "BOT" }, data: { mode: "HUMAN" } });
  });
});

describe("submit_payment_proof", () => {
  const receipt = {
    isTransferReceipt: true,
    amount: 750000,
    transferDate: "2026-11-02",
    senderName: "SARI",
    recipientName: "YUKDESAIN STUDIO",
    recipientAccount: "1234567890",
    bankOrWallet: "BCA",
    referenceNo: "TRX1",
    readability: "clear",
  };

  beforeEach(() => {
    db.waIntake.findFirst.mockResolvedValue(activeIntake({ status: "QUOTED" }));
    db.waMessage.findFirst.mockResolvedValue({ id: "msg_bukti", mediaStorageKey: "wa-media/conv_1/abc.jpg" });
    db.waIntake.findUniqueOrThrow.mockResolvedValue({
      agreedPrice: 1500000,
      dpAmount: 750000,
      quotedAt: new Date("2026-11-01T03:00:00Z"),
      _count: { paymentProofs: 0 },
    });
    db.paymentProof.findFirst.mockResolvedValue(null);
    db.paymentProof.count.mockResolvedValue(0);
    db.paymentAccount.findMany.mockResolvedValue([{ accountNumber: "1234567890", accountHolder: "YukDesain Studio" }]);
    media.readPrivateMedia.mockResolvedValue(Buffer.from("BUKTI"));
    extraction.extractPaymentProof.mockResolvedValue(receipt);
  });

  it("pindah ke payment-proofs/, simpan ekstraksi + flag, status → DP_REVIEW", async () => {
    const r = await run("submit_payment_proof", { message_id: "msg_bukti" });

    expect(r).toMatchObject({ isError: false, data: { status: "DP_REVIEW" } });
    const [from, to] = media.movePrivateMedia.mock.calls[0];
    expect(from).toBe("wa-media/conv_1/abc.jpg");
    expect(to).toMatch(/^payment-proofs\/in_1\/[0-9a-f]{32}\.jpg$/);
    expect(db.waMessage.update).toHaveBeenCalledWith({ where: { id: "msg_bukti" }, data: { mediaStorageKey: to } });

    const created = db.paymentProof.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ intakeId: "in_1", storageKey: to, mimeType: "image/jpeg", aiExtraction: receipt, aiFlags: [] });
    expect(created.imageSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(db.waIntake.updateMany).toHaveBeenCalledWith({
      where: { id: "in_1", status: "QUOTED" },
      data: { status: "DP_REVIEW" },
    });
  });

  it("flag tidak pernah dikirim balik ke model", async () => {
    extraction.extractPaymentProof.mockResolvedValue({ ...receipt, amount: 100000 });
    const r = await run("submit_payment_proof", { message_id: "msg_bukti" });
    expect(db.paymentProof.create.mock.calls[0][0].data.aiFlags).toEqual(["AMOUNT_BELOW_DP", "AMOUNT_MISMATCH"]);
    expect(r.content).not.toMatch(/AMOUNT|flag/i);
  });

  it("ekstraksi gagal → bukti tetap tersimpan dengan UNREADABLE", async () => {
    extraction.extractPaymentProof.mockRejectedValue(new Error("timeout"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await run("submit_payment_proof", { message_id: "msg_bukti" });
    expect(r.isError).toBe(false);
    expect(db.paymentProof.create.mock.calls[0][0].data.aiFlags).toEqual(["UNREADABLE"]);
  });

  it("gambar yang sama dipakai di order lain → DUPLICATE_IMAGE", async () => {
    db.paymentProof.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await run("submit_payment_proof", { message_id: "msg_bukti" });
    expect(db.paymentProof.create.mock.calls[0][0].data.aiFlags).toContain("DUPLICATE_IMAGE");
  });

  it.each(["COLLECTING", "AWAITING_QUOTE"])("status %s → ditolak", async (status) => {
    db.waIntake.findFirst.mockResolvedValue(activeIntake({ status }));
    expect((await run("submit_payment_proof", { message_id: "msg_bukti" })).isError).toBe(true);
    expect(media.movePrivateMedia).not.toHaveBeenCalled();
  });

  it("gambar bukan milik percakapan ini → ditolak", async () => {
    db.waMessage.findFirst.mockResolvedValue(null);
    expect((await run("submit_payment_proof", { message_id: "msg_lain" })).isError).toBe(true);
  });

  it("gambar yang sama dikirim ulang untuk order ini → ditolak", async () => {
    db.paymentProof.findFirst.mockResolvedValue({ id: "proof_lama" });
    expect((await run("submit_payment_proof", { message_id: "msg_bukti" })).isError).toBe(true);
    expect(media.movePrivateMedia).not.toHaveBeenCalled();
  });

  it("sudah 5 bukti → dialihkan ke admin tanpa membuat bukti baru", async () => {
    db.waIntake.findUniqueOrThrow.mockResolvedValue({
      agreedPrice: 1500000,
      dpAmount: 750000,
      quotedAt: new Date(),
      _count: { paymentProofs: 5 },
    });
    const r = await run("submit_payment_proof", { message_id: "msg_bukti" });
    expect(r.data.handedOff).toBe(true);
    expect(db.waConversation.updateMany).toHaveBeenCalledWith({ where: { id: "conv_1", mode: "BOT" }, data: { mode: "HUMAN" } });
    expect(db.paymentProof.create).not.toHaveBeenCalled();
  });
});

describe("status project (read-only)", () => {
  beforeEach(() => {
    db.waConversation.findUniqueOrThrow.mockResolvedValue({ waId: "6281234567890", clientId: null });
    dto.getClientProjectSummaries.mockResolvedValue([{ projectNumber: "PRJ-1" }]);
  });

  it("nomor cocok dengan tepat satu client → ditautkan & daftar project", async () => {
    phoneLookup.findClientsByPhone.mockResolvedValue([{ id: "cli_1", name: "Sari" }]);
    const r = await run("get_my_projects", {});
    expect(r.data).toEqual({ identified: true, projects: [{ projectNumber: "PRJ-1" }] });
    expect(db.waConversation.update).toHaveBeenCalledWith({ where: { id: "conv_1" }, data: { clientId: "cli_1" } });
    expect(dto.getClientProjectSummaries).toHaveBeenCalledWith("cli_1");
  });

  it("nomor cocok dengan lebih dari satu client → tidak dipilih", async () => {
    phoneLookup.findClientsByPhone.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const r = await run("get_my_projects", {});
    expect(r.data.identified).toBe(false);
    expect(dto.getClientProjectSummaries).not.toHaveBeenCalled();
  });

  it("percakapan sudah tertaut → langsung pakai clientId", async () => {
    db.waConversation.findUniqueOrThrow.mockResolvedValue({ waId: "628", clientId: "cli_9" });
    await run("get_my_projects", {});
    expect(phoneLookup.findClientsByPhone).not.toHaveBeenCalled();
    expect(dto.getClientProjectSummaries).toHaveBeenCalledWith("cli_9");
  });

  it("kode benar → detail, percobaan dicatat berhasil", async () => {
    db.waLookupAttempt.count.mockResolvedValue(0);
    dto.getProjectDetailByCode.mockResolvedValue({ projectNumber: "PRJ-1", statusLabel: "Selesai" });
    const r = await run("get_project_by_code", { project_code: "PRJ-1" });
    expect(r.data.project.projectNumber).toBe("PRJ-1");
    expect(db.waLookupAttempt.create).toHaveBeenCalledWith({ data: { conversationId: "conv_1", success: true } });
  });

  it("kode salah → error, percobaan dicatat gagal", async () => {
    db.waLookupAttempt.count.mockResolvedValue(0);
    dto.getProjectDetailByCode.mockResolvedValue(null);
    expect((await run("get_project_by_code", { project_code: "PRJ-X" })).isError).toBe(true);
    expect(db.waLookupAttempt.create).toHaveBeenCalledWith({ data: { conversationId: "conv_1", success: false } });
  });

  it("5 kode salah dalam sejam → ditolak tanpa lookup", async () => {
    db.waLookupAttempt.count.mockResolvedValue(5);
    const r = await run("get_project_by_code", { project_code: "PRJ-1" });
    expect(r.isError).toBe(true);
    expect(dto.getProjectDetailByCode).not.toHaveBeenCalled();
    expect(db.waLookupAttempt.count.mock.calls[0][0].where).toMatchObject({ conversationId: "conv_1", success: false });
  });

  it("tool get_* tidak menulis apa pun selain catatan percobaan lookup", async () => {
    phoneLookup.findClientsByPhone.mockResolvedValue([]);
    db.waLookupAttempt.count.mockResolvedValue(0);
    dto.getProjectDetailByCode.mockResolvedValue(null);
    await run("get_my_projects", {});
    await run("get_project_by_code", { project_code: "X" });
    await run("get_studio_info", {});
    expect(db.waIntake.updateMany).not.toHaveBeenCalled();
    expect(db.waIntake.update).not.toHaveBeenCalled();
    expect(db.paymentProof.create).not.toHaveBeenCalled();
    expect(db.waConversation.update).not.toHaveBeenCalled();
  });

  it("info studio hanya nama, email, telepon, alamat", async () => {
    const r = await run("get_studio_info", {});
    expect(r.data).toEqual({ name: "YukDesain Studio", email: "hello@x", phone: "0812", address: "Jakarta" });
  });
});

describe("ask_owner (docs/WHATSAPP_OWNER_COMMANDS.md §5)", () => {
  beforeEach(() => {
    queryStore.findPendingQuery.mockResolvedValue(null);
    queryStore.createOwnerQuery.mockResolvedValue({ id: "q_1" });
    queryStore.notifyOwners.mockResolvedValue(1);
    owners.listOwnerNumbers.mockResolvedValue([{ id: "u_owner", name: "Rizal", waNumber: "6281111111111" }]);
    db.waIntake.findFirst.mockResolvedValue(activeIntake());
  });

  it("membuat pertanyaan untuk order aktif lalu mengirimnya ke owner", async () => {
    const r = await run("ask_owner", { request: "Desain kemasan sachet kopi, 3 varian" });
    expect(r.isError).toBe(false);
    expect(queryStore.createOwnerQuery).toHaveBeenCalledWith({ conversationId: "conv_1", intakeId: "in_1", question: "Desain kemasan sachet kopi, 3 varian" });
    expect(queryStore.notifyOwners).toHaveBeenCalledWith("q_1");
  });

  it("masih ada pertanyaan menunggu → tidak membuat pertanyaan baru", async () => {
    queryStore.findPendingQuery.mockResolvedValue({ id: "q_0", question: "x" });
    const r = await run("ask_owner", { request: "lagi" });
    expect(r.data.alreadyWaiting).toBe(true);
    expect(queryStore.createOwnerQuery).not.toHaveBeenCalled();
  });

  it("belum ada nomor owner → error, arahkan ke handoff", async () => {
    owners.listOwnerNumbers.mockResolvedValue([]);
    const r = await run("ask_owner", { request: "kemasan" });
    expect(r.isError).toBe(true);
    expect(r.data.error).toContain("request_human_handoff");
  });

  it("gagal terkirim ke semua owner → pertanyaan kedaluwarsa, error", async () => {
    queryStore.notifyOwners.mockResolvedValue(0);
    const r = await run("ask_owner", { request: "kemasan" });
    expect(r.isError).toBe(true);
    expect(db.waOwnerQuery.update).toHaveBeenCalledWith({ where: { id: "q_1" }, data: { status: "EXPIRED" } });
  });

  it("Uji bot: pertanyaan dibuat tanpa dikirim ke WhatsApp, walau nomor owner belum ada", async () => {
    owners.listOwnerNumbers.mockResolvedValue([]);
    const r = await executeTool("ask_owner", { request: "kemasan" }, { conversationId: "conv_s", isSandbox: true });
    expect(r.isError).toBe(false);
    expect(queryStore.notifyOwners).not.toHaveBeenCalled();
  });
});

describe("apply_pricing_rule (docs/WHATSAPP_OWNER_COMMANDS.md §6)", () => {
  const rule = { id: "diskon-5pcs", kind: "DISCOUNT", name: "Diskon >5 pcs", condition: "lebih dari 5 pcs", amountType: "FIXED", amount: 50000, note: "" };

  beforeEach(() => {
    guides.getPublishedGuide.mockResolvedValue({ version: 2, guide: { instructions: "", faqs: [], pricingRules: [rule] } });
    db.waIntake.findFirst.mockResolvedValue(activeIntake({ pricingRulesApplied: [] }));
  });

  it("mencatat snapshot aturan di order", async () => {
    const r = await run("apply_pricing_rule", { rule_id: "diskon-5pcs", note: "klien pesan 8 desain" });
    expect(r.isError).toBe(false);
    expect(db.waIntake.update).toHaveBeenCalledWith({
      where: { id: "in_1" },
      data: {
        pricingRulesApplied: [
          { ruleId: "diskon-5pcs", kind: "DISCOUNT", name: "Diskon >5 pcs", condition: "lebih dari 5 pcs", amountType: "FIXED", amount: 50000, note: "klien pesan 8 desain" },
        ],
      },
    });
  });

  it("remove=true menghapus aturan dari order", async () => {
    db.waIntake.findFirst.mockResolvedValue(activeIntake({ pricingRulesApplied: [{ ruleId: "diskon-5pcs", name: "Diskon >5 pcs" }] }));
    await run("apply_pricing_rule", { rule_id: "diskon-5pcs", remove: true });
    expect(db.waIntake.update.mock.calls[0][0].data.pricingRulesApplied).toEqual([]);
  });

  it("aturan tidak ada di panduan terbit → error", async () => {
    const r = await run("apply_pricing_rule", { rule_id: "express" });
    expect(r.isError).toBe(true);
    expect(db.waIntake.update).not.toHaveBeenCalled();
  });

  it("setelah penawaran dikirim → ditolak", async () => {
    db.waIntake.findFirst.mockResolvedValue(activeIntake({ status: "QUOTED", pricingRulesApplied: [] }));
    const r = await run("apply_pricing_rule", { rule_id: "diskon-5pcs" });
    expect(r.isError).toBe(true);
  });

  it("Uji bot memakai aturan dari draft", async () => {
    guides.getDraftGuide.mockResolvedValue({ instructions: "", faqs: [], pricingRules: [{ ...rule, id: "express" }] });
    const r = await executeTool("apply_pricing_rule", { rule_id: "express" }, { conversationId: "conv_s", isSandbox: true });
    expect(r.isError).toBe(false);
    expect(guides.getPublishedGuide).not.toHaveBeenCalled();
  });
});

describe("ask_owner: cakupan dari Panduan produksi v27 (2026-11-12)", () => {
  it("dipakai juga untuk rekomendasi konsep dan status order lama di luar sistem", () => {
    const tool = INTAKE_TOOLS.find((t) => t.name === "ask_owner")!;
    expect(tool.description).toContain("rekomendasi konsep");
    expect(tool.description).toContain("order lama");
  });
});

describe("add_brief_note (kasus Alfa Indah 2026-11-12)", () => {
  it("mencatat tambahan brief tanpa mengalihkan chat ke admin", async () => {
    briefNotes.addClientBriefNote.mockResolvedValue({ ok: true, target: "ORDER" });
    const out = await executeTool("add_brief_note", { note: "Di sebelah rasa ada harga 12k" }, { conversationId: "conv_1" });
    expect(out.isError).toBe(false);
    expect(briefNotes.addClientBriefNote).toHaveBeenCalledWith("conv_1", "Di sebelah rasa ada harga 12k");
    expect(db.waConversation.updateMany).not.toHaveBeenCalled();
  });

  it("tidak ada order/project yang bisa diberi catatan → error ke model", async () => {
    briefNotes.addClientBriefNote.mockResolvedValue({ ok: false, error: "Tidak ada order" });
    expect((await executeTool("add_brief_note", { note: "x" }, { conversationId: "conv_1" })).isError).toBe(true);
  });
});
