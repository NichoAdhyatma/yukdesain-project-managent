import { describe, expect, it } from "vitest";
import { OPERATIONS_DEFAULTS } from "@/lib/studio-operations";
import { buildStateBlock, buildSystemPrompt, renderServiceCatalog, type StateInput } from "./system-prompt";

const quoted = (dpPercent: number): StateInput => ({
  intake: {
    status: "QUOTED",
    service: { code: "SVC-01", name: "Logo Minimalis" },
    clientName: "Sari",
    clientEmail: null,
    briefDraft: {},
    missingRequired: [],
    writableFields: [],
    imageTargets: [],
    quote: { agreedPrice: 150000, dpAmount: 75000, dpPercent, deadline: new Date("2026-11-20T00:00:00Z"), invoiceNumber: "INV-WA-20261111-AB12" },
  },
  pendingImageMessageIds: [],
});

describe("buildStateBlock QUOTED: invoice, tanpa DP dan rekening (spec 2026-11-11 §5)", () => {
  it("memuat harga, estimasi pengerjaan, dan nomor invoice; tidak memuat DP maupun rekening", () => {
    const state = buildStateBlock(quoted(50));
    expect(state).toContain("Rp150.000");
    expect(state).toContain("estimasi pengerjaan: sampai 20 November 2026");
    expect(state).not.toMatch(/deadline/i);
    expect(state).toContain("INV-WA-20261111-AB12");
    expect(state).not.toContain("Rp75.000");
    expect(state).not.toMatch(/\bDP\s*\d|DP \d+%|Rekening/i);
  });
});

describe("prompt setelah ada harga: bot merujuk invoice", () => {
  it("tidak menyebut DP, tidak mengirim rekening", () => {
    const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);
    expect(prompt).toContain("Invoice dan metode pembayaran sudah dikirim tim kami");
    expect(prompt).toContain("Jangan menyebut nominal atau persen DP, jangan mengirim rekening");
    expect(prompt).not.toContain("DP (persen dan nominal)");
    // Ke klien disebut estimasi pengerjaan, bukan deadline (sama dengan invoice).
    expect(prompt).toContain("Harga dan estimasi pengerjaan boleh disebut persis seperti di STATE");
    expect(prompt).toContain('jangan pakai kata "deadline" ke klien');
  });
});

describe("buildSystemPrompt: blok Kebijakan dari Operasional studio", () => {
  const ops = { ...OPERATIONS_DEFAULTS, dpPercent: 30, revisionQuota: 5, settlementNote: "Lunas sebelum file final dikirim." };

  it("memuat DP, pelunasan, kuota dan teks revisi, serta jam kerja", () => {
    const prompt = buildSystemPrompt("YukDesain", null, ops, []);
    expect(prompt).toContain("# Kebijakan studio");
    expect(prompt).toContain("Pengerjaan dimulai setelah DP dibayar sesuai invoice dari tim kami.");
    expect(prompt).not.toContain("DP 30%");
    expect(prompt).toContain("Lunas sebelum file final dikirim.");
    expect(prompt).toContain("Revisi gratis 5x per project");
    expect(prompt).toContain(OPERATIONS_DEFAULTS.revisionNotice);
    expect(prompt).toContain("Jam kerja tim desain: Senin–Sabtu, 09.00–17.00 WIB. Sebutkan saat klien menanyakan progres, revisi, atau kapan desainnya dikerjakan.");
    expect(prompt).not.toContain("Jam kerja admin");
    expect(prompt).not.toContain("DP 50%");
  });

  it("project berjalan mengikuti kuota project dari tool, bukan angka Operasional saat ini", () => {
    expect(buildSystemPrompt("YukDesain", null, ops, [])).toContain(
      "Untuk project yang sudah berjalan, kuota dan sisa revisi mengikuti data project dari tool (revisionQuota, revisionQuotaRemaining).",
    );
  });

  it("kuota 0 → tanpa revisi gratis, revisi dialihkan ke admin", () => {
    const prompt = buildSystemPrompt("YukDesain", null, { ...ops, revisionQuota: 0 }, []);
    expect(prompt).toContain("Tidak ada revisi gratis");
    expect(prompt).not.toContain("Revisi gratis 0x");
  });

  it("input sama → teks identik (prompt cache)", () => {
    expect(buildSystemPrompt("YukDesain", null, ops, [])).toBe(buildSystemPrompt("YukDesain", null, ops, []));
  });
});

