import { describe, expect, it } from "vitest";
import { DP_PLACEHOLDER, dropRepeatedSentences, stripDpMentions, PRICE_PLACEHOLDER, WA_TEXT_LIMIT, clampReply, mentionsPriceOrDeadline, stripPriceMentions } from "./reply-guard";

describe("mentionsPriceOrDeadline", () => {
  it.each([
    "Harga logo mulai Rp500.000",
    "biayanya sekitar 750rb kak",
    "Kisaran 1-2 juta",
    "estimasi 1.500.000",
    "Rp 300.000 untuk desain logo",
    "Pengerjaan selesai dalam 3 hari",
    "estimasi 2-3 minggu",
    "bisa jadi 2 hari kak",
  ])("terdeteksi: %s", (s) => {
    expect(mentionsPriceOrDeadline(s)).toBe(true);
  });

  it.each([
    "Harga akan dikirim tim kami setelah brief lengkap ya.",
    "Ukuran A3, 60x160 cm",
    "Boleh tahu nama brandnya?",
    "Logonya mau 2 warna?",
  ])("aman: %s", (s) => {
    expect(mentionsPriceOrDeadline(s)).toBe(false);
  });
});

describe("stripPriceMentions", () => {
  it("membuang kalimat bermasalah dan menambahkan kalimat standar sekali", () => {
    const r = stripPriceMentions("Siap kak! Harga logo Rp500.000. Selesai dalam 3 hari. Nama brandnya apa?");
    expect(r.changed).toBe(true);
    expect(r.text).toBe(`Siap kak! Nama brandnya apa?\n\n${PRICE_PLACEHOLDER}`);
  });

  it("tanpa sebutan harga → tidak berubah", () => {
    expect(stripPriceMentions("Halo kak, mau desain apa?")).toEqual({ text: "Halo kak, mau desain apa?", changed: false });
  });

  it("seluruh balasan bermasalah → hanya kalimat standar", () => {
    expect(stripPriceMentions("Harganya 1 juta kak.").text).toBe(PRICE_PLACEHOLDER);
  });

  it("harga item menu dari brief klien tidak dibuang", () => {
    const brief = JSON.stringify({ menu_items_json: [{ id: "1", name: "Es Kopi", price: "18.000" }] });
    const text = "Ringkasan: menu Es Kopi harga 18.000. Sudah sesuai?";
    expect(stripPriceMentions(text, brief)).toEqual({ text, changed: false });
  });

  it("angka yang tidak ada di brief tetap dibuang walau ada angka brief", () => {
    const brief = JSON.stringify({ menu_items_json: [{ id: "1", name: "Es Kopi", price: "18.000" }] });
    expect(stripPriceMentions("Es kopi 18.000, harga desainnya Rp500.000.", brief).changed).toBe(true);
  });
});

describe("clampReply", () => {
  it("memotong di batas WhatsApp", () => {
    const out = clampReply("a".repeat(5000));
    expect(out.length).toBe(WA_TEXT_LIMIT);
    expect(out.endsWith("…")).toBe(true);
  });
});

import { sanitizeReply } from "./reply-guard";

describe("sanitizeReply", () => {
  it("balasan normal tidak berubah", () => {
    const text = "Siap kak, nama brandnya Kopi Senja sudah dicatat. Warnanya mau apa?";
    expect(sanitizeReply(text)).toEqual({ text, rejected: false, changed: false });
  });

  it.each([
    "]<]minimax[>[<tool_call>\n]<]minimax[>[<invoke name=\"get_brief\">",
    "Oke kak <invoke name=\"update_brief_draft\"><parameter name=\"fields\">{}</parameter></invoke>",
    "<function_calls>...</function_calls>",
  ])("markup tool-call → ditolak: %j", (text) => {
    expect(sanitizeReply(text).rejected).toBe(true);
  });

  it("pengulangan liar dipotong", () => {
    const r = sanitizeReply(`Kalau sudah sesuai, bilang ya kak, nanti aku teruskan ke tim kami untuk${"*}{".repeat(400)}`);
    expect(r).toMatchObject({ rejected: false, changed: true });
    expect(r.text).toBe("Kalau sudah sesuai, bilang ya kak, nanti aku teruskan ke tim kami untuk");
  });

  it("kode layanan dan huruf CJK dibuang, em dash diganti koma", () => {
    const r = sanitizeReply("Pilihan: *Logo Minimalis* (SVC-01) — clean dan modern. Target pasar定位高端 apa kak?");
    expect(r.text).toBe("Pilihan: *Logo Minimalis*, clean dan modern. Target pasar apa kak?");
    expect(r.changed).toBe(true);
  });

  it("koma ganda setelah penggantian em dash dirapikan", () => {
    expect(sanitizeReply("Layanan kami: logo, banner, — dan konten media sosial ya kak.").text).toBe(
      "Layanan kami: logo, banner, dan konten media sosial ya kak.",
    );
  });

  it("titik-titik atau garis pendek tidak dipotong", () => {
    const text = "Tunggu sebentar ya kak............ tim kami sedang cek. ------------";
    expect(sanitizeReply(text)).toMatchObject({ rejected: false, changed: false });
  });

  it("sisa terlalu pendek → ditolak", () => {
    expect(sanitizeReply("经营者业务的 ok").rejected).toBe(true);
  });
});

