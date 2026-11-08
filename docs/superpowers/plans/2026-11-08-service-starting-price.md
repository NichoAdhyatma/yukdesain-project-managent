# Layanan + Harga Mulai (Bagian 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu Layanan menyimpan harga mulai, catatan harga, "cocok untuk", dan catatan bot. Bot membaca daftar layanan dari sana, boleh menyebut "mulai Rp…" persis sesuai data, dan menerima detail layanan order di STATE. Order WA menampilkan harga mulai sebagai patokan.

**Architecture:**
- Kolom baru di `Service` dibaca lewat satu modul data, `src/lib/whatsapp/ai/service-catalog.ts`, yang berisi validasi Zod, query katalog aktif, dan angka harga yang diizinkan.
- Render teks untuk bot tetap di `system-prompt.ts`:
  - daftar layanan satu baris per layanan, di system prompt yang di-cache;
  - detail layanan order, di blok STATE dinamis.
- Penjaga harga menerima angka katalog bersama angka aturan harga.

**Tech Stack:** Next.js 16 App Router, Prisma (`db push`, aditif), Zod, TanStack Query, Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-07-bot-knowledge-features-design.md` §2, §5 (Bagian 2), §8, §10, §11.

## Global Constraints

- **Schema hanya aditif.** Semua kolom baru nullable, tanpa `@unique`, dan tidak ada kolom yang dihapus.
- **Rentang nilai:**

  | Kolom | Aturan |
  |---|---|
  | `startingPrice` | bilangan bulat rupiah 1–100.000.000, atau kosong |
  | `priceNote` | ≤80 karakter |
  | `suitableFor` | ≤200 karakter |
  | `botNotes` | ≤300 karakter |

  String kosong setelah trim disimpan sebagai `null`.
- **Kolom kosong = perilaku sekarang.**
  - `startingPrice` kosong: bot tidak menyebut harga untuk layanan itu.
  - Teks kosong: barisnya tidak dirender.
- **Kata kunci harga.** Bot menyebut harga hanya dengan kata "mulai", dan selalu menambahkan bahwa harga final dikirim tim setelah brief lengkap.
- **Tetap dilarang untuk bot:** total, kisaran lain, negosiasi, dan lama pengerjaan.
- **Format angka.** Harga dirender dengan `formatRupiah` (mis. "Rp150.000") supaya bot mengutip format yang sama dengan yang diizinkan penjaga.
- **"Yang perlu disiapkan klien" tidak diketik.** Nilainya diturunkan dari `getBriefConfig(code).requiredFields` + `BRIEF_FIELD_DESCRIPTIONS`.
- **Hal internal tidak pernah dikutip mentah.** `botNotes` dan kode layanan tidak disebut ke klien; aturan "# Gaya" yang ada sudah melarang kode layanan.
- **Kolom bot khusus owner.** Field `startingPrice`, `priceNote`, `suitableFor`, `botNotes` hanya diterima dan dikembalikan untuk `user.roles.includes("OWNER")`.
- **Bahasa.** Teks UI dan komentar berbahasa Indonesia, tanpa em dash di copy.
- **UI.** Pakai UI/UX Pro Max sebelum implementasi dan `/antislop` sesudahnya (CLAUDE.md).

## Review Focus

1. **Bot menulis angka dalam bentuk lain** ("150 ribu", "150rb", "Rp 150.000,-") untuk layanan berharga Rp150.000.
   - Yang diharapkan: penjaga tetap menghapus kalimatnya.
   - Prompt meminta format persis, dan hanya digit yang sama yang lolos.
   - Tes di Task 3.
2. **Angka yang mirip harga mulai tapi bukan harga mulai** ("mulai Rp120.000" saat data Rp150.000), atau total dari perkalian ("2 logo jadi Rp300.000").
   - Yang diharapkan: kalimatnya dihapus.
   - Tes di Task 3.
3. **Desainer (bukan owner) memanggil `GET /api/services`.**
   - Yang diharapkan: respons tidak memuat `startingPrice`, `priceNote`, `suitableFor`, `botNotes`.
   - Desainer yang mengirim field itu lewat `PUT` mendapat 401, seperti sekarang.
   - Tes di Task 2.
4. **Owner menyimpan harga, lalu daftar Layanan langsung dibuka ulang.**
   - Yang diharapkan: nilai baru langsung tampil, bukan cache browser 1 jam.
   - Halaman Layanan memakai `cache: "no-store"`.
   - Diverifikasi di browser di Task 2.
5. **Layanan nonaktif, atau tanpa konfigurasi brief.**
   - Yang diharapkan: tidak muncul di daftar layanan prompt, dan harganya tidak masuk angka yang diizinkan penjaga.
   - Tes di Task 1.

---

### Task 1: Schema + modul katalog layanan

**Files:**
- Modify: `prisma/schema.prisma` (`Service`)
- Create: `src/lib/whatsapp/ai/service-catalog.ts`
- Test: `src/lib/whatsapp/ai/service-catalog.test.ts`

**Interfaces:**
- Produces:
  - `type BotService = { code: string; name: string; description: string | null; outputFormat: string | null; startingPrice: number | null; priceNote: string | null; suitableFor: string | null; botNotes: string | null }`
  - `serviceBotFieldsSchema`: Zod `z.object({ startingPrice, priceNote, suitableFor, botNotes })`, semua opsional dan nullable. Teks di-trim, string kosong menjadi `null`. Pesan error berbahasa Indonesia.
  - `SERVICE_BOT_LIMITS = { startingPriceMax: 100_000_000, priceNoteMaxChars: 80, suitableForMaxChars: 200, botNotesMaxChars: 300 } as const`, di `src/lib/constants/index.ts`
  - `getBotServiceCatalog(): Promise<BotService[]>`: layanan `isActive` yang punya `getBriefConfig(code)`, urut `code` naik.
  - `servicePriceNumbers(services: BotService[]): string[]`: digit polos dari `startingPrice` plus angka di `priceNote`. Digit diambil dengan aturan yang sama seperti `digitsOf` di reply-guard (titik dan koma dibuang).

- [ ] **Step 1: Tambah kolom schema**

  Tambahkan di `Service` dengan komentar rujukan spec §5:
  - `startingPrice Int?`
  - `priceNote String?`
  - `suitableFor String?`
  - `botNotes String?`

  Run: `npx prisma generate && npx prisma db push`
  Expected: "Your database is now in sync".

- [ ] **Step 2: Tulis tes yang gagal** (mock `@/lib/db`)
  - `serviceBotFieldsSchema.parse({ startingPrice: 150000, priceNote: "  A3 mulai Rp200.000 ", suitableFor: "", botNotes: null })` → `{ startingPrice: 150000, priceNote: "A3 mulai Rp200.000", suitableFor: null, botNotes: null }`.
  - Schema menolak:
    - `startingPrice: 0`,
    - `startingPrice: 100_000_001`,
    - `startingPrice: 1500.5`,
    - `priceNote` 81 karakter.
  - `getBotServiceCatalog()`: mock `prisma.service.findMany`. Layanan dengan kode tanpa konfigurasi brief (mis. `"SVC-99"`) tidak ikut, dan query memakai `where: { isActive: true }`.
  - `servicePriceNumbers([{ startingPrice: 150000, priceNote: "A3 mulai Rp200.000" }, { startingPrice: null, priceNote: null }])` → `["150000", "200000"]`.

- [ ] **Step 3: Jalankan tes, pastikan gagal**

  Run: `npx vitest run src/lib/whatsapp/ai/service-catalog.test.ts`
  Expected: FAIL (modul belum ada).

- [ ] **Step 4: Implementasikan modul dan konstanta**

  Modul tidak mengimpor `system-prompt.ts`, supaya tidak terjadi impor melingkar.

- [ ] **Step 5: Jalankan tes, pastikan lulus**

  Run: `npx vitest run src/lib/whatsapp/ai/service-catalog.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit**

  `feat: kolom harga mulai dan pengetahuan bot di Layanan`

