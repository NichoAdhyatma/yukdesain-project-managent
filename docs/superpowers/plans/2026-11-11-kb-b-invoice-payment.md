# KB Bagian B: Invoice dan Metode Bayar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setelah admin menyimpan harga, klien menerima invoice (tagihan DP sesuai Operasional + sisa pelunasan) dan semua metode bayar aktif (rekening + gambar QRIS); bot tidak lagi menyebut DP.

**Architecture:**
- `offerMessage` diganti `invoiceMessage`. Nomor invoice disimpan di `WaIntake.invoiceNumber` saat harga pertama disimpan.
- Kemampuan saluran baru `sendImageOnChannel` mengirim QRIS lewat URL publik:
  - Kirimi: `send-message` + `media_url`;
  - Fonnte: `url`;
  - Meta: pesan image `link`.
- Prompt QUOTED/DP_REVIEW dan STATE tidak lagi memuat DP atau rekening.

**Tech Stack:** Next.js 16, Prisma (aditif), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-kb-merge-design.md` §2, §5, §7.

## Global Constraints

- **Nomor invoice:** `INV-WA-YYYYMMDD-XXXX` (WIB, XXXX 4 karakter acak `[A-Z0-9]`).
  - Dibuat sekali per order. Revisi harga memakai nomor yang sama.
  - Dipakai ulang sebagai `Invoice.invoiceNumber` saat project dibuat, bila nomor itu belum dipakai.
- **Tagihan DP:** `WaIntake.dpAmount` / `dpPercent` (snapshot), tidak dihitung ulang.
  - Sisa pelunasan = `agreedPrice − dpAmount`.
- **Metode bayar:** semua `PaymentAccount` `isActive` urut `order`, BANK maupun EWALLET.
  - Baris teks: `• {name} {accountNumber} a.n. {accountHolder}`.
  - QRIS: setiap akun dengan `qrisImageUrl` `https://` dikirim sebagai gambar, caption `QRIS {name}`.
- **Gagal kirim gambar:** kirim teks `QRIS {name}: {url}`, catat `[whatsapp] gambar QRIS gagal` (tanpa nomor lengkap).
- **Bot tidak menyebut nominal atau persen DP, dan tidak mengirim rekening.** Merujuk "invoice yang sudah kami kirim".
- **Teks ke klien:** bahasa Indonesia, tanpa em dash.

## Review Focus

1. **Tidak ada metode bayar aktif:** invoice tetap terkirim dengan "Metode pembayaran akan dikirim tim kami", dan admin melihat peringatan di panel harga.
   - Tes di Task 2.
2. **Admin merevisi harga:** invoice baru dengan **nomor sama**, total baru; QRIS dikirim ulang.
   - Tes di Task 2.
3. **Saluran META di luar 24 jam:** template penawaran lama (sudah disetujui Meta) tetap dipakai sebagai pembuka; gambar QRIS hanya dikirim di dalam jendela 24 jam, kalau tidak dicatat dan admin diberi tahu lewat status kirim.
   - Tes di Task 1.
4. **URL QRIS bukan https atau kosong:** dilewati tanpa error.
   - Tes di Task 2.
5. **Klien bertanya "DP berapa?" setelah invoice:** bot merujuk invoice, tidak menyebut angka. Penjaga tetap menghapus angka DP karena bukan angka katalog.
   - Tes di Task 3.

---

### Task 1: `sendImageOnChannel`

**Files:**
- Modify: `src/lib/whatsapp/kirimi.ts` (`kirimiSendImage`), `src/lib/whatsapp/fonnte.ts` (`fonnteSendImage`), `src/lib/whatsapp/client-api.ts` (`sendImage`), `src/lib/whatsapp/channel.ts`
- Test: `kirimi.test.ts`, `fonnte.test.ts`, `channel.test.ts`

**Interfaces:**
- Produces: `sendImageOnChannel(to: string, imageUrl: string, caption: string, channel?: WaChannel): Promise<string>`. Mengembalikan wamid; melempar error bila gagal.

- [ ] **Step 1: Tes gagal**
  - Kirimi memanggil `/v1/send-message` dengan `media_url` dan `message` = caption.
  - Fonnte memanggil `/send` dengan `url`.
  - Meta memanggil `messages` dengan `type: "image", image: { link, caption }`.
  - META di luar jendela 24 jam melempar `OutsideServiceWindowError` (Review Focus 3).
