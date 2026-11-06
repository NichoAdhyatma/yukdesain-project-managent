# Saluran WhatsApp Alternatif: Fonnte

Sambil menunggu verifikasi bisnis dan nomor di Meta, bot bisa berjalan lewat **Fonnte** (gateway WhatsApp
tidak resmi berbasis scan QR, seperti WhatsApp Web). Owner memilih saluran di Settings; saat Meta Cloud API siap,
cukup pindah pilihan. Keputusan owner (2026-11-06): **Fonnte**, nomor **dinamis** (dihubungkan dengan scan QR di
portal), **hanya untuk testing** dengan nomor khusus (bukan nomor utama studio). Diimplementasikan 2026-11-06.

## 1. Risiko yang diterima owner

- Fonnte **bukan** jalur resmi Meta. Otomatisasi lewat jalur ini melanggar ketentuan WhatsApp; nomor yang dipakai
  **bisa diblokir** WhatsApp, terutama jika dipakai untuk pesan massal. Bot kita hanya membalas chat masuk, jadi
  risikonya lebih kecil, tetapi tidak nol. Disarankan memakai nomor yang bukan nomor utama studio.
- Isi chat klien (termasuk bukti transfer) lewat server Fonnte.
- Sesi bisa putus (HP mati lama, logout) → portal menampilkan status dan QR untuk scan ulang.

## 2. Yang dilihat owner

**Settings › WhatsApp › Saluran WhatsApp**:
- Pilihan **Meta Cloud API (resmi)** atau **Fonnte (tidak resmi, sementara)** — sama seperti pilihan penyedia AI.
- Kartu **Fonnte**:
  - status: *Terhubung: 0851-…* / *Belum terhubung*, paket, kuota, masa aktif;
  - **Tampilkan QR** → gambar QR diperbarui otomatis sampai terhubung (scan dari WhatsApp › Perangkat tertaut);
  - **Putuskan nomor** (untuk ganti nomor: putuskan, lalu scan QR dengan HP lain);
  - **Pasang webhook otomatis** (mengisi URL webhook kita di Fonnte lewat API);
  - peringatan risiko di atas.

Semua fitur bot tetap sama: brief, Uji bot, instruksi owner lewat WA, Order WA, balas manual admin.

## 3. Perbedaan perilaku saat Fonnte aktif

| | Meta Cloud API | Fonnte |
|---|---|---|
| Pesan di luar 24 jam | Template | Teks biasa (tidak ada aturan 24 jam) |
| Template Meta | Dipakai | Tidak dipakai; isi teks yang sama |
| Gambar/bukti transfer masuk | Ya | **Hanya paket Fonnte "all feature"**; paket lain → bot minta klien mengirim ulang / admin |
| Status terkirim/dibaca | Dari webhook | "terkirim" saja (versi pertama) |
| Pesan grup | Tidak ada | **Diabaikan** |

## 4. Teknis (ringkas)

| Bagian | Perubahan |
|---|---|
| Env | `FONNTE_DEVICE_TOKEN` (rahasia), `FONNTE_WEBHOOK_SECRET` (dibuat acak); key tidak pernah ke browser |
| Schema | `StudioSettings.waChannel` (`META` \| `FONNTE`, default `META`) — additive |
| Transport | satu antarmuka `sendText` / `sendTemplate` / `markAsRead` / `downloadMedia`; Meta = kode sekarang, Fonnte = `api.fonnte.com/send` (template → teks) |
| Webhook | `POST /api/whatsapp/fonnte/<secret>`: cocokkan secret + nomor perangkat, abaikan grup, ubah ke format pesan masuk yang sama, lalu alur bot yang sama |
| Portal API | `GET` status (`/device`), `POST` QR (`/qr`), `POST` disconnect, `POST` pasang webhook (`/update-device`) — owner-only |
| Dedupe | id pesan Fonnte (`inboxid`, jika tidak ada: hash pengirim + waktu + isi) |

## 5. Yang perlu disiapkan owner

1. Daftar di https://fonnte.com, tambah device, pilih paket (untuk bukti transfer berupa foto: paket yang menyertakan
   lampiran / "all feature").
2. Salin **token device** → disimpan ke `.env` VPS sebagai `FONNTE_DEVICE_TOKEN` (lewat terminal, tidak lewat chat).
3. Setelah deploy: Settings › WhatsApp › Saluran → Fonnte → Tampilkan QR → scan dari HP nomor bot → Pasang webhook.

## 6. Catatan implementasi

- Semua pengiriman lewat `src/lib/whatsapp/channel.ts` (`sendTextOnChannel`, `sendTemplateOnChannel`,
  `markAsReadOnChannel`, `deliveryErrorCode`); aturan 24 jam lewat `usesServiceWindow(channel)` — berlaku untuk balasan
  bot, pesan admin (penawaran/DP/batal), balasan manual, pertanyaan ke owner, dan penanda "di luar 24 jam" di Order WA.
- Webhook `POST /api/whatsapp/fonnte/<FONNTE_WEBHOOK_SECRET>` diizinkan di `src/proxy.ts` (tanpa sesi). Secret dibanding
  constant-time; salah → 404. Saluran aktif bukan Fonnte → diabaikan (200). Nomor perangkat harus sama dengan yang
  dicatat saat **Pasang webhook** (`StudioSettings.waFonnteDevice`).
- Lampiran Fonnte disimpan sebagai `WaMessage.mediaId = "url:<URL>"`; diunduh hanya dari https host publik (bukan IP /
  localhost), tanpa redirect, maks 10 MB, jenis file dari magic bytes, hash SHA-256 dihitung dari isi.
- Fonnte tidak mengirim id pesan yang dibalas, jadi balasan owner ke pertanyaan luar katalog dikenali dari isi/AI
  (jika ada beberapa pertanyaan terbuka, bot menanyakan yang mana).
- Id pesan: kirim `fonnte:<id>`, masuk `fonnte:in:<inboxid>` (atau hash isi) — unik terhadap wamid Meta.

## 7. Cara pakai (testing)

1. Daftar di https://fonnte.com → **Add device** (nomor khusus testing) → salin **token device**.
2. Simpan ke VPS: `FONNTE_DEVICE_TOKEN` (dibantu lewat terminal; jangan lewat chat). `FONNTE_WEBHOOK_SECRET` dan
   `STORAGE_PRIVATE_BUCKET` sudah/akan diisi di server.
3. Portal › Settings › WhatsApp › **Saluran WhatsApp** → pilih **Fonnte** → **Simpan saluran**.
4. **Tampilkan QR** → scan dari HP nomor testing (WhatsApp › Perangkat tertaut) → status jadi *Terhubung*.
5. **Pasang webhook** → kirim chat dari HP lain ke nomor testing; balasan bot muncul di WA dan percakapannya di Order WA.
6. Saat Meta siap: isi env Cloud API, pilih **Meta Cloud API (resmi)**, lalu **Putuskan nomor** di Fonnte.