### Task 2: API Layanan + halaman Layanan

**Files:**
- Modify: `src/app/api/services/route.ts`, `src/app/api/services/[id]/route.ts`
- Modify: `src/app/(dashboard)/services/page.tsx`
- Create: `src/lib/services/service-dto.ts`
- Test: `src/lib/services/service-dto.test.ts`

**Interfaces:**
- Consumes: `serviceBotFieldsSchema`, `SERVICE_BOT_LIMITS` (Task 1)
- Produces:
  - `toServiceDto(service: Service, isOwner: boolean)`:
    - owner: semua kolom;
    - bukan owner: tanpa `startingPrice`, `priceNote`, `suitableFor`, `botNotes`.
  - `parseServiceBotFields(body: unknown): { ok: true; data: Partial<BotFields> } | { ok: false; fields: Record<string, string> }`
    - Hanya field yang ada di body yang masuk ke `data`, supaya PUT parsial tidak mengosongkan kolom lain.

- [ ] **Step 1: Tulis tes yang gagal**
  - `toServiceDto(svc, false)` tidak punya kunci `startingPrice`, `priceNote`, `suitableFor`, `botNotes`.
  - `toServiceDto(svc, true)` punya keempatnya.
  - `parseServiceBotFields({ name: "x" })` → `{ ok: true, data: {} }`.
  - `parseServiceBotFields({ startingPrice: 0 })` → `ok: false`, dengan pesan di `fields.startingPrice`.
  - `parseServiceBotFields({ startingPrice: null })` → `data: { startingPrice: null }` (owner mengosongkan harga).

