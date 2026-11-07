# Otak Bot: Tampilan Isi Pengetahuan Bot

Tambahan untuk Settings › WhatsApp. Owner ingin melihat sekaligus apa saja yang diketahui bot (helicopter view):
informasi bisnis, layanan, alur order, aturan, panduan, dan kemampuan, lalu langsung menuju tempat mengaturnya.
Disetujui dan diimplementasikan 2026-11-07 (checkpoint 050).

## 1. Keputusan owner (2026-11-07)

1. **Bentuk: pohon yang bisa dibuka-tutup** (seperti file explorer), bukan mind map kanvas.
2. **Mengatur: lompat ke editor yang sudah ada.** Tampilan ini hanya membaca; tombol "Ubah" membuka tempat
   aslinya. Satu sumber kebenaran, tidak ada editor ganda.
3. **Isi prompt lengkap ditampilkan**, dengan pilihan draft / versi terbit dan ukurannya (perkiraan token).

## 2. Yang dilihat owner

Kartu **Otak bot** di menu **Bot AI › Otak bot** (dulu di Settings › WhatsApp; dipindah 2026-11-07, lihat `docs/BOT_AI_PAGE.md`).

Ringkasan di atas: versi panduan aktif, apakah draft berbeda dari versi terbit, perkiraan ukuran prompt, dan
pilihan **Versi terbit** (yang dipakai klien) / **Draft** (yang dipakai Uji bot).

Cabang pohon (setiap cabang: jumlah isi, asal datanya, tombol **Ubah** jika bisa diubah):

| Cabang | Isi | Asal / tempat mengubah |
|---|---|---|
| Identitas studio | nama, email, telepon, alamat | Settings › General |
| Layanan | layanan aktif: nama, format file, deskripsi | menu Services |
| Harga | bot **tidak** memegang daftar harga; harga diisi admin per order. Daftar aturan harga (potongan/biaya tambahan) dari Panduan | Panduan › Aturan harga |
| Alur order | Sedang konsultasi → Perlu harga → Menunggu DP → Verifikasi DP → Jadi project (dan Batal), dengan siapa yang bertindak di tiap langkah (bot, admin, klien) | dari kode (hanya dilihat) |
| Aturan dasar 🔒 | bagian prompt yang dikunci: Topik, Batas, Cara menggali brief, Di luar layanan, Setelah ada harga, Status project, Gaya | dari kode (hanya dilihat) |
| Panduan owner | Aturan tambahan, File pengetahuan (per file), FAQ (per pertanyaan), Aturan harga; tanda "berubah di draft" per bagian | Panduan bot |
| Kemampuan | hal yang bisa dilakukan bot (lihat layanan, mulai order, isi brief, lampirkan gambar, konfirmasi brief, bukti transfer, batalkan, cek project, tanya owner, terapkan aturan harga, alihkan ke admin) | dari kode (hanya dilihat) |

Item daun bisa dibuka untuk membaca isinya (mis. isi file pengetahuan, jawaban FAQ, teks satu bagian aturan dasar).

**Lihat isi lengkap**: dialog berisi teks prompt persis seperti yang diterima model untuk pilihan draft / terbit,
dengan tombol salin.

Bukan bagian dari otak global (tidak ditampilkan): ingatan per percakapan (order dan brief yang sedang berjalan),
karena berbeda untuk setiap klien. Catatan kecil di kartu menjelaskannya.

## 3. Catatan harga

Bot tidak mengetahui daftar harga karena aturan BRD: harga, kisaran harga, dan lama pengerjaan selalu diisi admin
per order (`docs/WHATSAPP_AI_CHATBOT.md` §2). Tampilan ini menyatakan hal itu apa adanya. Jika owner ingin bot
mengetahui daftar harga (mis. "mulai dari"), itu mengubah aturan bisnis dan perlu keputusan terpisah.

## 4. Perubahan teknis (ringkas)

| Bagian | Perubahan |
|---|---|
| API | `GET /api/settings/whatsapp/brain?source=published\|draft` (owner-only, DTO eksplisit): studio, layanan aktif, langkah alur, bagian aturan dasar, ringkasan panduan, kemampuan, teks prompt + jumlah karakter + perkiraan token |
| Prompt | teks dibangun dengan `buildSystemPrompt` yang sama dengan bot, jadi yang ditampilkan = yang dipakai |
| Kemampuan | label bahasa Indonesia per tool; tes gagal jika ada tool bot tanpa label, supaya tampilan tidak tertinggal |
| UI | `BotBrainCard` (pohon dengan tombol buka/tutup, `aria-expanded`, keyboard), dialog isi lengkap; state memuat/error/kosong; tombol Ubah ke `/settings?tab=general`, `/services`, atau bagian Panduan (anchor) |
| Schema | tidak ada perubahan |
| Settings | tab aktif mengikuti `?tab=` di URL, supaya Ubah identitas bisa membuka tab General |

## 5. Catatan implementasi

- Data: `src/lib/whatsapp/ai/brain.ts` (`buildBrain`, `BRAIN_FLOW`, `CAPABILITY_LABELS`, `splitBaseRules`); API
  `src/app/api/settings/whatsapp/brain/route.ts`; UI `src/components/settings/whatsapp/BotBrainCard.tsx`.
- Ukuran prompt menghitung teks system ditambah definisi tools (keduanya dikirim setiap pesan), dibagi 4 sebagai
  perkiraan token, dibulatkan ke ratusan.
- Menyimpan Panduan bot menyegarkan Otak bot (`BRAIN_QUERY_KEY`).
- Tes menjaga tampilan tetap sinkron: setiap tool bot wajib punya label, dan alur mencakup semua status Order WA.
