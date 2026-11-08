# Kabar Otomatis ke Klien (Bagian A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot mengirim kabar WhatsApp ke klien saat project mulai dikerjakan, saat update progres (bila dipilih desainer), saat hasil final dikirim, saat revisi selesai, dan saat project selesai.

**Architecture:** Modul `src/lib/notifications/client-project-events.ts` menerima kejadian dari route pemicu (lewat `after()`), mencari percakapan WA klien, dan mengirim teks lewat fungsi baru `sendSystemText`. Setiap kabar tercatat di tabel baru `ClientProjectNotice` (dedupe + jeda progres 60 menit). Update yang tertahan dikirim oleh endpoint cron yang dipanggil systemd timer di VPS.

**Tech Stack:** Next.js 16 App Router (`after()`), Prisma (`db push`, aditif), Vitest, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-08-client-tracking-chat-revisions-design.md` §4 (Bagian A), §7–§9.

## Global Constraints

- Schema hanya aditif: kolom baru nullable/berdefault, model baru boleh; tidak ada `@unique` pada tabel lama.
- Kabar tidak pernah memuat nama desainer, catatan internal, `ownerId`, nominal, atau data klien lain.
- Gagal kirim kabar tidak boleh membatalkan aksi desainer/owner (selalu di `after()`, error ditangkap dan dicatat).
- Saluran Meta di luar 24 jam: kabar **dilewati** (`SKIPPED`, alasan `OUTSIDE_SERVICE_WINDOW`), tidak lewat template.
- Kabar `PROGRESS`: maksimal satu terkirim per project per 60 menit; selama jeda, hanya satu `PENDING` per project (update terbaru).
- Cron: `POST /api/cron/client-notices` dengan `Authorization: Bearer <CRON_SECRET>`; tanpa/beda secret → 401; env tidak ada → 503.
- Teks bahasa Indonesia, sapaan "kak", format WhatsApp (*tebal*), tanpa em dash.
- Jangan menjalankan `prisma/seed.ts` di produksi.

## Review Focus

1. Klien punya beberapa percakapan / nomor (mis. nomor lama dan baru) → kabar ke percakapan dengan `lastInboundAt` terbaru, bukan sandbox, bukan yang diblokir. Tes di Task 2.
2. Owner menggeser kartu kanban bolak-balik (SEDANG → BELUM → SEDANG) → `STARTED` hanya terkirim sekali per project. Tes di Task 2.
3. Project dari alur form-link tanpa percakapan WA → `SKIPPED` dengan alasan `NO_CONVERSATION`, tanpa error. Tes di Task 2.
4. Update progres tanpa persen (null) atau catatan sangat panjang → kalimat tanpa "progres null%", catatan dipotong ≤300 karakter. Tes di Task 1.
5. Cron dipanggil dua kali bersamaan → satu PENDING hanya terkirim sekali (klaim atomik `updateMany` status PENDING → SENDING). Tes di Task 5.

---

### Task 0: Prasyarat

- [ ] PR #24 (workspace desainer) dan PR #25 (status/progres tracking) sudah di-merge ke `main`. Bila belum, berhenti dan minta owner.
- [ ] Buat branch `feat/client-project-notices` dari `main` terbaru.

### Task 1: Schema + teks kabar

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/notifications/client-notice-text.ts`
- Test: `src/lib/notifications/client-notice-text.test.ts`

**Interfaces:**
- Produces:
  - Model `ClientProjectNotice { id String @id @default(cuid()); projectId String; event String; refId String @default("-"); status String; reason String?; sentAt DateTime?; createdAt DateTime @default(now()); @@unique([projectId, event, refId]); @@index([status, createdAt]); @@map("client_project_notices") }` + relasi `Project.clientNotices`.
  - `ProjectUpdate.notifyClient Boolean @default(true)`; `Revision.completedAt DateTime?`, `Revision.completedById String?`.
  - `type ClientNoticeKind = "STARTED" | "PROGRESS" | "FINAL_SUBMITTED" | "REVISION_DONE" | "COMPLETED"`
  - `clientNoticeText(kind: ClientNoticeKind, d: { clientName: string | null; serviceName: string; portalUrl: string | null; progress?: number | null; note?: string; revisionNumber?: number; studioName: string }): string`

