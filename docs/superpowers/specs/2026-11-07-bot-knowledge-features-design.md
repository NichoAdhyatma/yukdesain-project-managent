# Desain: Pengetahuan bot pindah ke fitur portal

Tanggal: 2026-11-07. Status: **menunggu review owner**. Disusun dari diskusi dengan owner (sesi 2026-11-07).

## 1. Tujuan

Pengetahuan bot WhatsApp tidak lagi ditulis sebagai banyak file `.md`. Aturan inti bisnis diatur di fitur portal yang
sesuai, dan **sistem serta bot membaca dari sumber yang sama**. File `.md` hanya untuk **aturan tambahan (add-on)**
yang tidak baku.

Kriteria berhasil:

1. Menambah layanan cukup di menu **Layanan**; bot langsung mengenalnya (nama, harga mulai, cocok untuk, format file,
   apa yang perlu disiapkan klien).
2. Mengubah aturan operasional (DP, kuota revisi, jam kerja, alur pelunasan) cukup di menu **Operasional studio**;
   portal dan bot ikut berubah untuk order/project baru.
3. Gaya bahasa diatur lewat pilihan + catatan singkat, bukan file panjang.
4. Muatan prompt tetap lebih kecil dari sekarang; detail hanya dimuat saat relevan.
5. Otak bot menampilkan pengetahuan sebagai graph dari relasi nyata dan memperkirakan token per konteks.

## 2. Keputusan owner (2026-11-07)

| Topik | Keputusan |
|---|---|
| Harga di menu Layanan | **Bot boleh menyebut "harga mulai"** per layanan. Harga final tetap diisi admin setelah brief lengkap. Mengubah aturan BRD (§8). |
| Gaya bahasa | **Pilihan + catatan**: sapaan, nada, panjang balasan, emoji, catatan singkat, 2–3 contoh balasan. |
| Pendekatan | **Terstruktur per fitur, dimuat sesuai konteks** (inti selalu ada; detail layanan dan add-on hanya saat relevan). Bukan RAG. |
| Operasional | Aturan inti tinggal di fitur portal, **dipakai sistem dan bot**. File `.md` hanya add-on. |
| Urutan | 4 bagian, masing-masing spec → rencana → PR → deploy sendiri: 1 Operasional → 2 Layanan → 3 Gaya bahasa → 4 Add-on + graph. |

Yang tetap tidak berubah: bot tidak menentukan harga final, deadline, validitas DP, atau membuat project; tidak
bernegosiasi; tidak menyebut lama pengerjaan.

## 3. Kondisi sekarang (dari kode)

- `docs/bot-knowledge/01–04*.md` (±6 KB, ±1.700 token) ada di draft Panduan produksi (belum terbit). Semua file
  `knowledgeFiles` **selalu** ikut di system prompt (`renderGuideSection`), di-cache.
- Panduan (`StudioSettings.waBotGuideDraft` → `WaBotGuideVersion`): `instructions`, `faqs`, `pricingRules`,
  `knowledgeFiles`; ada alur draft → Uji bot → terbit.
- `DP_PERCENT = 50` dan `MAX_REVISION_QUOTA = 3` di `src/lib/constants/index.ts`; kuota revisi juga **ditulis ulang
  sebagai angka 3** di `api/projects/[id]/revisions` dan `api/client-links/[token]/revisions`. `Project` belum
  punya kolom kuota. DP dipakai di `intake.ts`, `outbound.ts`, `QuotePanel.tsx`, `system-prompt.ts`.
- `Service`: `code`, `name`, `description`, `outputFormat`, `isActive`. Tidak ada harga. CRUD khusus owner.
- Tool `list_services` menyatakan "tidak berisi harga". `reply-guard` menghapus angka harga yang bukan nilai aturan
  harga terbit.
- Field brief per layanan sudah terdefinisi di `brief-schema.ts` (`getBriefConfig`, `missingRequiredFields`).

## 4. Bagian 1: Operasional studio

Menu sidebar baru **Operasional studio** (`/operasional`, khusus owner; masuk menu rules `src/proxy.ts` seperti menu
Bot AI). Disimpan di `StudioSettings` (kolom baru, semua punya default = perilaku sekarang):

| Field | Tipe | Default | Dipakai oleh |
|---|---|---|---|
| `dpPercent` | Int 10–100 | 50 | DP otomatis Order WA, QuotePanel, pesan penawaran, bot |
| `revisionQuota` | Int 0–10 | 3 | Project baru (snapshot), API revisi, portal klien, bot |
| `revisionNotice` | String ≤300 | teks `REVISION_NOTICE` sekarang | Portal klien saat mengajukan revisi, bot |
| `settlementNote` | String ≤200 | "Pelunasan dilakukan setelah desain selesai." | Bot (dikutip apa adanya) |
| `workingDays` | Int[] (1=Senin…7=Minggu) | [1..6] | Bot (jam kerja **desainer**) |
| `workingHoursStart` / `End` | String "HH:mm" WIB | "09:00" / "17:00" | Bot (jam kerja **desainer**) |

