# Desain: Menerapkan Knowledge Base Master ke fitur portal

Tanggal: 2026-11-11. Status: **menunggu review owner**. Sumber: `KNOWLEDGE_BASE_MASTER_YUKDESAINN.md` dari owner
(salinan acuan: `docs/knowledge-base/KNOWLEDGE_BASE_MASTER_YUKDESAINN.md`) dan diskusi sesi 2026-11-11.

## 1. Tujuan

Knowledge base master (KB) menjadi **sumber isi bisnis**; portal tetap menjadi **mekanisme**. Fitur yang dibutuhkan KB
dan belum ada di portal dibangun, lalu isi KB dimasukkan ke fitur-fitur itu (bukan sebagai satu file .md besar).

Berhasil kalau:

1. Ditanya harga katalog, bot menjawab angka **pasti** dari menu Layanan (mis. "Banner Rp135.000 ya, Kak"), tanpa
   "mulai" bila harganya pasti, dan **sebelum** brief lengkap.
2. Harga yang bergantung jumlah (item, halaman, varian, pose, paket) dihitung **server**, bukan dikarang bot.
3. Bot boleh menyebut estimasi layanan dari data (3 hari / 5–7 hari); express selalu lewat owner.
4. Setelah admin mengonfirmasi harga, klien menerima **invoice** (tagihan DP) + **semua metode bayar aktif**
   (rekening dan gambar QRIS). Bot tidak pernah menyebut DP sendiri.
5. Semua isi KB terpasang di produksi: layanan + harga + estimasi, aturan harga, FAQ, add-on; Panduan sebagai draft
   untuk dicek owner.

## 2. Keputusan owner (2026-11-11)

| Topik | Keputusan |
|---|---|
| Arah | Gabungkan: KB = isi, portal = mekanisme. Fitur yang belum ada dibangun. |
| Harga | Per layanan: **Harga pasti** atau **Mulai dari**. Harga katalog dijawab bot di awal. Harga final tetap dikonfirmasi admin di Order WA (terisi otomatis dari katalog/kalkulator). Mengubah aturan "bot hanya menyebut harga mulai" (2026-11-08). |
| Hitung harga | Kalkulator di server; bot hanya mengutip hasilnya. Diskon / gabungan / custom tetap ke owner. |
| Pembayaran | **Invoice + semua metode bayar aktif** di Pengaturan (rekening dan QRIS). Bot tidak menyebut nominal/persen DP. Mengubah alur DP di BRD. |
| Isi invoice | Menagih **DP sesuai Operasional studio** (sekarang 50%) + mencantumkan sisa pelunasan. Alur verifikasi DP → project tetap. |
| Estimasi | Per layanan dari data; express = aturan harga +50% yang wajib dikonfirmasi owner. |
| Isi data | Diisi agen dari KB setelah fitur deploy, dengan izin owner. Panduan masuk draft; layanan baru dibuat **nonaktif** sampai owner mengaktifkan. |

Tetap: bot tidak menentukan harga final, tidak memberi diskon, tidak menyatakan pembayaran valid, tidak membuat
project; deadline final dari admin.

## 3. Kondisi sekarang (dari kode dan produksi 2026-11-11)

- `Service` punya `startingPrice`, `priceNote`, `suitableFor`, `botNotes` (Bagian 2). Bot wajib memakai kata "mulai";
  `reply-guard` menghapus kalimat harga tanpa "mulai" dan semua total.
- Konfigurasi brief per layanan di `src/components/forms/brief/types.ts` (`SERVICE_CODES` SVC-01..11,
  `SERVICE_BRIEF_CONFIGS`), dipakai bot (`list_services` hanya menampilkan layanan yang punya konfigurasi) dan form
  brief web klien.
- Setelah admin menyimpan harga, `offerMessage` (`outbound.ts`) mengirim layanan, harga, DP (persen + nominal),
  deadline, dan rekening; bot di status QUOTED menjelaskan DP dan rekening.
