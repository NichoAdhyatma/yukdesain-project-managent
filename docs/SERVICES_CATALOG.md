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
  `src/lib/services/service-dto.ts`); desainer juga diblokir proxy dari `/api/services`.
- Halaman Layanan mengambil data dengan `cache: "no-store"`, karena `GET /api/services` di-cache browser 1 jam.
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

1. Setiap **nominal rupiah** dianggap menyebut harga, dengan atau tanpa kata "harga" ("mulai Rp120.000",
   "jadi 300rb").
2. Angka yang diizinkan: isi brief klien, nilai aturan harga owner, dan **angka katalog** (harga mulai + angka di
   catatan harga).
3. Angka katalog hanya berlaku untuk kalimat harga. Kalimat lama pengerjaan ("selesai 3 hari") tetap dihapus
   walau angka 3 ada di catatan harga.

Contoh dengan harga mulai Rp150.000:

| Kalimat bot | Hasil |
|---|---|
| "Logo Minimalis mulai Rp150.000 ya kak." | lolos |
| "Logo Minimalis mulai Rp120.000 ya kak." | dihapus |
| "Kalau 2 logo jadi Rp300.000 kak." | dihapus |
| "Harganya 150 ribu kak." | dihapus (format lain) |

## 4. Setelah deploy

1. Owner mengisi harga mulai, catatan harga, dan "cocok untuk" di menu **Layanan** (bagian "Untuk bot WhatsApp").
   Isi "cocok untuk" bisa diambil dari `docs/bot-knowledge/02-pengetahuan-layanan.md`.
2. Coba di **Uji bot**: tanya "logo berapa kak?" → bot menjawab "mulai Rp…" + harga final menyusul; tanya "berapa
   lama jadinya?" → kalimat standar tanpa angka.
