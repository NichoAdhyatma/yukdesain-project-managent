# Katalog Layanan untuk bot (harga pasti / mulai, paket, harga per unit, estimasi)

Bagian 2 dari `docs/superpowers/specs/2026-11-07-bot-knowledge-features-design.md` (§5). Diputuskan owner 2026-11-07
dan 2026-11-08. Diperluas 2026-11-11 dengan harga pasti, paket, harga per unit, kalkulator, dan estimasi dari
knowledge base master (§5 di bawah; spec `docs/superpowers/specs/2026-11-11-kb-merge-design.md` Bagian A). Menu **Layanan** menjadi sumber pengetahuan bot tentang layanan, menggantikan isi
`docs/bot-knowledge/02-pengetahuan-layanan.md` (file itu dihapus owner sendiri setelah kolom terisi, Bagian 4).

## 1. Kolom baru di `Service`

| Kolom | Isi | Batas | Siapa yang melihat |
|---|---|---|---|
| `startingPrice` | Harga mulai (rupiah). Kosong = bot tidak menyebut harga layanan ini | 1–100.000.000 | Owner; bot menyebutnya ke klien |
| `priceNote` | Catatan harga, ikut disebut bot (mis. "ukuran A3 mulai Rp200.000") | ≤80 karakter | Owner; bot menyebutnya ke klien |
| `suitableFor` | "Cocok untuk", dipakai bot saat klien bingung memilih | ≤200 karakter | Owner; bot boleh memakainya |
| `botNotes` | Catatan internal untuk bot | ≤300 karakter | Owner; bot **tidak** mengutipnya |

- Teks kosong disimpan sebagai `null`. Validasi: `serviceBotFieldsSchema` (`src/lib/whatsapp/ai/service-catalog.ts`).
- Keempat kolom hanya dikirim dan diterima untuk owner (`toServiceDto`, `parseServiceBotFields` di
  `src/lib/services/service-dto.ts`); desainer juga diblokir proxy dari `/api/services`. Payload project (termasuk
  route yang dibuka desainer) memuat layanan lewat `SERVICE_PUBLIC_SELECT`, tanpa kolom bot.
- `GET /api/services` dikirim dengan `Cache-Control: private, no-cache`, jadi harga yang baru disimpan langsung
  terbaca di semua halaman (sebelumnya di-cache browser 1 jam).
- **Yang perlu disiapkan klien** tidak diketik: diturunkan dari field brief wajib layanan (`getBriefConfig` +
  `BRIEF_FIELD_DESCRIPTIONS`), jadi selalu sama dengan form brief.

## 2. Cara bot memakainya

- **System prompt (di-cache)**: blok `# Layanan`, satu baris per layanan aktif yang punya konfigurasi brief:
  `- Logo Minimalis (SVC-01): mulai Rp150.000 (catatan). Cocok untuk: …`. Tanpa harga: "harga dikirim tim setelah
  brief". Berubah hanya saat owner menyimpan layanan.
- **STATE**: saat order sudah punya layanan, detailnya ikut (deskripsi, cocok untuk, format file, yang perlu
  disiapkan, dan catatan internal berlabel "jangan dikutip ke klien").
- **`list_services`**: membawa harga mulai, catatan harga, dan cocok untuk; tanpa `botNotes`.
- **Aturan prompt**: harga mulai boleh disebut hanya persis seperti di daftar, selalu dengan kata "mulai", lalu
  keterangan bahwa harga final dikirim tim setelah brief lengkap. Tetap dilarang: total, kisaran lain, negosiasi,
  lama pengerjaan. Panduan owner dan file `.md` tidak bisa menimpa harga dari daftar Layanan.
- **Order WA**: panel harga menampilkan "Patokan layanan: mulai Rp…". Isian harga tidak diisi otomatis.

## 3. Penjaga harga di server (dijamin, sebelum admin memberi harga)

`stripPriceMentions` (`src/lib/whatsapp/ai/reply-guard.ts`) menghapus kalimat yang menyebut harga atau lama
pengerjaan, kecuali semua angkanya berasal dari data yang diizinkan:

1. Setiap **nominal** dianggap menyebut harga, dengan atau tanpa kata "harga": "Rp…", "IDR …", "…rb/ribu/k/jt/juta",
   dan angka berpemisah ribuan ("120.000").
