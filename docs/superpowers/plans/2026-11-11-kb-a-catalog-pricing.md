# KB Bagian A: Katalog dan Harga Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layanan punya mode harga pasti/mulai, paket, harga per unit, dan estimasi; bot menjawab harga pasti langsung, menghitung lewat kalkulator server, menyebut estimasi dari data; layanan baru dari KB bisa dipesan lewat WA dan form brief.

**Architecture:**
- Kolom baru di `Service` divalidasi di `service-catalog.ts`.
- Kalkulator murni `src/lib/services/price-calculator.ts` dipakai tool bot `calculate_price` dan panel harga Order WA.
- Prompt menampilkan katalog lengkap (mode, paket, unit, estimasi).
- `reply-guard` menerima tiga tingkat izin baru:
  - angka katalog harga pasti tanpa syarat "mulai";
  - angka hasil kalkulator giliran itu;
  - durasi yang sama dengan estimasi layanan.

**Tech Stack:** Next.js 16, Prisma (`db push` aditif), Zod, Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-11-kb-merge-design.md` §2, §4, §7.

## Global Constraints

- **Schema aditif:**
  - `priceMode String @default("STARTING")`;
  - `packages Json?`, `unitPricing Json?`, `estimate String?`;
  - tanpa menghapus kolom.
- **`packages`:**
  - maks 6, `{ name 1..40, price 1..100.000.000 int, note? ≤120 }`;
  - bila ada, `startingPrice` diisi otomatis = harga paket termurah.
- **`unitPricing`:**
  - `{ unitLabel 1..20, includedUnits int ≥0, extraUnitPrice int 1..100.000.000, minUnits? int ≥1 }`;
  - total = `startingPrice + max(0, units − includedUnits) × extraUnitPrice`;
  - unit < `minUnits` ditolak.
  - Buku Menu memakai `startingPrice` 0 → `startingPrice` boleh 0 **hanya bila** `unitPricing` ada.
- **`estimate`:** ≤40 karakter, mis. "3 hari", "5–7 hari".
- **Harga pasti:** angka disebut tanpa "mulai". **Harga mulai:** tetap dengan "mulai" (perilaku Bagian 2).
- **Bot tidak menjumlahkan layanan berbeda dan tidak memberi diskon.** Express, harga gabungan, dan custom tetap `ask_owner`.
- **Kolom bot di DTO Layanan khusus owner** (`toServiceDto`). `packages` dan `estimate` termasuk.
- **Kode layanan baru:** SVC-12 Buku Menu, SVC-13 Social Media Auto Pilot, SVC-14 Social Media Design Package, SVC-15 Paket Duo Pack.
- **Kunci brief baru:** `page_count`, `package_choice`, `variant_count`, `pose_count` (teks/angka sebagai teks).
- **Bahasa:** teks UI bahasa Indonesia, tanpa em dash. UI/UX Pro Max sebelum, `/antislop` sesudah.

## Review Focus

1. **Klien menulis jumlah dengan kata/angka campur** ("40an item", "sekitar 6 halaman").
   - Yang diharapkan: bot menanyakan angka pasti, bukan memanggil kalkulator dengan tebakan.
   - Kalkulator menolak unit non-bilangan bulat.
   - Tes di Task 2.
2. **Layanan "Harga pasti" yang punya paket** (Photobooth): bot menyebut harga paket, bukan `startingPrice` sebagai harga pasti tunggal.
   - Tes di Task 3.
3. **Owner mengubah layanan dari pasti ke mulai** (atau menghapus harga): penjaga langsung mengikuti katalog baru pada giliran berikutnya.
   - Tes di Task 3.
4. **Durasi dengan angka sama tapi bukan estimasi layanan** ("revisi 3 hari", estimasi "3 hari"): tetap lolos karena angkanya sama.
   - Batasan ini diterima dan dicatat di docs.
   - Kalimat "selesai 1 hari" (bukan estimasi) dihapus.
   - Tes di Task 3.
5. **Form brief web klien untuk layanan baru**: tampil isian generik, bisa dikirim, dan terbaca di `BriefReader`.
   - Tes di Task 5.

---

### Task 1: Schema + validasi kolom katalog

**Files:**
- Modify: `prisma/schema.prisma` (`Service`), `src/lib/whatsapp/ai/service-catalog.ts`, `src/lib/constants/index.ts` (`SERVICE_BOT_LIMITS`), `src/lib/services/service-dto.ts`
- Test: `src/lib/whatsapp/ai/service-catalog.test.ts`, `src/lib/services/service-dto.test.ts`

**Interfaces:**
- Produces:
  - `type ServicePackage = { name: string; price: number; note: string | null }`
  - `type UnitPricing = { unitLabel: string; includedUnits: number; extraUnitPrice: number; minUnits: number | null }`
  - `BotService` mendapat `priceMode: "FIXED" | "STARTING"`, `packages: ServicePackage[]`, `unitPricing: UnitPricing | null`, `estimate: string | null`.
  - `serviceBotFieldsSchema` mendapat keempat field. `parseServiceBotFields` mengisi `startingPrice` dari paket termurah bila `packages` dikirim.
  - `servicePriceGroups` mencakup harga paket dan `extraUnitPrice`.

- [ ] **Step 1: Schema.** Tambah kolom sesuai Global Constraints.
  - Run: `npx prisma generate && npx prisma db push`
  - Expected: in sync.
- [ ] **Step 2: Tes gagal**
  - Paket 7 item ditolak.
  - Paket harga 0 ditolak.
  - `startingPrice` 0 tanpa `unitPricing` ditolak, dengan `unitPricing` diterima.
  - `parseServiceBotFields({ packages: [{name:"Newspaper",price:85000},{name:"Photostrips 4R",price:50000}] })` menghasilkan `data.startingPrice === 50000`.
  - `getBotServiceCatalog` mengembalikan `packages: []` bila kolom null.
  - `servicePriceGroups` untuk Sticker Label (125000, unit +85000) memuat `"125000"` dan `"85000"`.
  - DTO non-owner tanpa `priceMode/packages/unitPricing/estimate`.
- [ ] **Step 3: Implementasi,** lalu jalankan `npx vitest run src/lib/whatsapp/ai/service-catalog.test.ts src/lib/services`. Expected: PASS.
- [ ] **Step 4: Commit.** `feat: mode harga, paket, harga per unit, dan estimasi di Layanan`

### Task 2: Kalkulator harga + tool `calculate_price`

**Files:**
- Create: `src/lib/services/price-calculator.ts`
- Modify: `src/lib/whatsapp/ai/tools.ts`
- Test: `src/lib/services/price-calculator.test.ts`, `src/lib/whatsapp/ai/tools.test.ts`

**Interfaces:**
- Consumes: `BotService` (Task 1).
- Produces:
  - `calculatePrice(service: BotService, input: { packageName?: string; units?: number }): { ok: true; total: number; breakdown: string } | { ok: false; error: string }`
  - Tool `calculate_price` dengan input `{ service_code, package?, units? }`. Hasilnya `ok({ total, breakdown, priceMode })`, atau `fail(error)`. Tool ditambahkan **sebelum** `ask_owner` di `INTAKE_TOOLS`; tes urutan tool diperbarui.
  - Setiap total yang dikembalikan tool dicatat di konteks giliran (`ctx.calculatedTotals: number[]`) untuk penjaga (Task 3).

- [ ] **Step 1: Tes gagal** (nilai dari KB)
  - Poster Menu (135000, item, included 35, +5000): 35 → 135000; 36 → 140000; 40 → 160000.
  - Buku Menu (0, halaman, included 0, +90000, min 5): 6 → 540000; 4 → error "Minimal 5 halaman".
  - Sticker Label (125000, varian, included 1, +85000): 3 → 295000.
  - Paket Photobooth "Newspaper" → 85000; paket tak dikenal → error.
  - `units: 6.5` dan `units: -1` → error (Review Focus 1).
  - Layanan tanpa harga → error "Harga layanan ini belum ada di katalog".
  - Tool: `calculate_price` memanggil kalkulator dengan layanan katalog aktif dan mencatat total ke konteks.
- [ ] **Step 2: Implementasi, jalankan tes.** Run: `npx vitest run src/lib/services/price-calculator.test.ts src/lib/whatsapp/ai/tools.test.ts`. Expected: PASS.
- [ ] **Step 3: Commit.** `feat: kalkulator harga katalog dan tool calculate_price`

### Task 3: Prompt katalog + penjaga harga dan estimasi

**Files:**
- Modify: `src/lib/whatsapp/ai/system-prompt.ts` (`renderServiceCatalog`, aturan harga), `src/lib/whatsapp/ai/reply-guard.ts`, `src/lib/whatsapp/ai/conversation.ts` (`guardExtras`), `src/lib/whatsapp/bot-reply.ts`
- Test: `system-prompt.test.ts`, `reply-guard.test.ts`, `conversation.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2 (`ctx.calculatedTotals`).
- Produces: `GuardExtras` mendapat `fixedPrices: string[]`, `calculatedTotals: string[]`, dan `estimateDays: string[]` (angka dari `estimate`, mis. "3", "5", "7").