describe("stripPriceMentions — aturan harga owner (docs/WHATSAPP_OWNER_COMMANDS.md §6)", () => {
  it("nilai aturan harga terbit boleh disebut, angka lain tetap dibuang", () => {
    const r = stripPriceMentions(
      "Order lebih dari 5 desain dapat potongan Rp50.000 lho kak! Paket express ada tambahan 50% dari total. Harga logo Rp750.000 ya.",
      "",
      ["50000", "5", "50"],
    );
    expect(r.text).toContain("Rp50.000");
    expect(r.text).toContain("50% dari total");
    expect(r.text).not.toContain("750.000");
  });

  it("tanpa aturan harga: potongan pun dibuang", () => {
    expect(stripPriceMentions("Ada potongan Rp50.000 kak.").text).not.toContain("50.000");
  });
});

describe("stripPriceMentions: harga mulai dari katalog Layanan (docs/SERVICES_CATALOG.md §3)", () => {
  // Katalog per layanan: Logo Rp150.000 "termasuk 2 konsep", Feed Rp300.000.
  const catalogGroups = [["150000", "2"], ["300000"]];
  const guard = (text: string, brief = "", allowed: string[] = [], policyNumbers: string[] = []) =>
    stripPriceMentions(text, brief, allowed, { catalogGroups, policyNumbers });

  it.each([
    "Logo Minimalis mulai Rp150.000 ya kak.",
    "Logo Minimalis mulai Rp150.000 (termasuk 2 konsep) ya kak.",
    "Logo mulai 150 ribu ya kak.",
    "Logo mulai 150k ya kak.",
    "Logo mulai Rp150.000,- ya kak.",
  ])("harga mulai persis (format apa pun) lolos: %s", (text) => {
    expect(guard(text).changed).toBe(false);
  });

  it.each([
    "Logo Minimalis mulai Rp120.000 ya kak.",
    "Logo mulai 120k ya kak.",
    "Logo mulai 120.000 ya kak.",
    "Logo mulai IDR 120.000 ya kak.",
    "Kalau 2 logo jadi Rp300.000 kak.",
    "Totalnya Rp150.000 ya kak, langsung transfer aja.",
    "Harganya 150 ribu kak.",
  ])("harga karangan, total, atau tanpa kata mulai dihapus: %s", (text) => {
    const r = guard(text);
    expect(r.changed).toBe(true);
    expect(r.text).toContain(PRICE_PLACEHOLDER);
  });

  it("lama pengerjaan tetap dihapus walau angkanya ada di katalog", () => {
    expect(guard("Logo Minimalis mulai Rp150.000, selesai 2 hari kak.").changed).toBe(true);
  });

  it("aturan harga owner yang menyebut durasi tetap lolos", () => {
    expect(guard("Paket express selesai 1 hari, tambahan 50% dari total.", "", ["50", "1"]).changed).toBe(false);
  });

  it("isi brief dengan format angka berbeda tetap lolos", () => {
    expect(guard("Menu kopi susu Rp18.000 sudah aku catat ya kak.", '{"menu":"kopi susu 18rb"}').changed).toBe(false);
  });

  it("teks kebijakan / FAQ owner yang memuat nominal lolos, tapi tidak untuk durasi", () => {
    expect(guard("Revisi ke-4 dst dikenakan Rp50.000 ya kak.", "", [], ["4", "50000"]).changed).toBe(false);
    expect(guard("Desain selesai 4 hari kak.", "", [], ["4", "50000"]).changed).toBe(true);
  });
});


