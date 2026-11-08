# Katalog Layanan untuk bot (harga mulai)

Bagian 2 dari `docs/superpowers/specs/2026-11-07-bot-knowledge-features-design.md` (§5). Diputuskan owner 2026-11-07
dan 2026-11-08. Menu **Layanan** menjadi sumber pengetahuan bot tentang layanan, menggantikan isi
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