- [ ] **Step 2: Jalankan tes, pastikan gagal**

  Run: `npx vitest run src/lib/services/service-dto.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementasikan DTO, lalu pakai di route**
  - `GET`: `services.map(s => toServiceDto(s, isOwner))`.
  - `POST` dan `PUT`: gabungkan `parseServiceBotFields` ke `data`. Error validasi → 400 `{ error: "Data tidak valid", fields }`.
  - `Cache-Control` di `GET` dibiarkan; halaman Layanan yang memakai `no-store`.

- [ ] **Step 4: Jalankan tes, pastikan lulus**

  Run: `npx vitest run src/lib/services/service-dto.test.ts`
  Expected: PASS.

- [ ] **Step 5: UI halaman Layanan** (UI/UX Pro Max dulu)
  - Form buat dan form edit mendapat bagian **"Untuk bot WhatsApp"**:
    - **Harga mulai**: `CurrencyInput` dari `src/components/ui/currency-input.tsx`, boleh kosong.
    - **Catatan harga**: input dengan counter /80.
    - **Cocok untuk**: textarea dengan counter /200.
    - **Catatan untuk bot**: textarea dengan counter /300.
    - Helper text: "Kosongkan harga jika bot tidak boleh menyebut harga layanan ini."
  - Error dari `fields` ditampilkan di bawah field-nya.
  - Kartu layanan menampilkan "Mulai Rp…" + catatan harga. Bila kosong: "Harga mulai belum diisi".
  - Semua `fetch("/api/services…")` di halaman ini memakai `{ cache: "no-store" }`.
  - Pastikan state kosong, loading, dan error ada, serta layout mobile 375px.

- [ ] **Step 6: Verifikasi**

  Run: `npx tsc --noEmit -p . && npx eslint "src/app/(dashboard)/services" src/app/api/services src/lib/services`
  Expected: tanpa error.

  Di browser (dev server):
  - Isi harga 150000, simpan, buka ulang halaman → nilai tampil.
  - Kosongkan harga → "Harga mulai belum diisi".

- [ ] **Step 7: Commit**

  `feat: isian harga mulai dan pengetahuan bot di menu Layanan`

### Task 3: Bot memakai katalog (prompt, STATE, tool, penjaga harga)

**Files:**
- Modify: `src/lib/whatsapp/ai/system-prompt.ts`, `src/lib/whatsapp/ai/conversation.ts`, `src/lib/whatsapp/ai/tools.ts`, `src/lib/whatsapp/ai/brain.ts`
- Test: `src/lib/whatsapp/ai/system-prompt.test.ts`, `src/lib/whatsapp/ai/reply-guard.test.ts`, `src/lib/whatsapp/ai/tools.test.ts`, `src/lib/whatsapp/ai/brain.test.ts` (sesuaikan pemanggilan)

**Interfaces:**
- Consumes: `BotService`, `getBotServiceCatalog`, `servicePriceNumbers` (Task 1)
- Produces:
  - `buildSystemPrompt(studioName: string, guide: BotGuide | null, ops: StudioOperations, services: BotService[]): string`. Parameter keempat baru; semua pemanggil diperbarui.
  - `renderServiceCatalog(services: BotService[]): string`: blok `# Layanan`, satu baris per layanan. Formatnya `- {name} ({code}): mulai {formatRupiah(startingPrice)}{priceNote ? ` (${priceNote})` : ""}{suitableFor ? `. Cocok untuk: ${suitableFor}` : ""}`. Bila tanpa harga, bagian "mulai …" diganti "harga dikirim tim setelah brief".
  - `renderServiceDetail(service: BotService): string`: baris STATE berisi:
    - "Detail layanan order",
    - cocok untuk, format file, catatan internal (diberi label "jangan dikutip"),
    - "Yang perlu disiapkan klien: …" dari `requiredFields` → `BRIEF_FIELD_DESCRIPTIONS`.
  - `StateInput.intake.serviceDetail?: BotService | null`