describe("Katalog Layanan untuk bot (docs/SERVICES_CATALOG.md)", () => {
  const logo = {
    code: "SVC-01",
    name: "Logo Minimalis",
    description: "Logo simpel",
    outputFormat: "AI, PNG",
    startingPrice: 150000,
    priceNote: "termasuk 3 konsep",
    suitableFor: "brand modern",
    botNotes: "tanyakan logo dipakai di mana",
    priceMode: "STARTING" as const,
    packages: [],
    unitPricing: null,
    estimate: null,
  };
  const ops = OPERATIONS_DEFAULTS;

  it("satu baris per layanan dengan harga mulai, catatan harga, dan cocok untuk", () => {
    expect(renderServiceCatalog([logo])).toContain("- Logo Minimalis (SVC-01): mulai Rp150.000 (termasuk 3 konsep). Cocok untuk: brand modern");
  });

  it("layanan tanpa harga mulai tidak menyebut angka", () => {
    const text = renderServiceCatalog([{ ...logo, startingPrice: null, priceNote: null }]);
    expect(text).toContain("harga dikirim tim setelah brief");
    expect(text).not.toContain("mulai Rp");
  });

  it("system prompt memuat daftar Layanan dan aturan harga mulai", () => {
    const prompt = buildSystemPrompt("YukDesain", null, ops, [logo]);
    expect(prompt).toContain("# Layanan");
    expect(prompt).toContain('Untuk layanan bertanda "mulai", selalu pakai kata "mulai"');
    expect(prompt).not.toContain("tanyakan logo dipakai di mana");
  });

  describe("Bagian A: harga pasti, paket, harga per unit, estimasi (spec §4.3)", () => {
    const fixed = { ...logo, priceNote: null, suitableFor: null, priceMode: "FIXED" as const };

    it("harga pasti tanpa kata mulai, dengan estimasi", () => {
      expect(renderServiceCatalog([{ ...fixed, code: "SVC-04", name: "Banner UMKM", startingPrice: 135000, estimate: "3 hari" }])).toContain(
        "- Banner UMKM (SVC-04): Rp135.000. Estimasi 3 hari",
      );
    });

    it("paket ditulis satu per satu", () => {
      const photobooth = {
        ...fixed,
        code: "SVC-09",
        name: "Frame Photobooth",
        startingPrice: 50000,
        packages: [
          { name: "Newspaper", price: 85000, note: null },
          { name: "Photostrips 4R", price: 50000, note: null },
        ],
      };
      expect(renderServiceCatalog([photobooth])).toContain("- Frame Photobooth (SVC-09): Newspaper Rp85.000; Photostrips 4R Rp50.000");
    });

    it("harga per unit menyebut jumlah termasuk dan tambahan per unit", () => {
      const poster = { ...fixed, code: "SVC-08", name: "Poster Menu", startingPrice: 135000, unitPricing: { unitLabel: "item", includedUnits: 35, extraUnitPrice: 5000, minUnits: null } };
      expect(renderServiceCatalog([poster])).toContain("- Poster Menu (SVC-08): Rp135.000 termasuk 35 item, tambahan Rp5.000 per item");
      const buku = { ...fixed, code: "SVC-12", name: "Buku Menu", startingPrice: 0, unitPricing: { unitLabel: "halaman", includedUnits: 0, extraUnitPrice: 90000, minUnits: 5 } };
      expect(renderServiceCatalog([buku])).toContain("- Buku Menu (SVC-12): Rp90.000 per halaman, minimal 5 halaman");
    });

    it("mode mulai tetap memakai kata mulai", () => {
      expect(renderServiceCatalog([{ ...logo, priceNote: null, suitableFor: null }])).toContain("- Logo Minimalis (SVC-01): mulai Rp150.000");
    });

    it("aturan prompt: harga pasti dan hitungan hanya dari calculate_price", () => {
      const prompt = buildSystemPrompt("YukDesain", null, ops, [fixed]);
      expect(prompt).toContain('Untuk layanan berharga pasti, sebut angkanya langsung tanpa kata "mulai"');
      expect(prompt).toContain("Hitungan harga (item, halaman, varian, pose, paket) hanya dari calculate_price");
      expect(prompt).toContain("tanyakan angka pastinya dulu");
    });
  });

  it("STATE memuat detail layanan order dan yang perlu disiapkan klien", () => {
    const base = quoted(50);
    const state = buildStateBlock({ ...base, intake: { ...base.intake!, status: "COLLECTING", quote: null, serviceDetail: logo } });
    expect(state).toContain("Yang perlu disiapkan klien:");
    expect(state).toContain("nama brand/usaha");
    expect(state).toContain("tanyakan logo dipakai di mana");
  });
});

