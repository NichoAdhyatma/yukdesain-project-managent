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
    waConversation: { update: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  d.$transaction.mockImplementation(async (fn: (tx: typeof d) => unknown) => fn(d));
  return d;
});
const storage = vi.hoisted(() => ({ copyToPublicBucket: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/storage", () => storage);
vi.mock("../env", () => ({ getWhatsAppEnv: () => ({ STORAGE_PRIVATE_BUCKET: "private-bucket" }) }));
const media = vi.hoisted(() => ({
  movePrivateMedia: vi.fn(),
  readPrivateMedia: vi.fn(),
  mimeFromStorageKey: (k: string) => (k.endsWith(".png") ? "image/png" : "image/jpeg"),
}));
vi.mock("../media", () => media);
vi.mock("./ai-config", () => ({ getAiConfig: async () => ({ extractionModel: "x", baseUrl: "https://x" }) }));
const extraction = vi.hoisted(() => ({ extractPaymentProof: vi.fn() }));
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
});

describe("definisi tool", () => {
  it("tidak ada tool yang bisa mengubah harga, status DP, atau project", () => {
    const names = INTAKE_TOOLS.map((t) => t.name);
    expect(names).toEqual([
      "list_services",
      "start_intake",
      "update_brief_draft",
      "attach_image_to_brief",
      "set_client_profile",
      "confirm_brief",
      "submit_payment_proof",
      "cancel_intake",
      "request_human_handoff",
    ]);
    for (const t of INTAKE_TOOLS) {
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

describe("list_services", () => {
  it("hanya layanan aktif yang punya konfigurasi brief, tanpa harga", async () => {
    db.service.findMany.mockResolvedValue([
      { code: "SVC-01", name: "Logo Minimalis", description: null, outputFormat: "PNG" },
      { code: "SVC-99", name: "Layanan Lain", description: null, outputFormat: null },
    ]);
    const r = await run("list_services", {});
    expect(r.data.services.map((s: { code: string }) => s.code)).toEqual(["SVC-01"]);
    expect(db.service.findMany.mock.calls[0][0].select).not.toHaveProperty("price");
  });
});

describe("start_intake", () => {
  beforeEach(() => db.service.findFirst.mockResolvedValue(logoService));

  it("belum ada intake aktif → buat COLLECTING, dengan kunci baris percakapan", async () => {
    db.waIntake.findFirst.mockResolvedValue(null);
    db.waIntake.create.mockResolvedValue({ id: "in_new" });
    const r = await run("start_intake", { service_code: "SVC-01" });
    expect(r.data).toMatchObject({ started: true, intakeId: "in_new" });
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
    expect(db.waConversation.update).toHaveBeenCalledWith({ where: { id: "conv_1" }, data: { mode: "HUMAN" } });
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
    expect(db.waConversation.update).toHaveBeenCalledWith({ where: { id: "conv_1" }, data: { mode: "HUMAN" } });
    expect(db.paymentProof.create).not.toHaveBeenCalled();
  });
});