- [ ] **Step 1: Tulis tes yang gagal**

  `system-prompt.test.ts`:
  - `renderServiceCatalog([{ code: "SVC-01", name: "Logo Minimalis", startingPrice: 150000, priceNote: "termasuk 3 konsep", suitableFor: "brand modern", … }])` memuat `"- Logo Minimalis (SVC-01): mulai Rp150.000 (termasuk 3 konsep). Cocok untuk: brand modern"`.
  - Layanan tanpa harga memuat `"harga dikirim tim setelah brief"` dan tidak memuat `"mulai Rp"`.
  - `buildSystemPrompt(…, services)` memuat `# Layanan` dan aturan baru. Kalimat persisnya ada di Step 3.
  - `buildStateBlock` dengan `serviceDetail` memuat `"Yang perlu disiapkan klien:"` beserta deskripsi field wajib layanan itu (mis. `"nama brand/usaha"` untuk layanan logo).

  `reply-guard.test.ts`, memakai `stripPriceMentions(text, "", ["150000"])`:
  - `"Logo Minimalis mulai Rp150.000 ya kak."` → tidak berubah.
  - `"Logo Minimalis mulai Rp120.000 ya kak."` → dihapus, dan `PRICE_PLACEHOLDER` ditambahkan.
  - `"Kalau 2 logo jadi Rp300.000 kak."` → dihapus.
  - `"Harganya 150 ribu kak."` → dihapus.

  `tools.test.ts`:
  - `list_services` mengembalikan `startingPrice`, `priceNote`, `suitableFor`, `outputFormat`, tanpa `botNotes`.

- [ ] **Step 2: Jalankan tes, pastikan gagal**

  Run: `npx vitest run src/lib/whatsapp/ai`
  Expected: FAIL pada tes baru.

- [ ] **Step 3: Implementasikan**
  - **Aturan harga.** Ganti butir pertama "# Batas yang tidak boleh dilanggar" dengan teks ini (persis):

    > Harga final dan deadline ditentukan tim kami, bukan kamu. Kamu boleh menyebut harga mulai sebuah layanan hanya persis seperti di daftar Layanan, selalu dengan kata "mulai", lalu tambahkan bahwa harga final dikirim tim kami setelah brief lengkap. Selain itu jangan pernah menyebut, menghitung total, memperkirakan, atau memberi kisaran harga maupun lama pengerjaan sebelum angkanya ada di blok STATE. Untuk layanan tanpa harga mulai, atau jika ditanya lama pengerjaan: "Harga dan estimasi waktu akan dikirim tim kami setelah brief lengkap ya."

  - **Penempatan blok.** `renderServiceCatalog` diletakkan setelah blok Kebijakan, sebelum panduan owner.
  - **Instruksi intake.** Ganti "gunakan list_services, lalu start_intake" menjadi "pilih dari daftar Layanan (list_services bila perlu deskripsi lengkap), lalu start_intake".
  - **`conversation.ts`:**
    - `const services = await getBotServiceCatalog()` sekali per giliran;
    - teruskan ke `buildSystemPrompt`;
    - `buildState` menerima `services` dan mengisi `serviceDetail` dengan layanan yang kodenya sama dengan `intake.service.code`;
    - `allowedPriceNumbers: [...allowedPriceNumbers(guide), ...servicePriceNumbers(services)]`.
  - **`tools.ts`.** `list_services` memilih kolom baru (tanpa `botNotes`). Deskripsi tool diganti: "Daftar layanan desain yang aktif: kode, nama, deskripsi, format output, harga mulai, catatan harga, cocok untuk. Harga mulai bukan harga final."
  - **`brain.ts`.** `buildBrain` memanggil `getBotServiceCatalog()` dan meneruskannya ke `buildSystemPrompt`. Node per layanan menyusul di Bagian 4.

