# Saluran WhatsApp Alternatif: Kirimi

Saluran ketiga di samping Meta Cloud API dan Fonnte (`docs/WHATSAPP_CHANNEL_FONNTE.md`). Disetujui owner dan
diimplementasikan 2026-11-07 (checkpoint 054); format pesan masuk masih dipastikan dari data asli (§4). Referensi API: teks dokumentasi Kirimi yang dikirim owner (salinan 2026-11-07) dan
https://kirimi.id/docs.

## 1. Keputusan owner (2026-11-07)

1. **Ditambahkan sebagai saluran ketiga**; Fonnte tetap ada sebagai cadangan. Pilihan di Settings › WhatsApp › Saluran.
2. **Scan QR di dashboard Kirimi** (dash.kirimi.id). Portal hanya menampilkan status perangkat (terhubung / tidak).
3. Owner sudah punya akun dan perangkat Kirimi (jalur **Perangkat QR Scan**, bukan WABA Kirimi).

## 2. Risiko (sama dengan Fonnte)

Jalur QR Scan tidak resmi: sambungan bisa putus dan nomor bisa dibatasi WhatsApp bila dipakai mengirim massal. Bot
hanya membalas chat masuk, jadi risikonya lebih kecil, tetapi tetap disarankan memakai nomor khusus, bukan nomor
utama studio.

## 3. Cara kerja

| Bagian | Kirimi |
|---|---|
| Kirim teks | `POST /v1/send-message` (`device_id`, `receiver` 62…, `message`), `clientMsgId` unik per pesan supaya retry tidak mengirim dobel; sukses = `success: true` |
| Pesan di luar 24 jam / template | Tidak ada aturan 24 jam di jalur QR: dikirim sebagai teks biasa (sama dengan Fonnte) |
| Status perangkat | `POST /v1/device-status`, ditampilkan di kartu Saluran |
| Pesan masuk | Webhook Kirimi event `message` → `POST /api/whatsapp/kirimi/<secret>` → alur bot yang sama |
| Pasang webhook | Tombol di portal memanggil `POST /v1/webhook/subscribe` (`device_id`, `target_url`, `events`) |
| Grup | Diabaikan (bot hanya chat pribadi) |

## 4. Yang belum terdokumentasi publik → dipastikan dari data asli

Dokumentasi publik Kirimi belum memuat **format data pesan masuk** dan **cara menghitung `X-Kirimi-Signature`**.
Langkahnya:

1. Kredensial disimpan di VPS (lewat terminal tersembunyi, tidak lewat chat).
2. Dari VPS dibaca status perangkat dan contoh event asli lewat `POST /v1/webhook/events`.
3. Pembaca pesan masuk ditulis dari contoh asli itu (pengirim, teks, id pesan, grup, gambar).
4. Sampai cara verifikasi signature dipastikan, webhook diamankan dengan rahasia acak di URL (seperti Fonnte) dan
   dicocokkan dengan `device_id` yang dipasang.

## 5. Env (rahasia, hanya di VPS)

`KIRIMI_USER_CODE`, `KIRIMI_SECRET`, `KIRIMI_DEVICE_ID`, `KIRIMI_WEBHOOK_SECRET` (dibuat acak di server).

## 6. Catatan implementasi

- Klien: `src/lib/whatsapp/kirimi.ts` (`kirimiSendText` dengan `clientMsgId` unik, `kirimiDeviceStatus`,
  `kirimiInstallWebhook` yang juga menghapus langganan lama perangkat ini, termasuk langganan poll uji).