describe("aturan dasar dari Panduan produksi v27 (2026-11-12)", () => {
  const ops = { ...OPERATIONS_DEFAULTS, sameDayCutoff: "12:30" };
  const prompt = buildSystemPrompt("YukDesain", null, ops, []);

  it("kebijakan: hanya online, batas order dari Operasional, Minggu dan tanggal merah libur", () => {
    expect(prompt).toContain("hanya melayani secara online");
    expect(prompt).toContain("Jangan memberikan link portal yang tidak ada di data");
    expect(prompt).toContain("Order yang masuk sebelum 12.30 WIB pada hari kerja");
    expect(prompt).toContain("Jangan menjamin dikerjakan hari yang sama");
    expect(prompt).toContain("Minggu dan tanggal merah libur");
  });

  it("harga: jawab langsung sebelum brief, jangan tanya ulang, jangan mengarang", () => {
    expect(prompt).toContain("Jawab harga layanan yang ada di daftar Layanan secara langsung dan singkat, sebelum meminta brief");
    expect(prompt).toContain("Jangan menanyakan ulang");
    expect(prompt).toContain("Jangan mengarang harga custom, diskon, harga gabungan, atau biaya tambahan");
  });

  it("pricelist umum: arahkan ke katalog profil WhatsApp tanpa angka", () => {
    expect(prompt).toContain("pricelist secara umum");
    expect(prompt).toContain("katalog di profil WhatsApp YukDesain");
    expect(prompt).toContain("tanpa menyebut angka harga");
  });

  it("link/file, klaim order, rekomendasi konsep", () => {
    expect(prompt).toContain("Jika klien mengirim link atau file");
    expect(prompt).toContain("Jangan mengaku sudah membuka atau membaca isinya");
    expect(prompt).toContain("Jangan menyatakan order sudah terdaftar, masuk antrean, atau mulai dikerjakan");
    expect(prompt).toMatch(/rekomendasi konsep[^\n]*ask_owner/);
  });

  it("klien lama tanya progres: tidak menebak status, tanya owner bila project tidak ada di sistem", () => {
    expect(prompt).toContain("klien lama");
    expect(prompt).toMatch(/get_my_projects tidak menemukan project[^\n]*ask_owner/);
    expect(prompt).not.toContain("Jika nomornya belum terhubung, minta kode project dari klien.");
  });
});

describe("gambar klien selama brief: referensi untuk owner dan desainer (2026-11-12, kasus Yeni)", () => {
  const collecting = (unattached: string[]): StateInput => ({
    intake: {
      status: "COLLECTING",
      service: { code: "SVC-02", name: "Logo Ilustrasi" },
      clientName: null,
      clientEmail: null,
      briefDraft: {},
      missingRequired: [],
      writableFields: [],
      imageTargets: ["reference_items_json"],
      quote: null,
    },
    pendingImageMessageIds: [],
    unattachedImageMessageIds: unattached,
  });

  it("STATE mendaftar gambar klien yang belum masuk brief", () => {
    const state = buildStateBlock(collecting(["msg_logo", "msg_foto"]));
    expect(state).toContain("Gambar klien yang belum masuk brief");
    expect(state).toContain("messageId=msg_logo");
    expect(state).toContain("messageId=msg_foto");
  });

  it("tanpa gambar tertinggal → baris itu tidak muncul", () => {
    expect(buildStateBlock(collecting([]))).not.toContain("Gambar klien yang belum masuk brief");
  });

  it("aturan: semua gambar dimasukkan, bot tidak menilai hak cipta/watermark dan tidak menolak", () => {
    const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);
    expect(prompt).toContain("Setiap gambar dari klien selama brief dikumpulkan");
    expect(prompt).toContain("Jangan menilai hak cipta, watermark, keaslian, atau kelayakan gambar");
    expect(prompt).toContain("penilaian dilakukan owner dan desainer");
    expect(prompt).not.toContain("Jika tidak jelas, tanyakan dulu.");
  });
});
