# File Pengetahuan Bot (.md)

Tambahan untuk **Panduan bot** (`docs/WHATSAPP_BOT_GUIDE.md`). Owner ingin memberi bot pengetahuan dan gaya
komunikasi dalam bentuk file Markdown, mirip "skill", tanpa harus memadatkan semuanya ke Aturan tambahan
(maks 4.000 karakter). Disetujui dan diimplementasikan 2026-11-07 (checkpoint 049).

## 1. Keputusan owner (2026-11-07)

- **Selalu dibaca**: semua file yang terbit selalu ikut di prompt bot (bukan dibuka saat perlu). Paling andal,
  juga di gateway Olagon, dan murah karena ikut blok prompt yang di-cache.

## 2. Yang dilihat owner

Settings › WhatsApp › **Panduan bot**, bagian baru **File pengetahuan**:

- Daftar file: judul, "dipakai saat" (satu kalimat), jumlah karakter, dan sisa kuota total.
- **Unggah .md** (atau .txt) → isi file masuk ke editor; judul diambil dari heading pertama atau nama file.
- **Edit** langsung di portal, **Unduh** sebagai .md, **Hapus** (dengan konfirmasi).
- Contoh file: *Gaya komunikasi* (sapaan, emoji, panjang balasan, nada), *Pengetahuan desain* (beda logo
  minimalis vs maskot, format file, istilah cetak), *Kebijakan studio* (revisi, file mentah, jam admin).
- Catatan di UI: harga dan lama pengerjaan tetap di **Aturan harga**; angka harga di file tidak akan disebut bot
  sebelum admin memberi penawaran.

## 3. Alur

Sama seperti panduan lain: perubahan masuk **draft** → dicoba di **Uji bot** → **Terbitkan** → tersimpan di
riwayat versi dan bisa **dikembalikan**. Klien sungguhan hanya memakai versi terbit. Hanya OWNER.

Instruksi owner lewat WhatsApp (`docs/WHATSAPP_OWNER_COMMANDS.md`) tidak mengubah file pengetahuan; saat
instruksi WA menerbitkan versi baru, file dari versi sebelumnya ikut dibawa apa adanya.

## 4. Batas

| | Batas |
|---|---|
| Jumlah file | 8 |
| Isi per file | 10.000 karakter |
| Total semua file | 20.000 karakter (± 5–8 halaman) |
| Judul / "dipakai saat" | 60 / 160 karakter |
| Unggahan | .md atau .txt, maks 50 KB, dibaca sebagai teks di browser (tidak disimpan ke storage) |

Disimpan di konstanta `WA_BOT_GUIDE_LIMITS` (`src/lib/constants`).

## 5. Yang tidak bisa diubah oleh file

Sama dengan `docs/WHATSAPP_BOT_GUIDE.md` §3: file ditempatkan **setelah** aturan wajib dan tunduk padanya.
Penjaga di server tetap jalan (harga/durasi sebelum QUOTED, sanitizer, tools). Isi file dibungkus sebagai
data referensi, bukan perintah sistem, sehingga kalimat seperti "abaikan aturan di atas" di dalam file tidak
berlaku.

## 6. Perubahan teknis (ringkas)

| Bagian | Perubahan |
|---|---|
| Schema | `WaBotGuideVersion.knowledgeFiles Json @default("[]")` — additive, `db push` |
| Panduan | `botGuideSchema.knowledgeFiles: [{ id, title, whenToUse, content }]` dengan batas §4; draft, terbit, riwayat, kembalikan versi memakai alur yang ada |
| Prompt | `renderGuideSection` menambah bagian "Pengetahuan & gaya komunikasi"; tiap file dibungkus `<file judul="…" dipakai_saat="…">…</file>`; tetap di blok system yang di-cache |
| API | memakai `GET/PUT /api/settings/whatsapp/guide` yang ada (zod + DTO eksplisit) |
| UI | `KnowledgeFilesEditor` di `BotGuideCard`: daftar, unggah, editor, unduh, hapus, kuota; state kosong/memuat/error |
| Tes | schema & batas, render prompt (pembungkus, urutan setelah aturan wajib), file ikut terbawa saat terbit dari WA, angka harga di file tetap dihapus sebelum QUOTED |