- [ ] **Step 4: Jalankan tes, pastikan lulus**

  Run: `npx vitest run src/lib/whatsapp`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat: bot membaca katalog Layanan dan boleh menyebut harga mulai`

### Task 4: Patokan harga di Order WA

**Files:**
- Modify: `src/lib/whatsapp/intake-api.ts` (select `service` di detail: tambah `startingPrice`, `priceNote`)
- Modify: `src/components/wa-orders/types.ts`, `src/components/wa-orders/QuotePanel.tsx`
- Test: `src/lib/whatsapp/intake-api.test.ts`

**Interfaces:**
- Produces: `WaIntakeDetail.service: { id: string; code: string; name: string; startingPrice: number | null; priceNote: string | null } | null`

- [ ] **Step 1: Tulis tes yang gagal**

  DTO detail intake meneruskan `service.startingPrice` dan `service.priceNote`.

- [ ] **Step 2: Jalankan tes, pastikan gagal**

  Run: `npx vitest run src/lib/whatsapp/intake-api.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implementasikan DTO, lalu ubah QuotePanel**
  - Di bawah label Harga tampil teks bantu "Patokan layanan: mulai Rp… (catatan)". Tidak tampil bila `startingPrice` kosong.
  - Isian harga **tidak** diisi otomatis; keputusan owner: hanya patokan.

- [ ] **Step 4: Jalankan tes, pastikan lulus, lalu typecheck**

  Run: `npx vitest run src/lib/whatsapp/intake-api.test.ts && npx tsc --noEmit -p .`
  Expected: PASS, tanpa error.

- [ ] **Step 5: Commit**

  `feat: patokan harga mulai di panel harga Order WA`

### Task 5: Dokumen, validasi menyeluruh, checkpoint

**Files:**
- Modify: `docs/yukdesain_studio_portal_BRD_FINAL_v2.md` (tabel aturan, baris "Price" ±378)
- Modify: `docs/WHATSAPP_AI_CHATBOT.md` (§3 baris Harga, §"Bot tidak boleh")
- Create: `docs/SERVICES_CATALOG.md` (kolom, siapa yang bisa melihat, cara bot memakainya, penjaga harga)
- Create: `checkpoints/checkpoint-056-service-starting-price/README.md` (folder diabaikan git; dibuat lokal)

- [ ] **Step 1: Perbarui dokumen bisnis**
  - BRD baris Price diganti menjadi: "Set by admin after the client confirms the brief. The bot may state a service's starting price exactly as set in the Services menu (always as "mulai"); it never states a final price, total, range, or duration before admin sets it. (Changed 2026-11-08, owner decision.)"
  - Baris yang sama di `WHATSAPP_AI_CHATBOT.md` §3 diubah dalam bahasa Indonesia.

- [ ] **Step 2: Tulis `docs/SERVICES_CATALOG.md`**

  Isinya sesuai spec §5, ditambah:
  - Review Focus 1–3 sebagai perilaku yang dijamin;
  - langkah setelah deploy: owner mengisi harga mulai dan "cocok untuk" di menu Layanan, lalu mencoba di Uji bot.

- [ ] **Step 3: Validasi menyeluruh**

  Run: `npx tsc --noEmit -p . && npx eslint src --quiet && npx vitest run && npm run build`
  Expected: semua lulus.

- [ ] **Step 4: Review UI**

  Jalankan `/antislop` pada halaman Layanan dan QuotePanel, lalu perbaiki temuan yang valid.

- [ ] **Step 5: Uji bot manual (dev)**
  - Isi harga di satu layanan.
  - Di Uji bot tanya "logo berapa kak?".
  - Yang diharapkan: bot menjawab "mulai Rp…" dan menyebut bahwa harga final menyusul setelah brief.
  - Tanyakan juga "berapa lama jadinya?". Yang diharapkan: kalimat standar, tanpa angka.

- [ ] **Step 6: Commit dan buka PR**

  `docs: aturan harga mulai di BRD dan dokumen Layanan`
