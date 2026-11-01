import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());
vi.mock("./ai-config", () => ({ getAnthropicClient: () => ({ messages: { create } }) }));

import { computeProofFlags, extractPaymentProof, normalizeReference, type PaymentExtraction } from "./extract-payment-proof";

const config = { model: "m", extractionModel: "claude-sonnet-5-5", baseUrl: "https://x", maxTokens: 800 };
const image = { data: Buffer.from("IMG"), mimeType: "image/jpeg" as const };

const good: PaymentExtraction = {
  isTransferReceipt: true,
  amount: 1250000,
  transferDate: "2026-11-02T10:15",
  senderName: "BUDI SANTOSO",
  recipientName: "YUKDESAIN STUDIO",
  recipientAccount: "1234567890",
  bankOrWallet: "BCA",
  referenceNo: "TRX 123 ABC",
  readability: "clear",
};

describe("extractPaymentProof", () => {
  beforeEach(() => vi.clearAllMocks());

  it("memakai model ekstraksi, gambar base64, tool_choice auto", async () => {
    create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", name: "record_transfer_receipt", input: good }],
    });
    const r = await extractPaymentProof(image, config);
    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-sonnet-5-5");
    expect(req.tool_choice).toEqual({ type: "auto" });
    expect(req.messages[0].content[0]).toMatchObject({ type: "image", source: { data: Buffer.from("IMG").toString("base64") } });
    expect(r).toEqual({ ...good, referenceNo: "TRX123ABC" });
  });

  it("tanpa tool call → null", async () => {
    create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "ini bukti transfer" }] });
    expect(await extractPaymentProof(image, config)).toBeNull();
  });

  it("input tidak sesuai skema → null", async () => {
    create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", name: "record_transfer_receipt", input: { ...good, amount: "satu juta" } }],
    });
    expect(await extractPaymentProof(image, config)).toBeNull();
  });

  it("refusal → null", async () => {
    create.mockResolvedValue({ stop_reason: "refusal", content: [] });
    expect(await extractPaymentProof(image, config)).toBeNull();
  });

  it("string kosong menjadi null", async () => {
    create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", name: "record_transfer_receipt", input: { ...good, senderName: "  ", referenceNo: "" } }],
    });
    expect(await extractPaymentProof(image, config)).toMatchObject({ senderName: null, referenceNo: null });
  });
});

describe("normalizeReference", () => {
  it("hapus spasi, huruf besar", () => {
    expect(normalizeReference(" trx 12 ab ")).toBe("TRX12AB");
    expect(normalizeReference("  ")).toBeNull();
    expect(normalizeReference(null)).toBeNull();
  });
});

describe("computeProofFlags", () => {
  const ctx = {
    dpAmount: 1250000,
    agreedPrice: 2500000,
    quotedAt: new Date("2026-11-01T03:00:00Z"), // 1 Nov 10:00 WIB
    paymentAccounts: [{ accountNumber: "123-456-7890", accountHolder: "YukDesain Studio" }],
    duplicateImage: false,
    duplicateReference: false,
  };

  it("bukti sesuai → tanpa flag", () => {
    expect(computeProofFlags(good, ctx)).toEqual([]);
  });

  it("bayar lunas (nominal = harga) tidak dianggap mismatch", () => {
    expect(computeProofFlags({ ...good, amount: 2500000 }, ctx)).toEqual([]);
  });

  it.each([
    ["NOT_A_RECEIPT", { isTransferReceipt: false }],
    ["UNREADABLE", { readability: "partial" as const }],
    ["UNREADABLE", { readability: "unreadable" as const }],
  ])("%s", (flag, patch) => {
    expect(computeProofFlags({ ...good, ...patch }, ctx)).toContain(flag);
  });

  it("nominal kurang dari DP → AMOUNT_BELOW_DP + AMOUNT_MISMATCH", () => {
    expect(computeProofFlags({ ...good, amount: 1000000 }, ctx)).toEqual(["AMOUNT_BELOW_DP", "AMOUNT_MISMATCH"]);
  });

  it("nominal di antara DP dan harga → AMOUNT_MISMATCH saja", () => {
    expect(computeProofFlags({ ...good, amount: 1500000 }, ctx)).toEqual(["AMOUNT_MISMATCH"]);
  });

  it("rekening & nama penerima bukan milik studio → RECIPIENT_NOT_STUDIO", () => {
    expect(computeProofFlags({ ...good, recipientAccount: "9999999999", recipientName: "ORANG LAIN" }, ctx)).toEqual([
      "RECIPIENT_NOT_STUDIO",
    ]);
  });

  it("penerima cocok lewat nomor tersamar (4 digit akhir) atau nama saja", () => {
    expect(computeProofFlags({ ...good, recipientAccount: "****7890", recipientName: null }, ctx)).toEqual([]);
    expect(computeProofFlags({ ...good, recipientAccount: null, recipientName: "yukdesain  studio" }, ctx)).toEqual([]);
  });

  it("penerima tidak terbaca sama sekali → RECIPIENT_NOT_STUDIO", () => {
    expect(computeProofFlags({ ...good, recipientAccount: null, recipientName: null }, ctx)).toContain("RECIPIENT_NOT_STUDIO");
  });

  it("transfer sebelum tanggal penawaran (WIB) → DATE_BEFORE_QUOTE", () => {
    expect(computeProofFlags({ ...good, transferDate: "2026-10-31" }, ctx)).toEqual(["DATE_BEFORE_QUOTE"]);
    expect(computeProofFlags({ ...good, transferDate: "2026-10-31T23:59" }, ctx)).toEqual(["DATE_BEFORE_QUOTE"]);
  });

  it("hari yang sama dengan penawaran → tidak di-flag", () => {
    expect(computeProofFlags({ ...good, transferDate: "2026-11-01T08:00" }, ctx)).toEqual([]);
    // 31 Okt 20:00 UTC = 1 Nov 03:00 WIB
    expect(computeProofFlags({ ...good, transferDate: "2026-10-31T20:00:00Z" }, ctx)).toEqual([]);
  });

  it("duplikat gambar & referensi", () => {
    expect(computeProofFlags(good, { ...ctx, duplicateImage: true, duplicateReference: true })).toEqual([
      "DUPLICATE_IMAGE",
      "DUPLICATE_REFERENCE",
    ]);
  });

  it("ekstraksi gagal → UNREADABLE (+ duplikat)", () => {
    expect(computeProofFlags(null, ctx)).toEqual(["UNREADABLE"]);
    expect(computeProofFlags(null, { ...ctx, duplicateImage: true })).toEqual(["UNREADABLE", "DUPLICATE_IMAGE"]);
  });
});