2. Angka dibandingkan sebagai **nilai rupiah** (`amountsOf`): "18rb" = "Rp18.000", "Rp150.000,-" = 150000.
3. Tingkat angka yang diizinkan:
   - isi brief klien dan nilai aturan harga owner: kalimat apa pun;
   - teks kebijakan (catatan revisi, catatan pelunasan) dan jawaban FAQ owner: bukan kalimat lama pengerjaan;
   - **katalog per layanan** (harga mulai + catatan harga): bukan lama pengerjaan, wajib kata "mulai", tanpa kata
     total ("total", "jadi", "semua", "2x"), dan semua angkanya dari **satu** layanan.

Contoh (Logo Rp150.000 "termasuk 2 konsep", Feed Rp300.000):

| Kalimat bot | Hasil |
|---|---|
| "Logo Minimalis mulai Rp150.000 (termasuk 2 konsep) ya kak." | lolos |
| "Logo mulai 150 ribu ya kak." | lolos (nilai sama) |
| "Logo mulai 120k ya kak." / "Logo mulai IDR 120.000" | dihapus |
| "Kalau 2 logo jadi Rp300.000 kak." | dihapus (total, campur layanan) |
| "Totalnya Rp150.000 ya kak." | dihapus (tanpa "mulai") |
| "Logo mulai Rp150.000, selesai 2 hari kak." | dihapus (lama pengerjaan) |

Batasan yang diterima: kalimat "mulai" dengan harga mulai milik layanan lain ("Feed IG mulai Rp150.000") tidak
ditolak, karena mencocokkan nama layanan di kalimat terlalu rapuh; harganya tetap harga mulai nyata dan harga final
tetap diisi admin.

## 4. Setelah deploy

1. Owner mengisi harga mulai, catatan harga, dan "cocok untuk" di menu **Layanan** (bagian "Untuk bot WhatsApp").
   Isi "cocok untuk" bisa diambil dari `docs/bot-knowledge/02-pengetahuan-layanan.md`.
2. Coba di **Uji bot**: tanya "logo berapa kak?" → bot menjawab "mulai Rp…" + harga final menyusul; tanya "berapa
   lama jadinya?" → kalimat standar tanpa angka.

## 5. Harga pasti, paket, harga per unit, estimasi (2026-11-11)

Keputusan owner 2026-11-11: harga katalog dijawab bot **di awal** (sebelum brief lengkap), angka pasti tanpa
"mulai" bila harganya pasti. Harga order tetap dikonfirmasi admin di Order WA. Mengubah aturan §2 "selalu dengan
kata mulai" untuk layanan berharga pasti.

### 5.1 Kolom tambahan di `Service`

| Kolom | Isi | Batas |
|---|---|---|
| `priceMode` | `FIXED` (harga pasti, tanpa "mulai") atau `STARTING` (perilaku §2). Default DB `STARTING`; form layanan baru default "Harga pasti" | |
| `packages` | `[{ name, price, note }]`. Bila ada, `startingPrice` diisi otomatis = paket termurah | maks 6; nama ≤40, catatan ≤120 |
| `unitPricing` | `{ unitLabel, includedUnits, extraUnitPrice, minUnits }`: total = harga dasar + max(0, unit − termasuk) × tambahan; unit ≥ minimal | satuan ≤20 |
| `estimate` | Estimasi pengerjaan, mis. "3 hari", "5-7 hari" | ≤40 |

- `startingPrice` boleh Rp0 **hanya** bila ada harga per unit (layanan tanpa harga dasar, mis. Buku Menu
  Rp90.000 per halaman, minimal 5).
- Kolom Json kosong ditulis `Prisma.DbNull` (`toServiceWriteData`); data lama/rusak dibaca sebagai kosong
  (`normalizePricing`).

### 5.2 Kalkulator (`calculatePrice`, tool `calculate_price`)

`src/lib/services/price-calculator.ts`. Input satu layanan + paket dan/atau jumlah unit. Ditolak: layanan tanpa
harga, paket tidak dikenal (pesan menyebut pilihan paket), unit bukan bilangan bulat positif, unit di bawah minimum,
unit untuk layanan yang tidak dihitung per unit. Gabungan beberapa layanan, diskon, dan express tidak dihitung: bot
memakai `ask_owner`. Contoh dari KB: Poster Menu 36 item = Rp140.000; Buku Menu 6 halaman = Rp540.000; Sticker
Label 3 varian = Rp295.000.

Total dan rincian hasil tool dicatat per giliran (`ctx.calculatedTotals` / `calculatedBreakdowns`) untuk penjaga.

### 5.3 Bot

- Baris katalog: `- Banner UMKM (SVC-04): Rp135.000. Estimasi 3 hari`; paket
  `Newspaper Rp85.000; Photostrips 4R Rp50.000`; per unit `Rp135.000 termasuk 35 item, tambahan Rp5.000 per item`.
  Mode mulai tetap `mulai Rp…`.