- [ ] **Step 1: Schema**, lalu `npx prisma generate && npx prisma db push` → "in sync".
- [ ] **Step 2: Tes gagal** (`client-notice-text.test.ts`), teks persis:
  - `STARTED`, nama "Sari", layanan "Logo Minimalis", url `https://p/x` → `"Halo kak Sari, project *Logo Minimalis* mulai dikerjakan desainer kami.\nPantau progresnya di sini: https://p/x"`.
  - `PROGRESS` progress 59, note "Sketsa tahap 2" → memuat `"Update project *Logo Minimalis*: progres *59%*."`, `"Catatan: Sketsa tahap 2"`, `"Lihat detail dan file: https://p/x"`.
  - `PROGRESS` progress null → tidak memuat `"%"`; note 400 karakter → dipotong 300 + "…".
  - `FINAL_SUBMITTED` → memuat `"Hasil final project *Logo Minimalis* sudah siap"` dan `"Cek dan setujui lewat link ini: https://p/x"` (Bagian B nanti mengganti kalimat ini).
  - `REVISION_DONE` revisionNumber 2 → `"Revisi #2 untuk project *Logo Minimalis* sudah dikerjakan."`.
  - `COMPLETED` → memuat `"Project *Logo Minimalis* sudah selesai."` dan nama studio.
  - `portalUrl: null` → tidak ada baris link; nama null → `"Halo kak,"`. Tidak ada `—` di semua keluaran.
- [ ] **Step 3: Run** `npx vitest run src/lib/notifications/client-notice-text.test.ts` → FAIL.
- [ ] **Step 4: Implementasi** fungsi murni.
- [ ] **Step 5: Run** → PASS. **Commit** `feat: schema dan teks kabar project ke klien`.

### Task 2: Pengirim kabar

**Files:**
- Modify: `src/lib/whatsapp/outbound.ts` (fungsi baru)
- Create: `src/lib/notifications/client-project-events.ts`
- Test: `src/lib/notifications/client-project-events.test.ts`, `src/lib/whatsapp/outbound.test.ts`

**Interfaces:**
- Consumes: `clientNoticeText`, model Task 1.
- Produces:
  - `sendSystemText(conversationId: string, text: string): Promise<DeliveryResult>` di `outbound.ts`: teks saja; bila saluran memakai jendela 24 jam (`usesServiceWindow`) dan di luar jendela → tidak mengirim, `{ ok: false, via: null, errorCode: "OUTSIDE_SERVICE_WINDOW", messageId: null }` tanpa menyimpan pesan; selain itu kirim dan simpan OUTBOUND seperti `sendToClient` (`sentByBot: false`).
  - `type ClientProjectEvent = { kind: "STARTED" } | { kind: "PROGRESS"; updateId: string } | { kind: "FINAL_SUBMITTED" } | { kind: "REVISION_DONE"; revisionId: string } | { kind: "COMPLETED" }`
  - `type NoticeOutcome = "SENT" | "SKIPPED" | "PENDING" | "FAILED" | "DUPLICATE"`
  - `notifyClientProjectEvent(projectId: string, event: ClientProjectEvent, now?: Date): Promise<NoticeOutcome>`
  - `sendNoticeNow(noticeId: string): Promise<NoticeOutcome>` (dipakai cron Task 5)
  - Konstanta `PROGRESS_COOLDOWN_MS = 60 * 60_000`.

