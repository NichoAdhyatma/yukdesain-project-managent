# Operasional studio

Menu **Operasional** (`/operasional`, khusus owner). Satu sumber untuk aturan operasional harian studio: dibaca portal
dan bot WhatsApp, sehingga aturan inti tidak lagi ditulis di file pengetahuan bot. Disetujui owner 2026-11-07
(spec: `docs/superpowers/specs/2026-11-07-bot-knowledge-features-design.md` §4), koreksi jam kerja 2026-11-08.

## 1. Isian

| Isian | Default | Dipakai oleh |
|---|---|---|
| DP sebelum pengerjaan (10–100%) | 50% | DP otomatis Order WA, pesan penawaran, panel harga, bot |
| Catatan pelunasan (≤200) | "Pelunasan dilakukan setelah desain selesai." | Bot (dikutip apa adanya) |
| Revisi gratis per project (0–10) | 3 | Project baru, API revisi admin dan portal klien, bot |
| Peringatan saat mengajukan revisi (≤300) | teks `REVISION_NOTICE` | Portal klien, bot (dikutip apa adanya) |
| Jam kerja desainer: hari, jam mulai dan selesai (WIB) | Senin–Sabtu, 09.00–17.00 | Bot, saat klien menanyakan progres, revisi, atau kapan dikerjakan |
| Batas order masuk jadwal hari ini (WIB, di dalam jam kerja; 2026-11-12) | 13.00 | Bot dan knowledge Agen AI Kirimi: order sebelum jam ini dapat masuk jadwal hari itu, setelahnya hari kerja berikutnya; tidak dijanjikan dikerjakan hari yang sama (`opsSameDayCutoff`) |

Jam kerja tidak membuat bot diam dan tidak mengubah pesan pengalihan ke admin.

## 2. Snapshot: perubahan hanya untuk yang baru

- `Project.revisionQuota` diisi dari Operasional saat project dibuat. Mengubah kuota tidak mengubah project berjalan.
- `WaIntake.dpPercent` diisi saat admin menyimpan harga. Penawaran yang sudah dikirim tetap memakai persennya; menyimpan
  harga ulang adalah penawaran baru dan memakai persen saat itu. Order lama tanpa snapshot dianggap 50%.

## 3. Teknis

- Data: kolom `ops*` di `StudioSettings` (teks null = default di kode). Modul: `src/lib/studio-operations.ts`
  (cache 60 detik, dibuang saat disimpan) dan `src/lib/studio-operations-rules.ts` (tipe, default, validasi, format jam;
  aman untuk browser).
- API: `GET/PUT /api/settings/operations` (owner; `OWNER_ONLY_API`). Setiap simpan dicatat di ActivityLog
  (`OPERATIONS_UPDATED`, nilai lama dan baru).
- Bot: blok "# Kebijakan studio" di system prompt (di-cache; berubah hanya saat owner menyimpan). STATE memakai DP
  snapshot order.
- Perbaikan ikut rilis ini: hitungan revisi terpakai di route admin dan portal klien sebelumnya dibatasi 1 baris
  (`take: 1`), sehingga nomor revisi tidak lewat 2 dan kuota tidak pernah habis. Sekarang = nomor revisi terakhir.

## 4. Langkah produksi

1. Deploy (kolom baru aditif lewat `db push`).
2. Jalankan sekali: `prisma/sql/2026-11-08-menu-operasional.sql` (menu + izin OWNER). Jangan memakai `prisma/seed.ts`.
3. Buka Operasional, periksa nilai default, simpan bila perlu.
4. Setelah itu file `03-kebijakan-studio.md` di Panduan bot boleh dihapus (isinya sudah tercakup).

## 5. Batasan: template penawaran Meta

Isi template `yd_penawaran_order` yang disetujui Meta tertulis **DP 50%** (`docs/WHATSAPP_TEMPLATES.md`). Template hanya
dipakai di saluran Meta untuk penawaran yang dikirim lebih dari 24 jam setelah pesan terakhir klien. Bila DP di
Operasional bukan 50%, penawaran itu **tidak dikirim** lewat template dan tercatat gagal (`TEMPLATE_DP_MISMATCH`);
Order WA meminta admin menghubungi klien manual. Saluran Kirimi dan Fonnte selalu mengirim teks, jadi tidak terdampak.
Untuk menghapus batasan ini, ajukan versi template baru yang menerima persen DP sebagai parameter.

Cache Operasional berlaku per proses (60 detik). Portal berjalan sebagai satu proses di VPS, jadi nilai baru langsung
terbaca setelah disimpan.