Aturan:

- **Snapshot**: `Project.revisionQuota Int @default(3)` (aditif; baris lama otomatis 3 = benar). Project baru
  mengambil nilai dari Operasional saat dibuat. Route revisi memakai `project.revisionQuota`, bukan konstanta.
  `WaIntake.dpPercent Int?` dicatat saat admin menyimpan harga, supaya penawaran lama tidak berubah.
- `DP_PERCENT` / `MAX_REVISION_QUOTA` tetap ada sebagai default dan fallback, bukan sumber utama.
- Jam kerja adalah **jam kerja desainer** (koreksi owner 2026-11-08). Bot menyebutnya saat klien menanyakan progres,
  revisi, atau kapan desain dikerjakan. Bot tetap membalas di luar jam itu, dan pengalihan ke admin tidak menyebut jam
  kerja.
- Bot membaca Operasional sebagai blok **Kebijakan** ringkas di system prompt (di-cache; berubah hanya saat owner
  menyimpan).
- Menggantikan `03-kebijakan-studio.md`.
- Perubahan dicatat di audit log (seperti pengaturan lain).

## 5. Bagian 2: Layanan + harga mulai

Kolom baru di `Service` (aditif):

| Field | Tipe | Keterangan |
|---|---|---|
| `startingPrice` | Int? (rupiah, satuan sama dengan `agreedPrice`) | Kosong = bot tidak menyebut harga untuk layanan ini |
| `suitableFor` | String? ≤200 | "Cocok untuk …", dipakai bot saat klien bingung memilih |
| `botNotes` | String? ≤300 | Catatan singkat khusus layanan ini untuk bot |

`description` dan `outputFormat` yang sudah ada ikut dipakai. **Yang perlu disiapkan klien** diturunkan otomatis dari
field brief wajib layanan (`getBriefConfig` + `BRIEF_FIELD_DESCRIPTIONS`), tidak diketik.

Bot:

- System prompt (di-cache) memuat **daftar layanan satu baris per layanan**: nama + harga mulai (bila ada).
- `list_services` mengembalikan juga `startingPrice`, `suitableFor`, `outputFormat`; deskripsi tool diperbarui.
- Saat order punya layanan, STATE memuat detail layanan itu (cocok untuk, format, catatan, yang perlu disiapkan).
- Aturan prompt baru: boleh menyebut "mulai Rp…" persis sesuai data, selalu dengan kata "mulai" dan keterangan
  bahwa harga final dikirim tim setelah brief lengkap. Tetap dilarang: total, perkiraan di luar harga mulai,
  negosiasi, lama pengerjaan.
- `reply-guard`: angka yang sama persis dengan `startingPrice` layanan aktif diizinkan (selain nilai aturan harga
  terbit). Angka lain tetap dihapus sebelum harga final ada.
- Order WA (panel harga) menampilkan harga mulai layanan sebagai patokan.
- Menggantikan `02-pengetahuan-layanan.md`.

## 6. Bagian 3: Gaya bahasa

Bagian baru di Panduan bot (ikut draft → Uji bot → terbit, disimpan sebagai `style` Json di draft dan
`WaBotGuideVersion.style Json?`):

| Field | Pilihan |
|---|---|
| `greeting` | "kak" · "kakak" · nama klien bila diketahui |
| `tone` | santai · sopan · formal |
| `length` | singkat (1–2 paragraf) · sedang (≤3 paragraf) |
| `emoji` | tidak · sesekali (≤1 per balasan) |
| `notes` | teks ≤500 karakter |
| `examples` | 0–3 contoh: { situasi ≤80, balasan ≤400 } |

- Dirender menjadi blok **Gaya** ringkas yang menggantikan bagian "# Gaya" statis di system prompt (bagian larangan
  menyebut hal internal tetap statis).
- Aturan hemat pesan (tanya 3–4 hal sekaligus, tidak membalas "siap kak" saja) menjadi aturan tetap di prompt,
  bukan pilihan, karena berkaitan dengan biaya.
- Menggantikan `01-gaya-komunikasi.md` dan `04-contoh-percakapan.md`.
- Panduan tanpa `style` (versi lama) memakai default = gaya sekarang.

## 7. Bagian 4: Aturan tambahan (add-on) + graph

### 7.1 Add-on

`knowledgeFiles` menjadi **Aturan tambahan**. Setiap file mendapat `appliesTo`:

```ts
appliesTo: { scope: "ALL" } | { scope: "SERVICES"; serviceCodes: string[] } | { scope: "STAGES"; stages: Stage[] }
type Stage = "NO_ORDER" | "BRIEF" | "AWAITING_QUOTE" | "PAYMENT" | "PROJECT";
// BRIEF = COLLECTING; PAYMENT = QUOTED + DP_REVIEW; PROJECT = klien menanyakan project yang sudah berjalan
```

