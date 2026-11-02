# Panduan Bot & Uji Bot

Fitur tambahan untuk bot WhatsApp (`docs/WHATSAPP_AI_CHATBOT.md`). Owner memilih cakupan
"Panduan + Uji bot" dan menyetujui desain ini pada 2026-11-02; sudah diimplementasikan (checkpoint 047).

## 1. Masalah

Perilaku bot hanya bisa diubah lewat kode (`src/lib/whatsapp/ai/system-prompt.ts`). Owner ingin memberi
aturan tambahan dan informasi bisnis (FAQ, gaya bahasa, jam layanan, dll.), lalu mencobanya sebelum dipakai
ke klien.

Ini **bukan** melatih ulang model (fine-tuning). Model Claude tidak dilatih ulang; yang diatur adalah instruksi
yang dikirim bersama setiap pesan. Perubahan langsung berlaku tanpa menunggu proses training.

## 2. Yang diatur owner

**Panduan bot** di Settings › WhatsApp:

1. **Aturan tambahan** — teks bebas, maksimal 4.000 karakter. Contoh: jam respons admin, cara menjawab
   pertanyaan file mentah, kebiasaan studio, larangan tambahan.
2. **FAQ** — daftar pertanyaan → jawaban, maksimal 30 item, jawaban maksimal 500 karakter. Bot memakai jawaban
   ini apa adanya untuk pertanyaan yang mirip.

Info layanan (nama, deskripsi, format output) tetap diambil dari menu Services, tidak diketik ulang di panduan.

## 3. Yang tidak bisa diubah oleh panduan

Aturan di `docs/WHATSAPP_AI_CHATBOT.md` §2 dan §10.4 tetap menang, dan sebagian dijaga di server (bukan
hanya di prompt), sehingga panduan tidak bisa membatalkannya:

- Bot tidak menyebut harga, kisaran harga, atau lama pengerjaan sebelum admin mengisinya (server menghapus
  angka harga dari balasan sebelum status QUOTED).
- Bot tidak bernegosiasi, tidak menyatakan DP valid, tidak membuat project.
- Topik di luar YukDesain ditolak (aturan Meta).
- Data klien lain tidak pernah dibuka.

Di prompt, panduan ditempatkan **setelah** aturan wajib dengan kalimat: panduan owner berlaku selama tidak
bertentangan dengan batas di atas. Di UI ada catatan singkat tentang batas ini, supaya owner tidak heran
kalau misalnya "harga mulai Rp500 ribu" di FAQ tidak pernah disebut bot.

## 4. Alur: draft → uji → terbitkan

- Owner mengedit **draft**. Draft tidak dipakai ke klien.
- **Uji bot**: panel chat di portal. Owner mengetik sebagai klien; bot menjawab memakai draft, dengan model,
  tools, dan aturan yang sama seperti production. Tidak ada pesan WhatsApp yang dikirim.
- **Terbitkan**: draft menjadi versi aktif. Setiap terbitan disimpan sebagai versi (nomor, waktu, siapa).
- **Kembalikan versi**: memilih versi lama menyalinnya ke draft, lalu diterbitkan seperti biasa.
- Hanya OWNER (sama seperti Settings WhatsApp lainnya).

## 5. Uji bot (simulator)

- Percakapan uji disimpan sebagai `WaConversation` biasa dengan penanda `isSandbox = true` dan `waId`
  `sandbox:<userId>` (bukan angka, jadi tidak pernah cocok dengan nomor klien). Satu percakapan uji per owner.
- Semua tools berjalan normal (memilih layanan, mengisi brief, konfirmasi brief), supaya yang diuji benar-benar
  perilaku production.
- Percakapan dan order uji **disaring** dari: daftar dan detail Order WA, badge sidebar, kartu dashboard,
  statistik pemakaian, rate limit, approve/quote/reject/cancel/resend (404), dan pencocokan klien.
- Tombol **Mulai ulang** menghapus percakapan uji beserta order ujinya.
- Versi pertama: teks saja (tanpa unggah gambar), dan alur berhenti di "Perlu Harga". Simulasi harga/DP di
  simulator bisa ditambahkan nanti.
- Biaya: sama seperti chat biasa (Claude), sekitar Rp20 per pesan uji dengan model default (perkiraan).

## 6. Perubahan teknis (ringkas)

| Bagian | Perubahan |
|---|---|
| Schema | model baru `WaBotGuideVersion` (instructions, faqs JSON, version, status DRAFT/PUBLISHED, createdBy, publishedAt); `WaConversation.isSandbox Boolean @default(false)` — additive, `db push` |
| Prompt | `buildSystemPrompt(studioName, guide)` menambahkan blok panduan setelah aturan wajib; tetap satu blok yang di-cache (berubah hanya saat terbit) |
| API | `GET/PUT /api/settings/whatsapp/guide` (draft), `POST …/guide/publish`, `GET …/guide/versions`, `POST …/guide/restore`; `POST /api/settings/whatsapp/sandbox` (kirim pesan uji), `DELETE …/sandbox` (mulai ulang) — semua owner-only, DTO eksplisit, zod |
| Filter | satu helper `notSandbox` dipakai di semua query Order WA, statistik, dan rate limit; test memastikan order uji tidak muncul |
| UI | Settings › WhatsApp: kartu "Panduan bot" (aturan, FAQ, draft/terbit, riwayat versi) dan panel "Uji bot" |

## 7. Keputusan owner (2026-11-02)

1. Batas: aturan tambahan 4.000 karakter; 30 FAQ (pertanyaan 200, jawaban 500 karakter) —
   `WA_BOT_GUIDE_LIMITS` di `src/lib/constants`.
2. Hanya OWNER yang bisa mengedit, menerbitkan, dan memakai Uji bot.

## 8. Catatan implementasi

- **Env AI terpisah dari env WhatsApp.** `getAiConfig()` dulu memvalidasi seluruh env WhatsApp, sehingga Uji bot
  dan Uji koneksi gagal sebelum token Meta dan bucket privat diisi. Sekarang memakai `getAiEnv()` /
  `isAiConfigured()` (cukup `ANTHROPIC_API_KEY`); webhook dan pengiriman WhatsApp tetap memakai validasi penuh.
  Settings menampilkan `aiConfigured` dan Uji koneksi aktif begitu key Claude ada.
- **Uji bot tetap jalan saat "Balas otomatis" nonaktif** dan tanpa batas banjir pesan (owner sedang menguji).
  Batas 80 balasan/hari dan semua penjaga balasan (harga, sanitizer) tetap berlaku.
- Balasan uji disimpan sebagai `WaMessage` dengan `deliveryStatus = "sandbox"`; tidak ada panggilan Graph API.
- Penyaring `REAL_INTAKE` (`src/lib/whatsapp/intake-api.ts`) dipakai di list, hitungan, detail, PATCH brief, quote,
  reject, cancel, resend; `approveIntake` dan kartu dashboard memakai filter yang sama; statistik pemakaian
  mengecualikan percakapan uji. **Route baru di bawah `/api/wa-intakes/[id]/` wajib memakai `REAL_INTAKE`.**
- Prompt: panduan masuk ke blok system pertama (yang di-cache), setelah aturan wajib. Cache tetap efektif karena
  panduan hanya berubah saat diterbitkan.
