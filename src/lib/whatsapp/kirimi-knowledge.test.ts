import { describe, expect, it } from "vitest";
import { OPERATIONS_DEFAULTS } from "@/lib/studio-operations-rules";
import type { BotService } from "./ai/service-catalog";
import type { BotGuide } from "./ai/bot-guide";
import { buildKirimiKnowledge, type KirimiKnowledgeInput } from "./kirimi-knowledge";

const svc = (over: Partial<BotService> & { isActive?: boolean }): BotService & { isActive: boolean } => ({
  code: "SVC-01",
  name: "Layanan",
  description: null,
  outputFormat: null,
  startingPrice: null,
  priceNote: null,
  suitableFor: null,
  botNotes: null,
  priceMode: "FIXED",
  packages: [],
  unitPricing: null,
  estimate: null,
  isActive: true,
  ...over,
});

const guide: BotGuide = {
  instructions: "- Jawab harga langsung.",
  faqs: [{ question: "Bisa datang langsung?", answer: "Hanya online ya, Kak." }],
  pricingRules: [
    { id: "express", kind: "SURCHARGE", name: "Express maks 1x24 jam", condition: "Owner sudah setuju.", amountType: "PERCENT", amount: 50, note: "Dari total harga." },
  ],
  knowledgeFiles: [{ title: "Wajib tanya owner", whenToUse: "Di luar katalog.", content: "1. Harga custom." }],
};

const input = (over: Partial<KirimiKnowledgeInput> = {}): KirimiKnowledgeInput => ({
  source: "published",
  version: 25,
  generatedAt: new Date("2026-11-11T08:00:00Z"),
  studio: { name: "YukDesain Studio", email: "halo@yukdesain.com", phone: "0812", address: "Malang" },
  ops: { ...OPERATIONS_DEFAULTS, dpPercent: 50, workingHoursStart: "08:00", workingHoursEnd: "15:30", workingDays: [1, 2, 3, 4, 5, 6] },
  services: [
    svc({ code: "SVC-04", name: "Banner UMKM", startingPrice: 135000, priceNote: "ukuran bisa disesuaikan", estimate: "3 hari", outputFormat: "AI, PDF, PNG" }),
    svc({ code: "SVC-03", name: "Poster Menu", startingPrice: 135000, unitPricing: { unitLabel: "item", includedUnits: 35, extraUnitPrice: 5000, minUnits: null }, estimate: "3 hari", botNotes: "Judul kategori tidak dihitung." }),
    svc({ code: "SVC-12", name: "Buku Menu", startingPrice: 0, unitPricing: { unitLabel: "halaman", includedUnits: 0, extraUnitPrice: 90000, minUnits: 5 }, estimate: "3 hari" }),
    svc({ code: "SVC-09", name: "Photobooth", startingPrice: 50000, packages: [{ name: "Newspaper", price: 85000, note: "1 desain" }, { name: "Photostrips 4R", price: 50000, note: null }] }),
    svc({ code: "SVC-01", name: "Logo Minimalis", priceMode: "STARTING", startingPrice: 250000 }),
    svc({ code: "SVC-05", name: "Baliho", startingPrice: null }),
    svc({ code: "SVC-15", name: "Duo Pack", startingPrice: 325000, isActive: false }),
  ],
  guide,
  ...over,
});