- `PaymentAccount` punya `type` BANK/EWALLET, nomor, nama, `qrisImageUrl`. Saluran WA hanya bisa kirim **teks**
  (`sendTextOnChannel`) dan template Meta.
- `Invoice` (tabel) terikat ke project (dibuat setelah project ada).
- Produksi: Operasional DP 50%, revisi 3x, Senin–Sabtu 08.00–15.30; Panduan v24 kosong (0 file, 0 aturan harga,
  4 FAQ); 11 layanan, baru 3 berharga.

## 4. Bagian A: Katalog dan harga

### 4.1 Kolom baru di `Service` (aditif)

| Kolom | Tipe | Arti |
|---|---|---|
| `priceMode` | String `FIXED` \| `STARTING` default `STARTING` | Pasti: bot menyebut angka tanpa "mulai". Mulai: perilaku Bagian 2 |
| `packages` | Json? `[{ name ≤40, price, note? ≤120 }]` maks 6 | Pilihan paket dengan harga sendiri (Photobooth Newspaper/Photostrips, Auto Pilot, Design Package). Bila ada, `startingPrice` = harga paket termurah (diisi otomatis) |
| `unitPricing` | Json? `{ unitLabel, includedUnits, extraUnitPrice, minUnits? }` | Harga berjenjang: total = harga dasar + max(0, unit − included) × extra; unit ≥ minUnits |
| `estimate` | String? ≤40 | Estimasi untuk bot, mis. "3 hari", "5–7 hari" |

Contoh dari KB: Poster Menu `{unit "item", included 35, extra 5000}`; Buku Menu harga dasar 0,
`{unit "halaman", included 0, extra 90000, min 5}`; Sticker Label `{unit "varian", included 1, extra 85000}`;
Logo Mascot `{unit "pose", included 1, extra 100000}`.

### 4.2 Kalkulator (tool bot `calculate_price`)

Input `{ service_code, package?, units? }` → `{ total, breakdown: string, priceMode }` dari kolom di atas. Menolak
(error ke model) bila layanan tidak punya harga, paket tidak dikenal, atau unit di bawah minimum. Bot dilarang
menjumlahkan beberapa layanan atau memberi diskon (tetap `ask_owner` / admin).

### 4.3 Bot dan penjaga harga

- Prompt: harga **pasti** disebut tanpa "mulai"; harga **mulai** tetap dengan "mulai"; hitungan hanya dari
  `calculate_price`; harga final tetap dari tim setelah brief untuk custom/gabungan.
- `reply-guard`: angka katalog layanan `FIXED` lolos **tanpa** syarat "mulai"; angka hasil `calculate_price` pada
  giliran itu lolos (termasuk kata "total"/"jadi"); angka lain tetap dihapus.
- Estimasi: kalimat lama pengerjaan lolos bila angkanya sama dengan `estimate` layanan; selain itu tetap dihapus.
- Order WA: harga awal di panel harga terisi dari katalog/kalkulator (paket dan unit dari brief bila ada); admin tetap
  menyimpan.

### 4.4 Layanan baru dari KB (kode + konfigurasi brief)

| Kode | Layanan | Catatan |
|---|---|---|
| SVC-12 | Buku Menu | per halaman, min 5 |
| SVC-13 | Social Media Auto Pilot | paket UMKM Starter / Brand Growth / Profesional |
| SVC-14 | Social Media Design Package | paket Essential / Signature / Exclusive |
| SVC-15 | Paket Duo Pack (Sticker Label + Box) | cakupan detail dikonfirmasi owner (dicatat di `botNotes`) |

SVC-09 Photobooth memakai paket Newspaper / Photostrips 4R. SVC-10 "Paket Social Media" lama dinonaktifkan (diganti
SVC-13/14), tidak dihapus. Konfigurasi brief baru memakai kunci brief yang sudah ada sejauh mungkin, ditambah
`page_count`, `package_choice`, `variant_count`, `pose_count` bila perlu; form brief web ikut menampilkannya.