describe("stripPriceMentions: harga pasti, hasil kalkulator, estimasi (spec 2026-11-11 §4.3)", () => {
  // Per layanan: Banner Rp135.000 pasti; Poster Menu Rp135.000 + Rp5.000 per item; Auto Pilot paket Rp1.250.000.
  const extras = {
    fixedGroups: [["135000"], ["135000", "5000"], ["1250000"]],
    calculatedTotals: [] as string[],
    estimateGroups: [["3"], ["5", "7"]],
    catalogGroups: [["150000"]],
  };
  const guard = (text: string, over: Partial<typeof extras> = {}) => stripPriceMentions(text, "", [], { ...extras, ...over });

  it("harga pasti katalog lolos tanpa kata mulai", () => {
    expect(guard("Desain banner Rp135.000 ya, Kak.").changed).toBe(false);
    expect(guard("Poster menu Rp135.000 termasuk 35 item, tambahan Rp5.000 per item ya, Kak.").changed).toBe(false);
  });

  it("kutipan paket dengan jumlah desain (angka biasa) tetap lolos", () => {
    expect(guard("Paket UMKM Starter Rp1.250.000: 8 desain feed dan 8 story ya kak.").changed).toBe(false);
  });

  it("harga pasti dengan kata total tetap dihapus kecuali dari kalkulator", () => {
    expect(guard("Totalnya Rp135.000 ya, Kak.").changed).toBe(true);
    expect(guard("Totalnya Rp160.000 ya, Kak.", { calculatedTotals: ["160000"] }).changed).toBe(false);
    expect(guard("Totalnya Rp170.000 ya, Kak.", { calculatedTotals: ["160000"] }).changed).toBe(true);
  });

  it("rincian kalkulator lolos", () => {
    expect(guard("Rp135.000 (sampai 35 item) + 5 item × Rp5.000 = Rp160.000 ya, Kak.", { calculatedTotals: ["160000", "135000", "5000"] }).changed).toBe(false);
  });

  it("diskon / potongan / persen karangan dihapus walau angkanya ada di katalog atau rincian", () => {
    expect(guard("Kakak dapat diskon 5% ya.").changed).toBe(true);
    expect(guard("Diskon 35% khusus hari ini kak.").changed).toBe(true);
    expect(guard("Ada potongan Rp5.000 per item ya kak.").changed).toBe(true);
    expect(guard("Diskon 3% juga ya kak.", { calculatedTotals: ["160000", "135000", "5000", "3"] }).changed).toBe(true);
  });

  it("harga dari dua layanan pasti berbeda tidak boleh dicampur dalam satu kalimat", () => {
    expect(guard("Banner Rp1.250.000 dengan tambahan Rp5.000 ya kak.").changed).toBe(true);
  });

  it("estimasi dari satu layanan lolos, lama lain / campuran / percepatan dihapus", () => {
    expect(guard("Estimasi pengerjaan 3 hari ya, Kak.").changed).toBe(false);
    expect(guard("Banner Rp135.000, estimasi 3 hari ya, Kak.").changed).toBe(false);
    expect(guard("Estimasi 5-7 hari ya kak.").changed).toBe(false);
    expect(guard("Selesai 1 hari kak.").changed).toBe(true);
    expect(guard("Estimasi 3-7 hari ya kak.").changed).toBe(true);
    expect(guard("Logo bisa selesai 1 sampai 3 hari kak.").changed).toBe(true);
    expect(guard("Bisa dipercepat jadi 3 hari kak.").changed).toBe(true);
  });

  it("layanan pindah ke mode mulai: harga tanpa kata mulai dihapus", () => {
    expect(guard("Banner Rp135.000 ya, Kak.", { fixedGroups: [], catalogGroups: [["135000"]] }).changed).toBe(true);
    expect(guard("Banner mulai Rp135.000 ya, Kak.", { fixedGroups: [], catalogGroups: [["135000"]] }).changed).toBe(false);
  });
});