- [ ] **Step 1: Tes gagal** (mock `@/lib/db`, `@/lib/whatsapp/outbound`, `@/lib/studio`, env APP_PUBLIC_URL):
  - Percakapan: `findFirst` dipanggil dengan `{ clientId, isSandbox: false, blockedAt: null }` urut `lastInboundAt desc` (Review Focus 1).
  - Tanpa percakapan → `SKIPPED`, notice tercatat `reason: "NO_CONVERSATION"` (Review Focus 3).
  - `STARTED` kedua untuk project yang sama → create melempar P2002 → `DUPLICATE`, `sendSystemText` tidak dipanggil (Review Focus 2).
  - `sendSystemText` mengembalikan `OUTSIDE_SERVICE_WINDOW` → `SKIPPED` dengan reason itu; error lain → `FAILED` dengan kode.
  - `PROGRESS` saat notice PROGRESS `SENT` 30 menit lalu → `PENDING`, PENDING lama project itu dihapus lebih dulu (`deleteMany` status PENDING), tidak mengirim; 61 menit lalu → `SENT`.
  - `PROGRESS` untuk update dengan `notifyClient: false` → tidak mencatat apa pun, kembali `SKIPPED`.
  - Teks yang dikirim memakai `portalUrl` dari link ACTIVE terbaru (`${APP_PUBLIC_URL}/client/<token>`), bukan data desainer.
  - `sendSystemText`: Meta + 30 jam sejak pesan terakhir → tidak memanggil API, `OUTSIDE_SERVICE_WINDOW`; Kirimi → kirim teks walau 30 jam.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implementasi.** Catat notice dulu (`status: "SENDING"`), lalu kirim, lalu perbarui status; P2002 pada create → `DUPLICATE`. Error apa pun ditangkap → `FAILED` + `console.error` tanpa nomor/isi.
- [ ] **Step 4: Run** `npx vitest run src/lib/notifications src/lib/whatsapp/outbound.test.ts` → PASS. **Commit** `feat: pengirim kabar project ke klien`.

### Task 3: Pemicu di route

**Files:**
- Modify: `src/app/api/projects/[id]/status/route.ts`, `src/app/api/designer/projects/[id]/updates/route.ts`, `src/app/api/designer/projects/[id]/submit-final/route.ts`, `src/app/api/client-links/[token]/approve-final/route.ts`
- Create: `src/lib/notifications/project-status-events.ts`
- Test: `src/lib/notifications/project-status-events.test.ts`

**Interfaces:**
- Consumes: `notifyClientProjectEvent` (Task 2).
- Produces: `eventForStatusChange(from: ProjectStatus, to: ProjectStatus): ClientProjectEvent | null` → `SEDANG_DIKERJAKAN` dari status lain = `STARTED`; `SELESAI` dari status lain = `COMPLETED`; selain itu `null`.

- [ ] **Step 1: Tes gagal** `eventForStatusChange`: BELUM→SEDANG = STARTED, DRAFT→SEDANG = STARTED, SEDANG→SELESAI = COMPLETED, SEDANG→SEDANG = null, SELESAI→SEDANG = STARTED (dedupe di Task 2 mencegah kabar kedua), SEDANG→BELUM = null.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementasi** + panggil di route lewat `after(() => notifyClientProjectEvent(...).catch(...))`:
  - status route: hanya bila `eventForStatusChange(prev, next)` tidak null.
  - updates route: body `notifyClient` (boolean, default `true` bila tidak dikirim) disimpan ke `ProjectUpdate.notifyClient`; `PROGRESS` dengan `updateId`.
  - submit-final: `FINAL_SUBMITTED`. approve-final portal: `COMPLETED`.
- [ ] **Step 4: Run** `npx vitest run` → PASS; `npx tsc --noEmit -p .` bersih. **Commit** `feat: pemicu kabar klien di route status, progres, dan final`.

### Task 4: Tandai revisi selesai + centang "Kabari klien"

**Files:**
- Create: `src/app/api/designer/projects/[id]/revisions/[revisionId]/complete/route.ts`, `src/lib/revisions/complete-revision.ts`
- Modify: `src/components/designer/ProjectDetail.tsx`, `src/components/designer/ProgressUpdateForm.tsx`, `src/components/designer/types.ts`, `src/app/api/designer/projects/route.ts` (sertakan `completedAt`), `src/lib/client-portal/link-dto.ts` + `src/app/client/[token]/page.tsx` (revisi "Selesai dikerjakan"), `src/lib/whatsapp/ai/client-safe-dto.ts`
- Test: `src/lib/revisions/complete-revision.test.ts`, `src/app/api/client-links/[token]/route.test.ts`