- [ ] **Step 1: Tes gagal**
  - Baris katalog:
    - FIXED tanpa paket: `- Banner UMKM (SVC-04): Rp135.000. Estimasi 3 hari`;
    - FIXED dengan paket: `- Frame Photobooth (SVC-09): Newspaper Rp85.000; Photostrips 4R Rp50.000` (Review Focus 2);
    - dengan unit: `… Rp135.000 termasuk 35 item, tambahan Rp5.000 per item`;
    - STARTING tetap `mulai Rp…`.
  - Aturan prompt baru berisi:
    - `"Untuk layanan berharga pasti, sebut angkanya langsung tanpa kata \"mulai\""`;
    - `"Hitungan harga (item, halaman, varian, pose, paket) hanya dari calculate_price"`.
  - Penjaga:
    - `"Desain banner Rp135.000 ya, Kak."` dengan `fixedPrices ["135000"]` → lolos;
    - `"Totalnya Rp160.000 ya, Kak."` dengan `calculatedTotals ["160000"]` → lolos;
    - `"Totalnya Rp170.000"` → dihapus;
    - `"Estimasi pengerjaan 3 hari ya, Kak."` dengan `estimateDays ["3"]` → lolos;
    - `"Selesai 1 hari kak."` → dihapus (Review Focus 4).
  - Setelah layanan berpindah ke STARTING, `"Banner Rp135.000"` tanpa "mulai" → dihapus (Review Focus 3).