- `ALL` → di system prompt (di-cache), seperti sekarang.
- `SERVICES` / `STAGES` → hanya di STATE ketika layanan order atau tahapnya cocok. Add-on `PROJECT` ikut di hasil
  tool `get_my_projects` / `get_project_by_code`, jadi terbaca pada giliran yang sama tanpa panggilan tambahan.
- File lama tanpa `appliesTo` = `ALL` (tidak ada perilaku yang berubah sampai owner menandai).
- `instructions` (teks bebas Panduan) dipindah satu kali menjadi add-on `ALL` berjudul "Catatan umum"; kolomnya tidak
  dihapus (aturan db push aditif), hanya tidak ditampilkan lagi.
- Batas jumlah/ukuran file tetap (`WA_BOT_GUIDE_LIMITS`).

### 7.2 Otak bot (graph + token)

`buildBrain` (`ai/brain.ts`) membangun node dari data nyata:

- Node: Operasional, Gaya, setiap Layanan, setiap Add-on, setiap Tahap, FAQ, Aturan harga.
- Edge: add-on → layanan/tahap tempat ia berlaku; layanan → tahap BRIEF (field brief); Operasional → PAYMENT/PROJECT.
- Mind map yang ada (`KnowledgeMindMap`) dipakai ulang; klik node membuka sumbernya (menu Layanan, Operasional,
  Panduan).
- **Meter token**: perkiraan muatan tetap (system prompt) dan tambahan per konteks (mis. "Packaging Box + tahap
  brief: +180 token"). Perkiraan = karakter / 4, diberi label "perkiraan".

### 7.3 Migrasi file lama

Empat file lama tetap dipakai sampai bagian penggantinya terbit. Otak bot menandai file yang isinya sudah tercakup
fitur ("Sudah diganti oleh Layanan") supaya owner menghapusnya sendiri. Tidak ada penghapusan otomatis. Isi awal
`suitableFor` dan Gaya bahasa diusulkan dari file lama; owner memeriksa sebelum menyimpan.

## 8. Perubahan dokumen bisnis

- BRD, tabel aturan bisnis baris "Price" (±baris 378): "Bot boleh menyebut harga mulai per layanan sesuai menu Layanan; harga final
  tetap ditentukan admin setelah brief dikonfirmasi." Dicatat sebagai perubahan 2026-11-07.
- `docs/WHATSAPP_AI_CHATBOT.md` §3 (tabel aturan) dan system prompt "Batas yang tidak boleh dilanggar".
- DP dan kuota revisi: BRD mencatat bahwa nilainya diatur di Operasional studio (default 50% / 3x).
- Dokumen fitur baru: `docs/STUDIO_OPERATIONS.md` (Bagian 1), pembaruan `WHATSAPP_BOT_KNOWLEDGE.md` (Bagian 4).

## 9. Token: perkiraan

| Muatan | Sekarang | Sesudah |
|---|---|---|
| Pengetahuan selalu dimuat | ±1.700 token (4 file) | Kebijakan ±100 + Gaya ±150–300 + daftar layanan ±15/layanan + add-on `ALL` |
| Detail layanan | selalu (di file) | hanya saat layanan dipilih (±60–120) |
| Add-on khusus | selalu | hanya saat cocok |

Angka akhir diukur di Otak bot setelah Bagian 4. Bagian statis tetap di-cache, jadi selisih biaya terbesar ada di
konteks yang jarang dipakai yang tidak lagi dimuat.

## 10. Keamanan dan izin

- Operasional, Layanan, Panduan: khusus owner (`OWNER_ONLY_API` + menu rules). Validasi Zod di server.
- Data yang terlihat klien: hanya harga mulai, cocok untuk, format, dan teks kebijakan yang owner tulis. `botNotes`
  dan add-on tidak pernah dikutip mentah (aturan prompt yang sudah ada untuk catatan internal).
- Isi add-on/Gaya tetap diperlakukan sebagai panduan, tidak bisa mengubah "Batas yang tidak boleh dilanggar"
  (urutan prompt: aturan inti setelah panduan owner, seperti sekarang).

## 11. Pengujian

- Unit: render blok Kebijakan/Gaya/daftar layanan; pemilihan add-on per layanan/tahap; `reply-guard` mengizinkan harga
  mulai persis dan menolak angka lain; snapshot `revisionQuota`/`dpPercent`; route revisi memakai kuota project.
- Uji bot (sandbox): tanya harga sebelum brief → "mulai Rp…" + harga final menyusul; handoff di luar jam kerja.
- Validasi tiap bagian: typecheck, lint, test, build; UI lewat UI/UX Pro Max + `/antislop` (CLAUDE.md).

## 12. Di luar lingkup

- Bot menyebut lama pengerjaan / deadline.
- Harga bertingkat per varian layanan (cukup satu harga mulai).
- Hari libur nasional otomatis (owner bisa menulisnya di `outsideHoursNote` / add-on).
- Pencarian semantik (RAG).