**Interfaces:**
- Produces: `completeRevision(db, { projectId, revisionId, actorId }): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" | "ALREADY_COMPLETED" | "PROJECT_FINALIZED" }>`; route POST → 200 `{ revision }`, 403 bila bukan desainer yang ditugaskan dan bukan owner, 404/409 sesuai kode; sukses memicu `REVISION_DONE` lewat `after()` dan mencatat ActivityLog `REVISION_COMPLETED`.

- [ ] **Step 1: Tes gagal** `completeRevision`: revisi project lain → NOT_FOUND; sudah selesai → ALREADY_COMPLETED; project `finalApprovedAt` terisi → PROJECT_FINALIZED; sukses mengisi `completedAt` + `completedById`. DTO portal klien memuat `completedAt` revisi (ISO atau null) dan tidak memuat `completedById`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementasi** + UI: tombol "Tandai revisi selesai" pada revisi yang belum selesai (dialog konfirmasi singkat, status memuat, toast); centang "Kabari klien" (default tercentang, teks bantu "Klien menerima pesan WhatsApp berisi persen dan catatan ini") dikirim sebagai `notifyClient`.
- [ ] **Step 4: UI/UX Pro Max sebelum menulis UI, `/antislop` sesudahnya**; uji browser: tandai revisi → badge berubah; update dengan centang dimatikan → tidak ada notice.
- [ ] **Step 5: Run** `npx vitest run` → PASS. **Commit** `feat: tandai revisi selesai dan pilihan kabari klien`.

### Task 5: Cron kabar tertunda

**Files:**
- Create: `src/app/api/cron/client-notices/route.ts`, `src/lib/notifications/flush-pending-notices.ts`
- Modify: `src/proxy.ts` (`PUBLIC_PATHS` + `"/api/cron/"`), `src/lib/notifications/client-project-events.ts`
- Test: `src/lib/notifications/flush-pending-notices.test.ts`

**Interfaces:**
- Consumes: `sendNoticeNow`, `PROGRESS_COOLDOWN_MS`.
- Produces: `flushPendingNotices(now: Date): Promise<{ sent: number; skipped: number; failed: number }>`.

- [ ] **Step 1: Tes gagal:** PENDING yang jeda project-nya lewat 60 menit terkirim; yang belum lewat tetap PENDING; klaim atomik: `updateMany({ where: { id, status: "PENDING" }, data: { status: "SENDING" } })` count 0 → dilewati (Review Focus 5); route tanpa header → 401, secret salah → 401, env kosong → 503.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementasi** (perbandingan secret `timingSafeEqual`). **Step 4: Run** → PASS. **Commit** `feat: cron kabar progres tertunda`.

### Task 6: Dokumen, validasi, PR, langkah VPS

**Files:**
- Create: `docs/CLIENT_NOTIFICATIONS.md` (kejadian, teks, jeda, cron, unit systemd `yukdesain-client-notices.service` + `.timer` setiap 5 menit memanggil `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/client-notices`)
- Modify: `docs/yukdesain_studio_portal_BRD_FINAL_v2.md` (kabar otomatis ke klien, 2026-11-08), `docs/WHATSAPP_AI_CHATBOT.md`
- Create: `checkpoints/checkpoint-058-client-project-notices/README.md`

- [ ] **Step 1:** Tulis dokumen.
- [ ] **Step 2:** `npx tsc --noEmit -p .`, `npx eslint src --quiet`, `npx vitest run`, `npm run build` → lulus.
- [ ] **Step 3:** Review seluruh branch, commit, push, PR ke `main`. Minta persetujuan owner sebelum merge/deploy.
- [ ] **Step 4 (setelah disetujui):** deploy; buat `CRON_SECRET` acak di VPS `.env` (tidak lewat chat); pasang dan aktifkan timer; uji: update progres project uji → satu pesan; update kedua dalam 1 jam → PENDING lalu terkirim setelah jeda.