- [ ] **Step 2: Implementasi**
  - `conversation.ts` mengisi `guardExtras` dari katalog giliran itu dan `ctx.calculatedTotals`.
  - Run: `npx vitest run src/lib/whatsapp`. Expected: PASS.
- [ ] **Step 3: Commit.** `feat: bot menyebut harga pasti, hitungan kalkulator, dan estimasi dari katalog`

### Task 4: UI menu Layanan + harga awal Order WA

**Files:**
- Modify: `src/components/services/ServiceForm.tsx`, `src/app/(dashboard)/services/page.tsx`, `src/components/wa-orders/QuotePanel.tsx`, `src/lib/whatsapp/intake-api.ts` (select layanan untuk prefill)
- Test: `src/lib/whatsapp/intake-api.test.ts`

- [ ] **Step 1: UI/UX Pro Max**, lalu tambahkan di bagian "Untuk bot WhatsApp":
  - pilihan **Harga pasti / Mulai dari**;
  - editor **paket** (baris nama + harga + catatan, tambah/hapus, maks 6);
  - **harga per unit** (satuan, termasuk, tambahan per unit, minimal);
  - **estimasi**.
  - Kartu layanan menampilkan mode dan paket.
- [ ] **Step 2: QuotePanel**
  - Isian harga awal (hanya bila harga belum diisi) = hasil `calculatePrice` dengan paket dari `briefDraft.package_choice` dan unit dari `page_count` / `variant_count` / `pose_count` / jumlah `menu_items_json`. Bila tidak bisa dihitung, pakai `startingPrice`.
  - Tes DTO: detail order membawa kolom katalog yang dibutuhkan.