describe("stripDpMentions: setelah invoice, bot tidak menyebut DP (spec 2026-11-11 §5)", () => {
  it("kalimat DP dengan nominal atau persen dihapus, kalimat lain tetap", () => {
    const r = stripDpMentions("DP-nya Rp75.000 ya kak. Setelah transfer, kirim bukti transfernya di sini ya.");
    expect(r.changed).toBe(true);
    expect(r.text).not.toContain("75.000");
    expect(r.text).toContain("kirim bukti transfernya");
    expect(r.text).toContain(DP_PLACEHOLDER);
    expect(stripDpMentions("Uang mukanya 50% dari total kak.").changed).toBe(true);
    expect(stripDpMentions("Transfer DP 30 ribu dulu ya kak.").changed).toBe(true);
  });

  it.each([
    "DPnya Rp750.000 ya kak.",
    "DP 750000 ya kak.",
    "DP 50 persen dari total ya kak.",
    "Panjar Rp750.000 dulu ya kak.",
    "Tanda jadinya 300rb ya kak.",
  ])("bentuk DP umum dihapus: %s", (text) => {
    expect(stripDpMentions(text).changed).toBe(true);
  });

  it("nominal DP / sisa pelunasan order ini dihapus walau tanpa kata DP atau di kalimat lain", () => {
    const dp = ["750000", "750000", "50"];
    expect(stripDpMentions("Untuk DP ya kak. Nominalnya Rp750.000.", dp).text).not.toContain("750.000");
    expect(stripDpMentions("Bayar setengahnya dulu Rp750.000 ya kak.", dp).changed).toBe(true);
    expect(stripDpMentions("DP\nRp750.000", dp).text).not.toContain("750.000");
    expect(stripDpMentions("Harga order Rp1.500.000 sesuai invoice ya kak.", dp).changed).toBe(false);
  });

  it("tanpa angka atau tanpa kata DP tidak diubah", () => {
    expect(stripDpMentions("Silakan bayar DP sesuai invoice yang sudah kami kirim ya kak.").changed).toBe(false);
    expect(stripDpMentions("Harga order Rp150.000 sesuai invoice ya kak.").changed).toBe(false);
  });
});

describe("sanitizeReply: label riwayat tidak ikut terkirim", () => {
  it("label pesan tim yang ditiru model dibuang", () => {
    expect(sanitizeReply("[Pesan dari tim studio] Halo kak, invoice sudah kami kirim ya.").text).toBe("Halo kak, invoice sudah kami kirim ya.");
  });
});

// Produksi 12 Nov: kalimat yang sama dikirim berulang (Knn "kabari kalau jumlah menunya sudah pasti" 2x,
// Mif "permintaan masih dalam pengecekan tim" di setiap balasan, Virgi "tim akan mengirim harga final" 2x).
describe("dropRepeatedSentences: kalimat yang sudah terkirim tidak diulang", () => {
  it("kalimat yang mirip pesan sebelumnya dibuang, sapaan pendek tetap", () => {
    const recent = [
      "Siap kak, ditunggu ya. Kalau jumlah item menunya sudah pasti, langsung kabari di chat ini.",
      "Siap kak, silakan dicek dulu ya. Kalau sudah ada jumlah pastinya, kabari saja.",
    ];
    expect(dropRepeatedSentences("Siap kak, ditunggu ya. Kalau sudah pasti jumlah menunya, langsung kabari saja di sini.", recent)).toBe(
      "Siap kak, ditunggu ya.",
    );
  });

  it("kalimat persis sama di pesan lebih lama juga dibuang", () => {
    const recent = ["Oke kak.", "Brief sudah kami terima dan tim kami akan mengirimkan harga final secepatnya."];
    expect(dropRepeatedSentences("Siap kak, terima kasih ya. Brief sudah kami terima dan tim kami akan mengirimkan harga final secepatnya.", recent)).toBe(
      "Siap kak, terima kasih ya.",
    );
  });

  it("angka atau teks tebal yang baru tidak dianggap ulangan", () => {
    expect(dropRepeatedSentences("Siap kak, ukuran 60x300 cm sudah kami catat.", ["Siap kak, ukuran 60x160 cm sudah kami catat."])).toBe(
      "Siap kak, ukuran 60x300 cm sudah kami catat.",
    );
    const recent = ["Terima kasih kak, foto *Mango Sunshine* sudah kami terima dan kami catat sebagai referensi menu."];
    const text = "Terima kasih kak, foto *Tropical Fresh* sudah kami terima dan kami catat sebagai referensi menu.";
    expect(dropRepeatedSentences(text, recent)).toBe(text);
  });

  it("pertanyaan hanya dibuang bila persis sama dengan pertanyaan di pesan terakhir; menanyakan lagi hal lama boleh", () => {
    const ask = "Kira-kira berapa jumlah menu yang mau ditampilkan di katalognya?";
    expect(dropRepeatedSentences(`Foto sudah kami catat ya kak.\n\n${ask}`, [`Baik kak, sudah kami catat.\n\n${ask}`])).toBe("Foto sudah kami catat ya kak.");
    expect(dropRepeatedSentences(`Oke kak.\n\n${ask}`, ["Gambarnya untuk apa ya kak?", `Siap.\n\n${ask}`])).toBe(`Oke kak.\n\n${ask}`);
  });

  // Simulasi chat 12 Nov (Nurul): klien membalas hal lain, bot menanyakan lagi pertanyaan yang belum dijawab.
  it("pertanyaan yang belum dijawab boleh ditanyakan lagi dengan kalimat lain", () => {
    const recent = ['Terima kasih kak Aldi. Tulisan "dari 9 negara" mau saya masukkan juga ke banner atau tidak?'];
    const text = 'Sudah saya catat kak. Tulisan "dari 9 negara" mau dimasukkan ke banner atau tidak?';
    expect(dropRepeatedSentences(text, recent)).toBe(text);
  });

  it("kalimat pembuka (titik dua) ikut dibuang bila semua pertanyaan di bawahnya terbuang", () => {
    const list = "Untuk melanjutkan, boleh kakak infokan:\n- Kira-kira berapa jumlah menu yang mau ditampilkan?\n- Rencananya katalognya berapa halaman?";
    const text = `Terima kasih kak, foto *Tropical Fresh* sudah kami terima.\n\n${list}`;
    expect(dropRepeatedSentences(text, [`Terima kasih kak, foto *Mango* sudah kami terima.\n\n${list}`])).toBe(
      "Terima kasih kak, foto *Tropical Fresh* sudah kami terima.",
    );
  });

  it("ringkasan brief (daftar bernomor) dikirim utuh walau mengulang", () => {
    const summary = "Siap kak, sudah diralat. Ringkasannya:\n\n1. Layanan: Banner UMKM\n2. Ukuran: 60x300 cm\n3. Gaya: Elegan\n\nSudah sesuai kak? Balas \"sudah sesuai\" kalau iya.";
    expect(dropRepeatedSentences(summary, [summary])).toBe(summary);
  });

  it("daftar bernomor pendek tetap utuh bersama kalimat pembukanya", () => {
    const text = "Siap kak. Biar bisa kami catat, boleh kirim dua hal ini:\n\n1. Nama Kakak\n2. Tulisan utama di banner";
    expect(dropRepeatedSentences(text, ["Halo kak, ada yang bisa kami bantu hari ini?"])).toBe(text);
  });

  it("kalimat tempelan penjaga harga yang sudah terkirim tidak diulang", () => {
    expect(dropRepeatedSentences(`Background putih ya kak.\n\n${PRICE_PLACEHOLDER}`, [`Logo sudah kami catat.\n\n${PRICE_PLACEHOLDER}`])).toBe(
      "Background putih ya kak.",
    );
  });

  it("semua kalimat ulangan → kosong; tanpa riwayat → apa adanya", () => {
    const recent = ["Permintaan kakak masih dalam pengecekan tim, kami kabari begitu ada jawabannya."];
    expect(dropRepeatedSentences("Permintaan kakak masih dalam pengecekan tim, kami kabari begitu ada jawabannya.", recent)).toBe("");
    expect(dropRepeatedSentences("Halo kak, mau desain apa hari ini?", [])).toBe("Halo kak, mau desain apa hari ini?");
  });
});

