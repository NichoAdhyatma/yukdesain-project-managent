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

describe("gaya chat seperti admin, bukan robot (kasus Day 2026-11-12)", () => {
  const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);

  it("pesan pendek, daftar bernomor dan tebal hanya di ringkasan/harga, ikuti gaya klien", () => {
    expect(prompt).toContain("Maksimal 2-3 kalimat pendek per pesan");
    expect(prompt).toContain("Daftar bernomor hanya untuk ringkasan brief");
    expect(prompt).toContain("Ikuti gaya bahasa klien");
    expect(prompt).toContain('Variasikan pembuka; jangan selalu "Siap kak"');
  });

  it("tidak mengulang info yang sudah disebut, satu pertanyaan per pesan, nama ditanya sekali", () => {
    expect(prompt).toContain("Jangan mengulang harga, estimasi, atau nama layanan yang sudah kamu sebut");
    expect(prompt).toContain("Jangan menulis ulang kalimat yang sudah kamu kirim sebelumnya");
    expect(prompt).toContain("Tanyakan satu hal per pesan");
    expect(prompt).not.toContain("Tanyakan satu atau dua hal per pesan");
    expect(prompt).toContain("menjelang ringkasan brief");
  });

  it("minta contoh desain: bagikan link dari Panduan atau ask_owner, tidak mengulang penolakan", () => {
    expect(prompt).toContain("Jika klien minta contoh hasil desain");
    expect(prompt).toContain("admin akan mengirimkan contohnya");
    expect(prompt).toContain('jangan mengulang bahwa contoh "belum bisa ditampilkan"');
  });

  it("ditanya bot atau bukan: tetap jujur, singkat dan hangat, tawarkan admin", () => {
    expect(prompt).toContain("Jika klien bertanya apakah ini bot, jawab jujur");
    expect(prompt).toContain("tawarkan admin");
  });
});

describe("tidak bertanya hal yang sama (2026-11-12, kasus Day dan Mif)", () => {
  const base: StateInput = { intake: null, pendingImageMessageIds: [] };

  it("STATE memuat jawaban tim yang sudah disampaikan, supaya tidak ditanyakan ulang ke owner", () => {
    const state = buildStateBlock({
      ...base,
      ownerQueries: [{ question: "Minta ide konsep banner", status: "RELAYED", approved: true, note: "Minta nama brand, menu, ukuran" }],
    });
    expect(state).toContain('Sudah dijawab tim dan sudah disampaikan ke klien: permintaan "Minta ide konsep banner": BISA');
    expect(state).toContain("Jangan tanyakan ulang ke owner");
    expect(state).not.toContain("Sampaikan ke klien sekarang");
  });

  // Produksi 14 Nov (Ikaika): klien bertanya "kalau di bawah 35 item harganya turun?", owner menjawab "Tidak… harga
  // sudah net" (harga tidak turun). Bot membaca "TIDAK bisa dikerjakan" lalu menolak seluruh order Poster Menu.
  it("jawaban TIDAK hanya untuk hal yang ditanyakan, bukan menolak seluruh order", () => {
    const state = buildStateBlock({
      ...base,
      ownerQueries: [{ question: "Apakah harga turun bila menu di bawah 35 item?", status: "ANSWERED", approved: false, note: "Harga sudah net" }],
    });
    expect(state).toContain('untuk permintaan "Apakah harga turun bila menu di bawah 35 item?": TIDAK');
    expect(state).not.toContain("TIDAK bisa dikerjakan");
    expect(state).toContain("TIDAK hanya berlaku untuk hal yang ditanyakan");
  });

  it("aturan: tidak ask_owner untuk hal yang sudah ditanyakan, tidak menagih pertanyaan yang sama berturut-turut", () => {
    const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);
    expect(prompt).toContain("Jangan memanggil ask_owner untuk permintaan yang sudah menunggu atau sudah dijawab tim di STATE");
    expect(prompt).toContain("Jangan menanyakan ulang pertanyaan yang sama di pesan berturut-turut");
    expect(prompt).toContain("cukup disampaikan sekali");
  });
});

describe("tidak meralat pesan tim (2026-11-12, kasus Nicho dan ayubbb)", () => {
  const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);

  it("pesan berlabel tim adalah fakta, walau tidak ada di STATE", () => {
    expect(prompt).toContain("[Pesan dari tim studio]");
    expect(prompt).toContain("bisa dari order lain yang sudah selesai");
  });

  it("tidak meralat atau menyuruh klien mengabaikan pesan sebelumnya atas inisiatif sendiri", () => {
    expect(prompt).toContain("Jangan pernah meralat, membantah, atau meminta klien mengabaikan pesan sebelumnya");
    expect(prompt).toContain("kecuali klien sendiri menunjukkan ada yang keliru");
  });
});