- [ ] **Step 3: Verifikasi.** `npx tsc --noEmit -p . && npx eslint src --quiet`, lalu cek browser dev: isi paket Photobooth, simpan, buka ulang; panel harga Order WA terisi.
- [ ] **Step 4: `/antislop`,** perbaiki temuan valid, lalu commit `feat: isian mode harga, paket, unit, dan estimasi; harga awal Order WA`.

### Task 5: Layanan baru (kode + konfigurasi brief + form web)

**Files:**
- Modify: `src/components/forms/brief/types.ts` (`SERVICE_CODES`, `BriefResponses`, `SERVICE_BRIEF_CONFIGS`), `src/lib/whatsapp/ai/brief-schema.ts` (`BRIEF_FIELD_SCHEMAS`), `src/lib/whatsapp/ai/system-prompt.ts` (`BRIEF_FIELD_DESCRIPTIONS`), `src/components/forms/brief/BriefReader.tsx` (`FIELD_LABELS`), `src/components/forms/brief/ServiceBriefForm.tsx` (bagian generik)
- Test: `src/lib/whatsapp/ai/brief-schema.test.ts`, `src/components/forms/brief/brief-config.test.ts` (baru)

**Konfigurasi brief:**

| Kode | Wajib | Opsional |
|---|---|---|
| SVC-12 Buku Menu | `brand_name`, `page_count`, `size`, `style` | `menu_items_json`, `logos_json`, `reference_items_json` |
| SVC-13 Auto Pilot | `package_choice`, `brand_name`, `sosmed_platform`, `sosmed_vibe` | `business_desc`, `reference_items_json` |
| SVC-14 Design Package | `package_choice`, `brand_name`, `sosmed_platform`, `sosmed_vibe` | `main_text`, `reference_items_json` |
| SVC-15 Duo Pack | `brand_name`, `dimensions`, `sticker_text`, `mandatory_info` | `variant_count`, `reference_items_json` |
| SVC-09 Photobooth | tambah `package_choice` (opsional) | |
| SVC-08 Sticker Label | tambah `variant_count` (opsional) | |
| SVC-02 Logo Ilustrasi | tambah `pose_count` (opsional) | |

- [ ] **Step 1: Tes gagal**
  - Setiap kode SVC-12..15 punya konfigurasi.
  - Setiap kunci wajib punya skema Zod, deskripsi bot, dan label `FIELD_LABELS`.
  - `missingRequiredFields("SVC-12", {})` berisi `page_count`.
- [ ] **Step 2: Implementasi.** `ServiceBriefForm` merender layanan tanpa bagian khusus (SVC-12..15) secara generik:
  - satu isian teks per kunci teks, berlabel `FIELD_LABELS`;
  - kunci `*_json` memakai komponen yang sudah ada untuk menu, logo, dan referensi.
- [ ] **Step 3: Jalankan tes.** Run: `npx vitest run src/lib/whatsapp src/components`. Lalu cek browser form brief SVC-12 (Review Focus 5).
- [ ] **Step 4: Commit.** `feat: layanan Buku Menu, Social Media Auto Pilot/Design Package, Duo Pack`

### Task 6: Dokumen + validasi

**Files:** `docs/SERVICES_CATALOG.md` (mode harga, paket, unit, kalkulator, estimasi, batasan Review Focus 4), BRD baris Price (harga pasti dari katalog sebelum brief; final tetap admin; 2026-11-11), `docs/WHATSAPP_AI_CHATBOT.md`.

- [ ] **Step 1: Tulis dokumen.**
- [ ] **Step 2: Validasi.** Run: `npx tsc --noEmit -p . && npx eslint src --quiet && npx vitest run && npm run build`. Expected: semua lulus.
- [ ] **Step 3: Commit + PR.** `docs: katalog harga pasti, paket, kalkulator, estimasi`