describe("buildKirimiKnowledge", () => {
  const md = buildKirimiKnowledge(input());

  it("kepala: nama studio, sumber, waktu dibuat", () => {
    expect(md).toMatch(/^# Knowledge agen WhatsApp YukDesain Studio/);
    expect(md).toContain("Sumber: Panduan terbit v25");
    expect(md).toContain("11 November 2026");
  });

  it("aturan wajib pengganti pengaman portal: tanpa DP/rekening, pembayaran dicek tim, eskalasi", () => {
    expect(md).toContain("Jangan menyebut nominal atau persen DP");
    expect(md).toContain("Jangan mengirim nomor rekening");
    expect(md).toContain("Jangan menyatakan pembayaran sudah valid");
    expect(md).toMatch(/gabungan beberapa layanan, diskon, atau express/);
  });

  it("tidak membocorkan persen DP atau kontak sensitif", () => {
    expect(md).not.toMatch(/DP\s*50|50\s*%\s*DP|DP \d+%/);
    expect(md).not.toContain("1234567890");
  });

  it("jam kerja dan kebijakan dari Operasional", () => {
    expect(md).toContain("08.00–15.30");
    expect(md).toContain(OPERATIONS_DEFAULTS.revisionNotice);
  });

  it("katalog: harga pasti tanpa mulai, harga mulai dengan mulai, tanpa harga ditandai", () => {
    expect(md).toContain("### Banner UMKM");
    expect(md).toContain("- Harga: Rp135.000 (ukuran bisa disesuaikan)");
    expect(md).toContain("- Harga: mulai Rp250.000");
    expect(md).toContain("- Harga: belum ada di katalog, teruskan ke admin");
    expect(md).toContain("- Estimasi: 3 hari");
    expect(md).toContain("- Format file: AI, PDF, PNG");
    expect(md).toContain("- Catatan internal (jangan dikutip ke klien): Judul kategori tidak dihitung.");
  });

  it("harga per unit: rumus dan contoh hitungan dari kalkulator portal", () => {
    expect(md).toContain("Rp135.000 sudah termasuk 35 item; tambahan Rp5.000 per item");
    expect(md).toContain("36 item = Rp140.000");
    expect(md).toContain("40 item = Rp160.000");
    expect(md).toContain("Rp90.000 per halaman, minimal 5 halaman");
    expect(md).toContain("5 halaman = Rp450.000");
    expect(md).toContain("6 halaman = Rp540.000");
  });

  it("paket ditulis satu per satu", () => {
    expect(md).toContain("- Paket Newspaper: Rp85.000 (1 desain)");
    expect(md).toContain("- Paket Photostrips 4R: Rp50.000");
  });

  it("terbit: hanya layanan aktif; draft: ikut nonaktif dengan tanda", () => {
    expect(md).not.toContain("Duo Pack");
    const draft = buildKirimiKnowledge(input({ source: "draft", version: null }));
    expect(draft).toContain("Sumber: Panduan draft");
    expect(draft).toContain("### Duo Pack (nonaktif di portal, jangan ditawarkan)");
  });

  it("aturan harga owner, instruksi, FAQ, dan file pengetahuan", () => {
    expect(md).toContain("Express maks 1x24 jam: biaya tambahan 50% dari total. Syarat: Owner sudah setuju.");
    expect(md).toContain("- Jawab harga langsung.");
    expect(md).toContain("**Bisa datang langsung?**\nHanya online ya, Kak.");
    expect(md).toContain("### Wajib tanya owner");
    expect(md).toContain("1. Harga custom.");
  });

  it("tanpa panduan: bagian panduan tidak muncul, tanpa em dash", () => {
    const empty = buildKirimiKnowledge(input({ guide: null }));
    expect(empty).not.toContain("## Pertanyaan umum (FAQ)");
    expect(md).not.toContain("—");
  });
});

describe("aturan dasar dari Panduan produksi v27 ikut di knowledge Kirimi (2026-11-12)", () => {
  const md = buildKirimiKnowledge(input({ ops: { ...OPERATIONS_DEFAULTS, workingDays: [1, 2, 3, 4, 5, 6], workingHoursStart: "08:00", workingHoursEnd: "15:30", sameDayCutoff: "13:00" } }));

  it("batas order dari Operasional dan hari libur", () => {
    expect(md).toContain("Order yang masuk sebelum 13.00 WIB pada hari kerja");
    expect(md).toContain("Minggu dan tanggal merah libur");
  });

  it("pricelist umum, harga sebelum brief, rekomendasi konsep, klien lama", () => {
    expect(md).toContain("katalog di profil WhatsApp YukDesain Studio");
    expect(md).toContain("sebelum meminta brief");
    expect(md).toContain("rekomendasi konsep");
    expect(md).toContain("klien lama");
    expect(md).toContain("Jangan memberikan link portal yang tidak ada");
  });
});