// Evaluasi chat 12 Nov sejak 15:45: 40% balasan dibuka "Siap kak", 39% melapor "sudah kami catat/simpan/terima",
// Isel jam 16:39 dibalas "Pagi juga kak", kata kaku ("pencatatan", "mohon dikonfirmasi", "ditindaklanjuti").
describe("lebih mirip admin manusia (humanize, 2026-11-12)", () => {
  const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);

  it("tidak melapor 'sudah kami catat' untuk setiap jawaban dan tidak membeo jawaban klien", () => {
    expect(prompt).toContain('Jangan melaporkan "sudah kami catat/simpan/terima" untuk setiap jawaban klien');
    expect(prompt).toContain("Data klien diulang hanya di ringkasan brief");
  });

  it("sering tanpa pembuka; bahasa lisan, bukan bahasa surat; emoji seperlunya", () => {
    expect(prompt).toContain("Sering kali tidak perlu pembuka");
    expect(prompt).toContain("Pakai bahasa lisan admin, bukan bahasa surat");
    expect(prompt).toContain('"pencatatan"');
    expect(prompt).toContain("Emoji boleh sesekali");
  });

  it("sapaan waktu mengikuti waktu sekarang di STATE", () => {
    expect(prompt).toContain("Sapaan waktu (pagi/siang/sore/malam) mengikuti waktu sekarang di STATE");
  });

  it("STATE memuat waktu sekarang dalam WIB dengan bagian hari", () => {
    const state = buildStateBlock({ intake: null, pendingImageMessageIds: [], now: new Date("2026-11-12T09:39:00Z") });
    expect(state).toContain("- Waktu sekarang: Kamis, 12 November 2026 pukul 16.39 WIB (sore)");
    expect(buildStateBlock({ intake: null, pendingImageMessageIds: [], now: new Date("2026-11-12T13:05:00Z") })).toContain("(malam)");
    expect(buildStateBlock({ intake: null, pendingImageMessageIds: [], now: new Date("2026-11-12T01:00:00Z") })).toContain("(pagi)");
    expect(buildStateBlock({ intake: null, pendingImageMessageIds: [], now: new Date("2026-11-12T05:30:00Z") })).toContain("(siang)");
  });
});

describe("pelunasan project yang sudah berjalan (2026-11-12)", () => {
  const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);

  it("file final terbuka setelah pelunasan; bukti pelunasan diteruskan ke admin", () => {
    expect(prompt).toContain("File final project baru bisa diunduh di portal setelah pelunasan dicatat admin");
    expect(prompt).toContain("Bukti transfer pelunasan project yang sudah berjalan");
    expect(prompt).toContain("request_human_handoff supaya admin mencatat pelunasannya");
  });
});

// Produksi 13 Nov (Rina): order dikerjakan admin lewat HP tanpa invoice di sistem. Klien kirim bukti transfer, bot
// malah membuat order baru dan mengirim ulang rincian harga serta menanyakan bentuk cup yang sudah dikirim.
describe("bukti transfer tanpa invoice di sistem (kasus Rina 2026-11-13)", () => {
  const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);

  it("tidak memulai order atau brief; bukti diteruskan ke admin", () => {
    expect(prompt).toContain("Klien mengirim bukti transfer atau bilang sudah transfer, tetapi tidak ada order berstatus QUOTED di STATE");
    expect(prompt).toContain("jangan memanggil start_intake, jangan mengirim rincian harga, dan jangan menanyakan brief");
  });
});

// Produksi 13 Nov (Yeni): gambar referensi saat sketsa sudah dikirim hanya dicatat sebagai teks; foto yang bot bilang
// tidak dipakai tetap tercatat di brief sebagai "contoh untuk karakter".
describe("gambar referensi saat project dikerjakan (kasus Yeni 2026-11-13)", () => {
  const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);

  it("gambar dilampirkan ke brief project, bukan hanya dideskripsikan", () => {
    expect(prompt).toContain("Gambar referensi baru dari klien saat project dikerjakan: panggil attach_image_to_brief");
  });

  it("gambar yang disampaikan tidak dipakai ditulis begitu di caption", () => {
    expect(prompt).toContain("Jika kamu menyampaikan ke klien bahwa suatu gambar tidak dipakai atau tidak bisa dijadikan acuan, tulis itu di caption");
  });
});

describe("tambahan brief setelah brief dikunci (kasus Alfa Indah 2026-11-12)", () => {
  const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);

  it("dicatat dengan add_brief_note, tidak dialihkan ke admin; yang memengaruhi harga ditanyakan ke owner", () => {
    expect(prompt).toContain("Tambahan atau perubahan kecil brief setelah invoice dikirim, saat bukti DP dicek, atau saat project dikerjakan");
    expect(prompt).toContain("add_brief_note");
    expect(prompt).toContain("jangan mengalihkan ke admin");
    expect(prompt).toContain("memengaruhi harga");
  });

  it("STATE DP_REVIEW tidak lagi menyuruh mengarahkan perubahan brief ke admin", () => {
    const state = buildStateBlock({
      intake: { status: "DP_REVIEW", service: null, clientName: null, clientEmail: null, briefDraft: {}, missingRequired: [], writableFields: [], imageTargets: [], quote: null },
      pendingImageMessageIds: [],
    });
    expect(state).not.toContain("arahkan ke admin");
    expect(state).toContain("add_brief_note");
  });
});

describe("evaluasi chat 13 Nov (Mr.K4z)", () => {
  const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);

  it("catatan tanpa field brief masuk add_brief_note; tidak mengaku mencatat tanpa tool", () => {
    expect(prompt).toContain("Permintaan klien yang tidak punya field brief");
    expect(prompt).toContain("Jangan pernah bilang sudah dicatat, disimpan, atau diteruskan ke tim kalau belum ada tool yang berhasil");
  });

  it("foto daftar menu / foto produk masuk referensi, bukan logo", () => {
    expect(prompt).toContain("logos_json hanya untuk logo");
  });
});

describe("memanggil admin tanpa memindahkan chat (keputusan owner 13 Nov)", () => {
  it("setelah request_human_handoff bot tetap melayani dan tidak bilang chat dialihkan", () => {
    const prompt = buildSystemPrompt("YukDesain", null, OPERATIONS_DEFAULTS, []);
    expect(prompt).toContain("chat tetap kamu layani sampai admin membalas sendiri");
    expect(prompt).toContain('bukan "chat sudah dialihkan"');
  });
});