describe("kalimat tempelan penjaga terdengar seperti admin", () => {
  it("tanpa kata baku 'mengirimkannya' dan 'cara pembayarannya'", () => {
    expect(PRICE_PLACEHOLDER).toBe("Soal harga dan lama pengerjaannya nanti dikirim tim setelah brief-nya lengkap ya kak.");
    expect(DP_PLACEHOLDER).toBe("Nominal DP-nya ada di invoice yang tadi kami kirim ya kak.");
  });
});

// Produksi 13 Nov (Mr.K4z): ringkasan brief jadi "6.7. Sisa foto produk" karena nomor "6." dipotong sebagai kalimat.
describe("penjaga harga/DP: nomor daftar bukan akhir kalimat", () => {
  it("baris bernomor yang memuat harga terlarang dibuang utuh, nomor tidak menempel ke baris berikutnya", () => {
    const text = "Ringkasan:\n5. Menu: 29 item\n6. Harga menu naik Rp1.000 semua\n7. Sisa foto produk: ditanyakan ke tim\n\nSudah sesuai kak?";
    const out = stripPriceMentions(text).text;
    expect(out).not.toContain("6.7.");
    expect(out).toContain("7. Sisa foto produk: ditanyakan ke tim");
    expect(out).not.toMatch(/^6\.\s*$/m);
  });

  it("DP: baris bernomor dengan nominal DP dibuang utuh", () => {
    const out = stripDpMentions("Rincian:\n1. DP 50%: Rp67.500\n2. Kirim bukti transfer di sini", ["67500"]).text;
    expect(out).toContain("2. Kirim bukti transfer di sini");
    expect(out).not.toMatch(/^1\.\s*$/m);
  });
});