- [ ] **Step 2: Implementasi, jalankan tes, commit.** `feat: kirim gambar lewat saluran WhatsApp aktif`

### Task 2: Invoice menggantikan pesan penawaran

**Files:**
- Modify: `prisma/schema.prisma` (`WaIntake.invoiceNumber String?`), `src/lib/whatsapp/outbound.ts` (`invoiceMessage`, `sendInvoiceToClient`), `src/app/api/wa-intakes/[id]/quote/route.ts`, `src/lib/whatsapp/approve-intake.ts` (nomor invoice project), `src/components/wa-orders/QuotePanel.tsx` (peringatan tanpa metode bayar)
- Test: `outbound.test.ts`, `src/app/api/wa-intakes/[id]/quote` tes, `approve-intake` tes

**Interfaces:**
- Consumes: `sendImageOnChannel` (Task 1).
- Produces:
  - `invoiceNumberFor(now: Date): string`
  - `invoiceMessage(p: { clientName; serviceName; invoiceNumber; agreedPrice; dpAmount; dpPercent; deadline; lines: string[]; accounts: { name; accountNumber; accountHolder }[] }): OutboundMessage`. Template Meta tetap `WA_TEMPLATES.OFFER`.
  - `sendInvoiceToClient(conversationId, message, qris: { name: string; url: string }[]): Promise<DeliveryResult & { qrisSent: number; qrisFailed: number }>`

- [ ] **Step 1: Tes gagal**
  - Teks invoice memuat `Invoice INV-WA-`, `Total: *Rp…*`, `Tagihan DP 50%: *Rp…*`, `Sisa pelunasan: *Rp…*`, `Deadline:`, daftar rekening, dan kalimat bukti transfer.
  - Tanpa akun: "Metode pembayaran akan dikirim tim kami" (Review Focus 1).
  - QRIS kosong atau `http://` dilewati (Review Focus 4).
  - Gagal gambar menghasilkan teks URL.
  - Revisi harga memakai nomor yang sama (Review Focus 2).
  - Project dari order ber-invoice memakai nomor itu.
- [ ] **Step 2: Implementasi.** `npx prisma generate && npx prisma db push`, lalu jalankan tes. Expected: PASS.
- [ ] **Step 3: Commit.** `feat: invoice DP dan semua metode bayar aktif menggantikan pesan penawaran`

### Task 3: Bot tidak menyebut DP

**Files:**
- Modify: `src/lib/whatsapp/ai/system-prompt.ts` (bagian "Setelah ada harga", `STATUS_NOTES`, baris STATE harga), `src/lib/whatsapp/ai/conversation.ts` (tanpa query rekening)
- Test: `system-prompt.test.ts`, `conversation.test.ts`

- [ ] **Step 1: Tes gagal**
  - Prompt QUOTED memuat "Invoice dan metode pembayaran sudah dikirim tim kami" dan "Jangan menyebut nominal atau persen DP, jangan mengirim rekening".
  - STATE QUOTED memuat harga, deadline, dan nomor invoice, tanpa `DP` maupun rekening.
  - `paymentAccount.findMany` tidak dipanggil.
  - Jawaban "DP-nya Rp75.000 ya" sebelum diverifikasi dihapus penjaga (Review Focus 5).
- [ ] **Step 2: Implementasi, jalankan `npx vitest run src/lib/whatsapp`, commit.** `feat: bot merujuk invoice, tidak menyebut DP`

### Task 4: Dokumen + validasi

- [ ] **Step 1: Dokumen**
  - BRD: alur DP, invoice WA, dan metode bayar (2026-11-11).
  - `docs/WHATSAPP_AI_CHATBOT.md`: alur QUOTED.
  - `docs/WHATSAPP_TEMPLATES.md`: template OFFER tetap dipakai sebagai pembuka di luar 24 jam.
- [ ] **Step 2: Validasi.** Run: `npx tsc --noEmit -p . && npx eslint src --quiet && npx vitest run && npm run build`. Lalu uji di dev: simpan harga order uji, pastikan invoice dan QRIS terkirim lewat saluran dev.
- [ ] **Step 3: Commit + PR.**