- Saluran: `channel.ts` menangani `KIRIMI` seperti Fonnte (teks, tanpa aturan 24 jam, tanpa tanda dibaca lewat API).
- Webhook: `POST /api/whatsapp/kirimi/<KIRIMI_WEBHOOK_SECRET>` (di `PUBLIC_PATHS`). Pembaca `kirimi-webhook.ts`
  toleran terhadap beberapa nama field (datar / terbungkus `data`, JID gaya WhatsApp Web, `media_url`). Setiap
  webhook mencatat **bentuk** data (`[kirimi] webhook event=… root=[…] inner=[…]`, tanpa isi dan nomor) dan hasil
  uji signature (HMAC-SHA256 dengan secret langganan, beberapa bentuk; belum dipaksa).
- Secret langganan disimpan di `StudioSettings.waKirimiWebhookSecret` saat Pasang webhook.
- Data VPS 2026-11-07: perangkat D-8IL0J terhubung, paket Pro, `ai_enabled: true` (owner diminta mematikan AI
  Kirimi). Langganan mode poll tidak merekam event pesan masuk selama uji, jadi format dipastikan lewat mode push.

## 7. Langkah setelah deploy

1. Settings › WhatsApp › Saluran → pilih **Kirimi** → Simpan saluran.
2. Panel Perangkat Kirimi → **Pasang webhook**.
3. Kirim satu teks dan satu foto dari nomor lain ke nomor Kirimi.
4. Periksa log `[kirimi] webhook` di VPS: jika pembaca belum cocok dengan bentuk asli, sesuaikan
   `kirimi-webhook.ts`; jika signature `cocok …`, verifikasi bisa dipaksa.

## 8. Temuan 2026-11-07: pesan masuk lewat "Webhook URL" dashboard

- Langganan lewat API (`/v1/webhook/subscribe`, push maupun poll) aktif dan alamatnya benar, tetapi `last_event_at`
  tetap kosong: pesan masuk tidak terkirim lewat jalur itu. Dashboard perangkat menampilkan "Belum ada webhook".
- Jalur yang dipakai: **Tambah URL** di tab Webhook perangkat (dashboard). Kirimi menguji URL sebelum menyimpan, jadi
  webhook kita menjawab 200 untuk tes (GET atau body kosong; secret di URL tetap dicek).
- Panel Perangkat Kirimi menampilkan URL lengkap (khusus owner, tersamar sampai "Tampilkan") dengan tombol Salin.
- Dashboard menyebut signature = HMAC-SHA256 dari `timestamp.body` dengan **Signing secret** dashboard. Disimpan
  opsional sebagai `KIRIMI_SIGNING_SECRET` (terminal tersembunyi); sementara masih dicatat sebagai diagnostik.

## 9. Format pesan masuk (dipastikan 2026-11-07) dan signature wajib

Contoh event `message` asli (isi disamarkan): `event`, `deviceId`, `from` (62… atau `…@lid`), `senderAlt` (nomor asli
saat `from` berupa LID), `originLid`, `name`, `message`, `messageType` (`text`/…), `mediaUrl` (kosong untuk teks),
`msgId` (id pesan WhatsApp), `id` (id event Kirimi), `isFromMe`, `isFromGroup`, `created_at`, `datetime_wib`.

- Pembaca: `msgId` sebagai id dedupe (`kirimi:in:<msgId>`), `isFromGroup` → abaikan, `isFromMe` → abaikan (pantulan
  balasan bot sendiri), `@lid` → pakai `senderAlt`, waktu dari `created_at`.
- **Signature wajib** bila `KIRIMI_SIGNING_SECRET` tersimpan: hex HMAC-SHA256 dari `${X-Kirimi-Timestamp}.${body}`;
  salah / tidak ada → 401. Pengecualian: tes URL dari dashboard (`event: "webhook.test"`, tanpa signature) dijawab 200
  dan tidak diproses.
- Status webhook di panel dibaca dari `webhook_url` perangkat (diisi dashboard). Langganan lewat API dihapus
  (`kirimiRemoveApiSubscriptions`, dijalankan sekali setelah deploy).
- Uji 2026-11-07: teks dari nomor lain masuk, bot membalas lewat Kirimi (status sent). Foto belum diuji.
