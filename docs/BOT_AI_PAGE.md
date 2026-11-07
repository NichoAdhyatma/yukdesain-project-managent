# Halaman Bot AI, Mind Map Pengetahuan, dan Penampil Markdown

Lanjutan dari Otak bot (`docs/WHATSAPP_BOT_BRAIN_VIEW.md`) dan file pengetahuan (`docs/WHATSAPP_BOT_KNOWLEDGE.md`).
Disetujui dan diimplementasikan 2026-11-07 (checkpoint 051).

## 1. Keputusan owner (2026-11-07)

1. **Menu baru "Bot AI"** (`/bot`), terpisah dari Settings › WhatsApp. "WA fokus di WA, bot ya bot."
2. **Mind map yang bisa diklik + panel detail.** Di layar kecil otomatis memakai tampilan pohon.
3. **Penampil Markdown**: isi file pengetahuan tampil rapi (`###` jadi judul, daftar, *tebal*), bukan teks mentah.

## 2. Pembagian halaman

| Tempat | Isi |
|---|---|
| **Bot AI** (`/bot`, menu baru di grup Work, setelah Order WA) | tab **Otak bot** (mind map), **Panduan** (aturan tambahan, file pengetahuan, FAQ, aturan harga), **Uji bot**, **Model AI** |
| **Settings › WhatsApp** | Saluran WhatsApp (Meta / Fonnte), Balas otomatis, Nomor owner, Pemakaian |

- Tab aktif mengikuti `?tab=` (`otak`, `panduan`, `uji`, `model`), jadi bisa ditautkan.
- Peringatan yang sekarang menyuruh "pindah ke Anthropic resmi" di Settings › WhatsApp menautkan ke `/bot?tab=model`.
- Tombol **Ubah** di Otak bot untuk bagian Panduan membuka `/bot?tab=panduan` lalu menggulir ke bagiannya.
- Hanya OWNER, sama seperti sekarang.

## 3. Mind map pengetahuan (tab Otak bot)

- Node tengah **Bot YukDesain**. Cabang kiri: Identitas studio, Layanan, Harga, Alur order. Cabang kanan: Aturan dasar,
  Panduan owner, Kemampuan. Garis penghubung melengkung dari tengah ke cabang lalu ke item.
- Tiap cabang menampilkan jumlah isi dan itemnya. Cabang yang isinya banyak (mis. 11 layanan, 14 kemampuan)
  menampilkan beberapa item pertama plus "+N lainnya" yang membuka daftar lengkap di panel.
- Penanda draft tetap ada: titik/label "Belum terbit" atau "Ada perubahan di draft" di node yang berubah.
- **Klik node** → panel detail di kanan: judul, asal data, isi (Markdown dirender untuk file pengetahuan, aturan
  tambahan, dan bagian aturan dasar), tombol **Ubah** bila bisa diubah.
- Pilihan **Versi terbit / Draft**, ukuran prompt, dan **Lihat isi lengkap** tetap ada di atas mind map.
- **Keyboard**: setiap node adalah tombol (Tab untuk berpindah, Enter untuk membuka panel, Esc menutup panel).
- **Layar < 1280 px**: tampilan pohon yang sudah ada (mind map butuh lebar sekitar 1.040 px ditambah sidebar).
- Tidak memakai library grafik berat; tata letak HTML/CSS + garis SVG.

## 4. Penampil Markdown

- Dipakai di: panel detail mind map, editor File pengetahuan (tombol **Edit / Pratinjau**), dan Aturan tambahan.
- Mendukung heading, paragraf, daftar, *tebal*/_miring_, kutipan, kode, garis, dan tabel sederhana.
- **Tidak merender HTML mentah** dari isi file (aman dari skrip); tautan dibuka di tab baru dengan `rel="noopener"`.
- Library: `react-markdown` + `remark-gfm` (dependensi baru, kecil).
- Yang dikirim ke bot tidak berubah: model tetap menerima teks Markdown aslinya.

## 5. Perubahan teknis (ringkas)

| Bagian | Perubahan |
|---|---|
| Route | `src/app/(dashboard)/bot/page.tsx` (tab via `?tab=`) |
| Menu | baris menu "Bot AI" `/bot`, ikon `Bot`, role OWNER: ditambahkan di `prisma/seed.ts` dan disisipkan di production lewat skrip kecil yang idempoten (proxy memakai menu untuk izin akses) |
| Komponen | `BotBrainCard`, `BotGuideCard`, `BotSandboxCard`, `AiProviderCard` pindah dari `WhatsAppSettingsTab` ke halaman Bot AI; komponen baru `KnowledgeMindMap`, `MindMapDetailPanel`, `MarkdownView` |
| Schema | tidak ada perubahan |
| Tes | render Markdown tanpa HTML mentah, data mind map (cabang, "+N lainnya", penanda draft), tab via URL |

## 6. Catatan implementasi

- Halaman: `src/app/(dashboard)/bot/page.tsx`. `?bagian=instructions|knowledge|faq|pricing` menggulir ke bagian
  Panduan setelah kartunya dimuat, memfokuskan kolom isian pertama (bukan tombol Hapus), lalu dihapus dari URL.
- Model tampilan bersama: `src/components/settings/whatsapp/brain-map.ts` (`buildBrainMap`, `visibleItems`,
  `MAP_VISIBLE_ITEMS = 4`). Mind map: `KnowledgeMindMap.tsx`; kartu dan panel detail: `BotBrainCard.tsx`.
- Mind map dipakai mulai lebar 1280 px (`useMediaQuery`), di bawahnya pohon.
- Penampil Markdown: `src/components/ui/markdown-view.tsx` (`skipHtml`, gambar tidak dimuat, heading diturunkan).
- Lock file dibuat ulang dengan npm 10.8.2 (sama dengan VPS) supaya `npm ci` di deploy tidak gagal.
- **Deploy production**: jalankan `prisma/sql/2026-11-07-menu-bot-ai.sql` sekali (idempoten) supaya menu Bot AI
  muncul dan `/bot` dibatasi OWNER. Jangan menjalankan `prisma/seed.ts` di production (seed mereset password user).