- Prompt: harga pasti disebut tanpa "mulai"; hitungan (item, halaman, varian, pose, paket) hanya dari
  `calculate_price`; jumlah kira-kira ("40an item") ditanyakan angka pastinya dulu; lama pengerjaan hanya persis
  estimasi katalog; express wajib dikonfirmasi owner.
- `list_services` ikut membawa mode, paket, harga per unit, dan estimasi.

### 5.4 Penjaga harga (tambahan atas §3)

- Yang diperiksa hanya **nominal uang** (Rp/IDR, rb/jt/k, angka berpemisah ribuan), **persen**, dan **angka lama
  pengerjaan**. Angka biasa ("8 desain feed", "35 item") bukan harga, jadi kutipan paket apa adanya tidak terhapus.
- Nominal layanan `FIXED` (harga, paket, tambahan per unit, nominal di catatan harga/paket) lolos **tanpa** kata
  "mulai", tetap tanpa kata total, dan semua nominal di satu kalimat harus dari **satu** layanan.
- Nominal hasil `calculate_price` pada giliran itu (total + nominal rincian) lolos, termasuk dengan kata "total"/"jadi".
- Kata **"total"/"jadi"** hanya dianggap total bila menempel pada nominal ("totalnya Rp150.000", "jadi 300rb",
  "Rp300.000 jadinya"), dan "**3x revisi**" bukan perkalian (2026-11-13). Sebelumnya "Rp135.000 itu jadi 1 lembar",
  "total menunya di bawah 35 item", dan catatan harga "maks 3x revisi" membuat kalimat harga katalog yang benar
  terbuang: balasan Fawzan menjadi "ada dua pilihan:" dengan satu pilihan, dan jawaban owner untuk M rizky (harga tetap
  Rp135.000 asal di bawah 35 menu) tidak sampai ke klien.
- Kalimat **diskon/potongan/promo/cashback** dan **persen** hanya lolos bila angkanya dari brief, aturan harga owner,
  atau teks kebijakan; tidak pernah dari katalog atau kalkulator.
- Lama pengerjaan: semua angka durasi ("3 hari", "5-7 hari", "1 sampai 2 hari") harus dari estimasi **satu** layanan;
  bila order sudah punya layanan, hanya estimasi layanan itu. Kalimat dengan kata percepatan (express, kilat,
  dipercepat, lebih cepat) dihapus kecuali angkanya dari aturan harga owner.
- Layanan yang dipindah owner dari pasti ke mulai langsung mengikuti katalog baru pada giliran berikutnya.

| Kalimat bot (Banner Rp135.000 pasti, estimasi 3 hari) | Hasil |
|---|---|
| "Desain banner Rp135.000 ya, Kak." | lolos |
| "Paket UMKM Starter Rp1.250.000: 8 desain feed dan 8 story." | lolos |
| "Banner Rp135.000, estimasi 3 hari ya, Kak." | lolos |
| "Totalnya Rp160.000 ya, Kak." (hasil `calculate_price` giliran itu) | lolos |
| "Totalnya Rp170.000 ya, Kak." / "Diskon 5% ya kak." | dihapus |
| "Selesai 1 hari kak." / "Bisa dipercepat jadi 3 hari kak." | dihapus |

Batasan yang diterima: penjaga tidak mencocokkan nama layanan di kalimat, jadi harga pasti layanan lain yang disebut
utuh ("Logo Rp350.000" padahal Rp350.000 milik layanan lain) tidak ditolak; dan angka durasi dicocokkan tanpa konteks,
jadi "revisi 3 hari" lolos bila ada estimasi "3 hari".

### 5.5 Order WA dan form brief

- Panel harga: isian harga awal (hanya bila harga belum pernah disimpan) = `suggestQuotePrice`: kalkulator dengan
  paket dari `package_choice` dan unit dari `page_count` / `variant_count` / `pose_count` / jumlah `menu_items_json`;
  bila tidak bisa dihitung, harga layanan. Admin tetap yang menyimpan.
- Layanan baru (kode + konfigurasi brief): SVC-12 Buku Menu, SVC-13 Social Media Auto Pilot, SVC-14 Social Media
  Design Package, SVC-15 Paket Duo Pack. Form brief web merender isian generik untuk layanan tanpa bagian khusus.
  SVC-02 (`pose_count`), SVC-08 (`variant_count`), SVC-09 (`package_choice`) mendapat kartu "Paket & Jumlah".
- Layanan baru dibuat di menu Layanan dengan kode berurutan; konfigurasi brief hanya berlaku bila kodenya cocok.
