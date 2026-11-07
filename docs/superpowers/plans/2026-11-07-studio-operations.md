# Operasional Studio (Bagian 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menu Operasional studio (khusus owner) menjadi satu sumber untuk DP %, kuota revisi, teks revisi, catatan pelunasan, dan jam kerja; portal dan bot WhatsApp membacanya.

**Architecture:** Kolom baru di `StudioSettings` dibaca lewat satu modul `src/lib/studio-operations.ts` (validasi Zod, default, cache 60 detik, helper jam kerja WIB). Nilai yang mengikat transaksi di-snapshot: `Project.revisionQuota` saat project dibuat, `WaIntake.dpPercent` saat admin menyimpan harga. Bot menerima blok Kebijakan di system prompt yang di-cache.

**Tech Stack:** Next.js 16 App Router, Prisma (`db push`, aditif), Zod, TanStack Query, Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-07-bot-knowledge-features-design.md` §4 (Bagian 1), §8, §10, §11.

## Global Constraints

- Schema hanya aditif: kolom baru wajib punya default atau nullable; tidak ada `@unique` di tabel lama; tidak menghapus kolom.
- Default = perilaku sekarang: `dpPercent` 50, `revisionQuota` 3, `revisionNotice` = `REVISION_NOTICE`, `settlementNote` "Pelunasan dilakukan setelah desain selesai.", `workingDays` [1,2,3,4,5,6], `workingHoursStart` "09:00", `workingHoursEnd` "17:00", `outsideHoursNote` "Admin membalas di jam kerja berikutnya."
- Rentang: `dpPercent` 10–100, `revisionQuota` 0–10, `revisionNotice` ≤300, `settlementNote` ≤200, `outsideHoursNote` ≤200, `workingDays` 1–7 item unik dari 1..7 (1=Senin), jam "HH:mm" dengan start < end (tidak melewati tengah malam).
- Jam kerja selalu dihitung di zona `Asia/Jakarta`, apa pun zona server.
- Perubahan berlaku untuk order/project baru; project dan penawaran yang sudah ada memakai nilai snapshot.
- Khusus owner: API di `OWNER_ONLY_API` (`src/proxy.ts`), cek `user.activeRole === "OWNER"` di route; menu `/operasional` hanya role OWNER.
- Jangan pernah menjalankan `prisma/seed.ts` di produksi; menu produksi lewat file SQL idempoten.
- Teks UI dan komentar bahasa Indonesia; tanpa em dash di copy.
- UI: UI/UX Pro Max sebelum implementasi, `/antislop` sesudahnya (CLAUDE.md).

## Review Focus

1. Owner mengubah DP saat sebuah order masih QUOTED → penawaran yang dikirim ulang dan STATE bot tetap memakai persen saat harga disimpan (`WaIntake.dpPercent`). Tes di Task 3.
2. Owner menurunkan kuota revisi di bawah jumlah revisi project berjalan → project lama tetap memakai kuotanya sendiri. Tes di Task 4.
3. Server berjalan di UTC → "di luar jam kerja" dihitung di WIB (mis. 02:30 UTC = 09:30 WIB = jam kerja). Tes di Task 1.
4. Jam kerja tidak valid (start ≥ end, hari kosong) → ditolak validasi dengan pesan di field, tidak tersimpan. Tes di Task 1.
5. Setelah owner menyimpan, bot dan portal langsung memakai nilai baru (cache 60 detik di-invalidate). Tes di Task 2.

---

### Task 1: Modul operasional + schema

**Files:**
- Modify: `prisma/schema.prisma` (`StudioSettings`, `Project`, `WaIntake`)
- Create: `src/lib/studio-operations.ts`
- Test: `src/lib/studio-operations.test.ts`

**Interfaces:**
- Produces:
  - `type StudioOperations = { dpPercent: number; revisionQuota: number; revisionNotice: string; settlementNote: string; workingDays: number[]; workingHoursStart: string; workingHoursEnd: string; outsideHoursNote: string }`
  - `OPERATIONS_DEFAULTS: StudioOperations`
  - `studioOperationsSchema` (Zod, objek lengkap, pesan error bahasa Indonesia)
  - `getStudioOperations(): Promise<StudioOperations>` (cache 60 detik, fallback default bila baris belum ada)
  - `invalidateOperationsCache(): void`
  - `isWithinWorkingHours(now: Date, ops: StudioOperations): boolean`
  - `nextWorkingStart(now: Date, ops: StudioOperations): Date` (awal jam kerja berikutnya; bila sedang jam kerja = `now`)
  - `formatWorkingHours(ops: StudioOperations): string` contoh "Senin–Sabtu, 09.00–17.00 WIB"; hari tidak berurutan dipisah koma ("Senin, Rabu, Jumat, …")

- [ ] **Step 1: Tambah kolom schema**
  - `StudioSettings`: `opsDpPercent Int @default(50)`, `opsRevisionQuota Int @default(3)`, `opsRevisionNotice String?`, `opsSettlementNote String?`, `opsWorkingDays Int[] @default([1,2,3,4,5,6])`, `opsWorkingHoursStart String @default("09:00")`, `opsWorkingHoursEnd String @default("17:00")`, `opsOutsideHoursNote String?` (teks null = pakai default dari `OPERATIONS_DEFAULTS`, supaya default teks hidup di kode).
  - `Project`: `revisionQuota Int @default(3)` dengan komentar snapshot.
  - `WaIntake`: `dpPercent Int?` (null = order lama → 50).
  - Run: `npx prisma generate && npx prisma db push` → "Your database is now in sync".

- [ ] **Step 2: Tulis tes yang gagal** (`studio-operations.test.ts`, mock `@/lib/db`)
  - `studioOperationsSchema` menerima `OPERATIONS_DEFAULTS`; menolak `dpPercent: 5`, `revisionQuota: 11`, `workingDays: []`, `workingDays: [0]`, `workingHoursStart: "17:00", workingHoursEnd: "09:00"`, `workingHoursStart: "9:00"`.
  - `isWithinWorkingHours(new Date("2026-11-09T02:30:00Z"), OPERATIONS_DEFAULTS)` → `true` (Senin 09.30 WIB); `"2026-11-09T10:30:00Z"` → `false` (17.30 WIB); `"2026-11-08T03:00:00Z"` (Minggu) → `false`.
  - `nextWorkingStart(new Date("2026-11-08T03:00:00Z"), OPERATIONS_DEFAULTS)` → `2026-11-09T02:00:00.000Z`; dari Senin 17.30 WIB → Selasa 09.00 WIB (`2026-11-10T02:00:00.000Z`).
  - `formatWorkingHours(OPERATIONS_DEFAULTS)` → `"Senin–Sabtu, 09.00–17.00 WIB"`; `{ workingDays: [1,3,5] }` → `"Senin, Rabu, Jumat, 09.00–17.00 WIB"`.
  - `getStudioOperations()` tanpa baris → `OPERATIONS_DEFAULTS`; dengan `opsRevisionNotice: null` → teks default.

- [ ] **Step 3: Run tes, pastikan gagal**
  Run: `npx vitest run src/lib/studio-operations.test.ts` → FAIL (modul belum ada).

- [ ] **Step 4: Implementasi `src/lib/studio-operations.ts`**
  WIB = UTC+7 tetap (Indonesia tanpa DST): hitung hari/menit lewat `new Date(now.getTime() + 7 * 3600_000)` dengan getter `UTC*`; `getUTCDay()` 0=Minggu dipetakan ke 7. `nextWorkingStart` mencari maksimal 8 hari ke depan. Pola cache sama dengan `src/lib/studio.ts`.

- [ ] **Step 5: Run tes, pastikan lulus**
  Run: `npx vitest run src/lib/studio-operations.test.ts` → PASS.

- [ ] **Step 6: Commit**
  `git add prisma/schema.prisma src/lib/studio-operations.ts src/lib/studio-operations.test.ts && git commit -m "feat: modul operasional studio (DP, revisi, jam kerja)"`

### Task 2: API Operasional

**Files:**
- Create: `src/app/api/settings/operations/route.ts`
- Create: `src/lib/studio-operations-api.ts` (logika simpan, supaya route hanya mengekspor handler)
- Modify: `src/proxy.ts` (tambah `"/api/settings/operations"` ke `OWNER_ONLY_API`)
- Test: `src/lib/studio-operations-api.test.ts`

**Interfaces:**
- Consumes: `studioOperationsSchema`, `getStudioOperations`, `invalidateOperationsCache` (Task 1).
- Produces:
  - `GET /api/settings/operations` → `StudioOperations` (owner).
  - `PUT /api/settings/operations` body `StudioOperations` → 200 `StudioOperations`; 400 `{ error, code: "VALIDATION_ERROR", issues }` (bentuk sama dengan `api/settings/studio`); 401/403 seperti `api/settings/studio`.
  - `saveStudioOperations(input: StudioOperations, actorId: string): Promise<StudioOperations>` di `studio-operations-api.ts`: upsert `StudioSettings` id "default" (teks yang sama dengan default disimpan null), `ActivityLog` `{ entityType: "StudioSettings", entityId: "default", action: "OPERATIONS_UPDATED", actorId, previousValue, newValue }` dalam satu transaksi, lalu `invalidateOperationsCache()`.

- [ ] **Step 1: Tes gagal**: `saveStudioOperations` memanggil upsert dengan kolom `ops*`, menulis ActivityLog berisi nilai lama dan baru, memanggil `invalidateOperationsCache` setelah transaksi; teks yang sama dengan default tersimpan `null`.
- [ ] **Step 2: Run** `npx vitest run src/lib/studio-operations-api.test.ts` → FAIL.
- [ ] **Step 3: Implementasi** `saveStudioOperations` dan route GET/PUT (cek owner, `safeParse`, `z.flattenError`).
- [ ] **Step 4: Run** tes → PASS; `npx tsc --noEmit -p .` → bersih.
- [ ] **Step 5: Commit** `feat: API operasional studio (owner)`.

### Task 3: DP dari Operasional

**Files:**
- Modify: `src/lib/whatsapp/intake.ts:64` (`computeDpAmount`)
- Modify: `src/app/api/wa-intakes/[id]/quote/route.ts` (simpan `dpPercent`)
- Modify: `src/lib/whatsapp/outbound.ts:44-80` (`offerMessage`)
- Modify: `src/lib/whatsapp/intake-api.ts` (DTO detail: `dpPercent`)
- Modify: `src/components/wa-orders/types.ts`, `src/components/wa-orders/QuotePanel.tsx`
- Modify: `src/lib/whatsapp/ai/system-prompt.ts` (`StateInput.intake.quote.dpPercent`), `src/lib/whatsapp/ai/conversation.ts` (`buildState`)
- Test: `src/lib/whatsapp/intake.test.ts`, `src/lib/whatsapp/outbound.test.ts`, tes system-prompt yang ada

**Interfaces:**
- Consumes: `getStudioOperations` (Task 1).
- Produces:
  - `computeDpAmount(agreedPrice: number, dpPercent: number): number` = `Math.ceil(agreedPrice * dpPercent / 100)`.
  - `offerMessage(p)` menerima `dpPercent: number` tambahan; teks "• DP {dpPercent}%: …".
  - DTO intake detail `dpPercent: number` = `intake.dpPercent ?? (status QUOTED/DP_REVIEW/APPROVED ? 50 : ops.dpPercent)`.
  - `StateInput.intake.quote` mendapat `dpPercent: number`.

- [ ] **Step 1: Tes gagal**
  - `computeDpAmount(1_000_001, 30)` → `300_001`; `computeDpAmount(150_000, 50)` → `75_000`.
  - `offerMessage({ …, dpPercent: 30 })` teks memuat `"• DP 30%: *Rp45.000*"` untuk harga 150.000 dan dpAmount 45.000.
  - `buildStateBlock` dengan `quote.dpPercent: 30` memuat `"DP 30%"`.
  - Review Focus 1: intake QUOTED dengan `dpPercent: 50` saat ops sudah `dpPercent: 30` → DTO detail `dpPercent` = 50 dan `buildStateBlock` memuat "DP 50%". Intake lama tanpa `dpPercent` (null) berstatus QUOTED → 50. Menyimpan harga ulang (route quote) adalah penawaran baru dan memakai 30.
- [ ] **Step 2: Run** tes terkait → FAIL.
- [ ] **Step 3: Implementasi.** Quote route: `const ops = await getStudioOperations()`, simpan `dpPercent: ops.dpPercent` bersama `dpAmount`. QuotePanel memakai `intake.dpPercent` dari DTO, bukan `DP_PERCENT`. Template Meta tidak berubah (parameter nominal sudah ada).
- [ ] **Step 4: Run** `npx vitest run src/lib/whatsapp` → PASS; `grep -rn "DP_PERCENT" src | grep -v constants | grep -v test` hanya tersisa fallback yang disengaja (atau kosong).
- [ ] **Step 5: Commit** `feat: DP order WA dari menu Operasional (snapshot per order)`.

### Task 4: Kuota revisi per project

**Files:**
- Modify: `src/lib/revisions/quota.ts`
- Modify: `src/lib/projects/create-project.ts:55-80`
- Modify: `src/app/api/projects/[id]/revisions/route.ts` (hapus konstanta lokal baris 5)
- Modify: `src/app/api/client-links/[token]/revisions/route.ts` (hapus konstanta lokal baris 4; perbaiki hitungan terpakai)
- Modify: `src/app/client/[token]/page.tsx` (baris 76, 304, 1319, 1757)
- Modify: `src/lib/whatsapp/ai/client-safe-dto.ts:83-102`
- Test: `src/lib/revisions/quota.test.ts`, `src/lib/projects/create-project.test.ts`, `src/lib/whatsapp/ai/client-safe-dto.test.ts`

**Interfaces:**
- Consumes: `getStudioOperations` (Task 1).
- Produces:
  - `revisionQuotaRemaining(revisionCount: number, quota: number): number`.
  - `CreateProjectInput.revisionQuota?: number`; bila kosong, `createProject` memakai `(await getStudioOperations()).revisionQuota`.
  - Route revisi dan DTO memakai `project.revisionQuota`.

- [ ] **Step 1: Tes gagal**
  - `revisionQuotaRemaining(2, 5)` → 3; `revisionQuotaRemaining(4, 3)` → 0.
  - `createProject` tanpa `revisionQuota` dengan ops `revisionQuota: 5` → `project.create` dipanggil dengan `revisionQuota: 5`; dengan input `revisionQuota: 2` → 2.
  - Review Focus 2: DTO project dengan `revisionQuota: 3` dan 3 revisi, sementara ops sekarang 1 → `revisionQuotaRemaining: 0` dan max 3 (bukan 1).
  - Client-links: helper `revisionsUsed(latestNumber: number | null): number` (ekspor dari `quota.ts`) → `revisionsUsed(2)` = 2, `revisionsUsed(null)` = 0. Ini memperbaiki bug: route lama menghitung `latestRevision ? 1 : 0`, sehingga kuota portal klien tidak pernah habis.
- [ ] **Step 2: Run** tes → FAIL.
- [ ] **Step 3: Implementasi.** Portal klien: tampil "/ {project.revisionQuota}x", teks peringatan dari `ops.revisionNotice` (menggantikan kalimat statis baris 1319). Error 400 kuota habis tetap berbentuk `{ used, remaining: 0, max }` dengan `max = project.revisionQuota`.
- [ ] **Step 4: Run** `npx vitest run` → PASS; `grep -rn "MAX_REVISION_QUOTA = 3" src` → kosong.
- [ ] **Step 5: Commit** `feat: kuota revisi per project dari Operasional; perbaiki hitungan revisi portal klien`.

### Task 5: Bot membaca Operasional

**Files:**
- Modify: `src/lib/whatsapp/ai/system-prompt.ts` (`buildSystemPrompt`)
- Modify: `src/lib/whatsapp/ai/conversation.ts:187`, `src/lib/whatsapp/ai/brain.ts:113-114`
- Modify: `src/lib/whatsapp/bot-reply.ts` (`BOT_REPLIES.handoff` → fungsi), `src/lib/whatsapp/bot.ts:106`
- Modify: `src/lib/whatsapp/ai/tools.ts:586-592` (`request_human_handoff`)
- Test: `src/lib/whatsapp/ai/system-prompt.test.ts` (buat bila belum ada), `src/lib/whatsapp/bot.test.ts`, `src/lib/whatsapp/ai/tools.test.ts`

**Interfaces:**
- Consumes: `StudioOperations`, `isWithinWorkingHours`, `nextWorkingStart`, `formatWorkingHours` (Task 1).
- Produces:
  - `buildSystemPrompt(studioName: string, guide: BotGuide | null, ops: StudioOperations): string` — bagian "# Setelah ada harga" memakai `ops.dpPercent` hanya sebagai keterangan umum; blok baru "# Kebijakan studio" berisi: DP {dpPercent}% sebelum pengerjaan, `settlementNote` apa adanya, revisi gratis {revisionQuota}x lewat link portal + `revisionNotice` dikutip apa adanya, di atas kuota → handoff, jam kerja `formatWorkingHours(ops)`.
  - `handoffReply(ops: StudioOperations, now: Date): string` di `bot-reply.ts`: dalam jam kerja = teks `BOT_REPLIES.handoff` sekarang; di luar = "Baik kak, percakapan ini kami teruskan ke admin. {outsideHoursNote} (jam kerja {formatWorkingHours(ops)})".
  - Hasil tool `request_human_handoff`: `message` memakai kalimat yang sama dengan `handoffReply` sebagai arahan ke model.

- [ ] **Step 1: Tes gagal**
  - `buildSystemPrompt("YukDesain", null, { ...OPERATIONS_DEFAULTS, dpPercent: 30, revisionQuota: 5 })` memuat `"DP 30%"`, `"5x"`, `OPERATIONS_DEFAULTS.revisionNotice`, `"Senin–Sabtu, 09.00–17.00 WIB"`; dua panggilan dengan input sama menghasilkan string identik (cache prompt).
  - `handoffReply(OPERATIONS_DEFAULTS, new Date("2026-11-08T03:00:00Z"))` memuat `"Admin membalas di jam kerja berikutnya."` dan jam kerja; pada `"2026-11-09T02:30:00Z"` sama dengan teks handoff sekarang.
  - `bot.test.ts`: kata kunci handoff di luar jam kerja mengirim teks di luar jam kerja.
- [ ] **Step 2: Run** tes → FAIL.
- [ ] **Step 3: Implementasi.** `conversation.ts` dan `brain.ts` memanggil `getStudioOperations()`; `bot.ts` memakai `handoffReply(await getStudioOperations(), new Date())`.
- [ ] **Step 4: Run** `npx vitest run src/lib/whatsapp` → PASS.
- [ ] **Step 5: Commit** `feat: bot membaca kebijakan dan jam kerja dari Operasional`.

### Task 6: Halaman Operasional studio

**Files:**
- Create: `src/app/(dashboard)/operasional/page.tsx`
- Create: `src/components/operations/OperationsForm.tsx`, `src/components/operations/operations-api.ts` (fetch + query key `["studio-operations"]`)
- Modify: `src/components/layout/sidebar.tsx` (`ICON_MAP` tambah `Clock` dari lucide-react)
- Create: `prisma/sql/2026-11-08-menu-operasional.sql` (pola sama dengan `2026-11-07-menu-bot-ai.sql`: href `/operasional`, nama "Operasional", icon `Clock`, group `Work`, order 14, role OWNER)
- Modify: `prisma/seed.ts` (menu yang sama, untuk lingkungan lokal)

**Interfaces:**
- Consumes: `GET/PUT /api/settings/operations` (Task 2).

- [ ] **Step 1: UI/UX Pro Max** untuk form pengaturan (kartu: Pembayaran, Revisi, Jam kerja), pakai komponen yang sudah ada (`Card`, `Input`, `Textarea`, `Button`, `Checkbox`/toggle hari).
- [ ] **Step 2: Implementasi form**: field berlabel dan teks bantu (mis. "Berlaku untuk order baru; order yang sudah diberi harga tetap memakai persen lama"), error per field dari `issues`, tombol Simpan dengan status memuat, toast sukses, state memuat dan galat saat GET gagal, dan peringatan sebelum pindah halaman bila ada perubahan belum disimpan. Pratinjau "Yang dibaca bot" menampilkan `formatWorkingHours` dan ringkasan kebijakan.
- [ ] **Step 3: Jalankan SQL menu di lokal** (`psql "$DATABASE_URL" -f prisma/sql/2026-11-08-menu-operasional.sql`) dan cek di browser: login owner, menu muncul, simpan nilai, muat ulang menampilkan nilai baru, akun non-owner tidak melihat menu dan `/api/settings/operations` → 403.
- [ ] **Step 4: `/antislop`** pada halaman ini, perbaiki temuan yang valid.
- [ ] **Step 5: Commit** `feat: halaman Operasional studio`.

### Task 7: Dokumen, checkpoint, validasi, PR

**Files:**
- Create: `docs/STUDIO_OPERATIONS.md` (field, snapshot, jam kerja WIB, siapa yang bisa mengubah, langkah produksi: jalankan SQL menu)
- Modify: `docs/yukdesain_studio_portal_BRD_FINAL_v2.md` (baris DP dan kuota revisi: "diatur di Operasional studio, default 50% / 3x"; catatan perubahan 2026-11-07)
- Modify: `docs/WHATSAPP_AI_CHATBOT.md` (tabel aturan DP), `docs/bot-knowledge/03-kebijakan-studio.md` (catatan di baris atas: digantikan Operasional studio)
- Create: `checkpoints/checkpoint-056-studio-operations/README.md` (folder diabaikan git; ditulis di lokal)

- [ ] **Step 1: Tulis dokumen.**
- [ ] **Step 2: Validasi** `npx tsc --noEmit -p .`, `npx eslint src --quiet`, `npx vitest run`, `npm run build` → semua lulus.
- [ ] **Step 3: Commit, push, PR** ke `main`; minta persetujuan owner sebelum merge/deploy. Setelah deploy: jalankan `prisma/sql/2026-11-08-menu-operasional.sql` di produksi (bukan seed).