## 5. Bagian B: Invoice dan metode bayar

- Saat admin menyimpan/merevisi harga di Order WA, pesan penawaran diganti **invoice**:
  - nomor invoice (`WaIntake.invoiceNumber`, format `INV-WA-YYYYMMDD-XXXX`, dipakai ulang saat project dibuat);
  - layanan + rincian (paket/unit), total harga, **tagihan DP n%** (dari snapshot `WaIntake.dpPercent`), sisa
    pelunasan, deadline;
  - **semua metode bayar aktif** (urut `order`): rekening (nama, nomor, atas nama);
  - untuk akun dengan `qrisImageUrl`: gambar QRIS dikirim sebagai pesan gambar.
- Kemampuan saluran baru `sendImageOnChannel(to, imageUrl, caption)`: Kirimi `send-message-file`, Fonnte (URL),
  Meta (image link). Gagal kirim gambar → kirim URL gambar sebagai teks dan catat di log.
- Bot di status QUOTED/DP_REVIEW: tidak menyebut nominal/persen DP; merujuk ke "invoice yang sudah kami kirim";
  menerima bukti bayar seperti sekarang ("Bukti sudah kami terima, sedang dicek tim kami").
- Verifikasi DP admin, pembuatan project, dan `Invoice` project tetap; `Invoice.invoiceNumber` memakai nomor yang
  sama bila ada.
- BRD, `WHATSAPP_AI_CHATBOT.md`, `WHATSAPP_TEMPLATES.md` (template Meta penawaran) diperbarui.

## 6. Bagian C: Isi data dari KB (setelah deploy, izin owner)

| Tujuan | Isi |
|---|---|
| Layanan | Harga, mode (semua harga KB = pasti), paket, unit, estimasi (3 hari; Kopi Keliling 5–7 hari), cocok untuk, catatan bot. Layanan baru nonaktif dulu |
| Aturan harga (Panduan, draft) | Express +50% dari total, syarat: wajib konfirmasi owner, maks 1×24 jam |
| FAQ (draft) | Hanya online; cara order; kirim referensi; link Drive/Sheet; revisi umum 3x; revisi setelah final |
| Add-on (draft) | Daftar wajib tanya owner (10 butir KB); penanganan link/file; revisi khusus Logo Maskot; cut-off 13.00 & tanggal merah; catatan konsistensi pricelist (KB §12) |
| Operasional | Sudah sesuai (08.00–15.30, revisi 3x, DP 50%); tidak diubah |

## 7. Pengujian

- Unit: kalkulator (poster 36 item = 140.000, buku menu 6 hal = 540.000, label 3 varian = 295.000, di bawah minimum
  ditolak); penjaga (harga pasti tanpa "mulai" lolos, hasil kalkulator lolos, angka lain dan estimasi lain dihapus);
  invoice (DP dari snapshot, semua metode aktif, QRIS sebagai gambar, gagal gambar → URL); prompt QUOTED tanpa DP.
- Uji bot: "banner berapa?" → "Rp135.000"; "poster menu 40 item?" → 160.000 dari kalkulator; "berapa lama?" → 3 hari;
  "express?" → ditanyakan ke owner.
- UI (Layanan: mode harga, paket, unit, estimasi; Order WA: harga awal) lewat UI/UX Pro Max + `/antislop`.

## 8. Urutan kerja

A (katalog + kalkulator + penjaga + layanan baru) → B (invoice + gambar QRIS) → deploy → C (isi data, draft) → owner
cek di Uji bot → terbitkan Panduan + aktifkan layanan baru. A dan B masing-masing PR sendiri.

## 9. Di luar lingkup

- Hitung harga gabungan beberapa layanan / diskon otomatis.
- Tanggal merah otomatis (ditulis di add-on).
- Pembayaran online otomatis (payment gateway).
- Mengubah alur Web Portal klien selain form brief layanan baru.
