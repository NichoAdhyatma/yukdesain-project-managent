# Notifikasi Owner (Web Push) dan Inbox Chat WhatsApp

Supaya owner/admin cepat bertindak tanpa harus membuka portal terus. Disetujui dan diimplementasikan 2026-11-07
(checkpoint 053). Ikon: logo studio dari Settings › General (keputusan owner).

## 1. Keputusan owner (2026-11-07)

1. **Saluran: notifikasi web push** (seperti notifikasi aplikasi di HP/laptop). **Bukan lewat WhatsApp**, karena pesan
   ke owner memakai kuota pesan Meta dan di luar 24 jam harus template berbayar.
2. **Kejadian yang dinotifikasi** (keempatnya):
   - Brief lengkap → **Perlu harga**
   - **Bukti DP masuk** → perlu dicek
   - **Klien baru** mulai chat (nomor yang pertama kali menghubungi bot)
   - **Chat menunggu admin** (klien ketik "admin", AI gagal/"sibuk", batas harian, rem bulanan, bot memanggil admin,
     pertanyaan owner kedaluwarsa, bukti transfer terlalu banyak). Sejak 2026-11-13 (keputusan owner) kejadian ini
     **tidak** memindahkan chat ke mode admin: bot tetap melayani, chat baru pindah ke mode admin bila admin sendiri
     membalas (dari HP, tombol Ambil alih, atau balasan dari portal). Notifikasi paling banyak sekali per 30 menit per
     chat dan alasan. Pesan sibuk / batas harian / rem bulanan ke klien hanya dikirim sekali (tidak diulang bila sudah
     menjadi pesan terakhir bot); selama batas harian atau rem bulanan, bot diam setelah pesan itu.
3. **Inbox baru** berisi semua chat WhatsApp, termasuk nomor yang belum punya order.

## 2. Notifikasi web push

**Mengaktifkan** (sekali per perangkat): Settings › Notifications › **Aktifkan di perangkat ini** → browser meminta izin
→ selesai. Bisa di laptop (Chrome/Edge/Firefox/Safari) dan HP:
- **Android (Chrome)**: langsung bisa.
- **iPhone/iPad**: buka portal di Safari → Bagikan → **Tambah ke Layar Utama**, buka dari ikon itu, lalu aktifkan.
  (Batasan Apple: web push di iOS hanya untuk web yang dipasang di Layar Utama, iOS 16.4+.)

**Isi notifikasi** (tanpa nomor lengkap dan tanpa isi bukti transfer):

| Kejadian | Contoh |
|---|---|
| Perlu harga | "Perlu harga: Nico · Logo Minimalis" |
| Bukti DP masuk | "Bukti DP masuk: Nico · Logo Minimalis" |
| Klien baru | "Klien baru chat: Sari (6281****7890)" |
| Dialihkan ke admin | "Chat menunggu admin: Sari · klien minta admin" |

Klik notifikasi → membuka order atau chat yang bersangkutan di portal.

**Pengaturan** (per user, per kejadian): di Settings › Notifications, keempat kejadian bisa dinyalakan/dimatikan.
Tab Notifications yang sekarang (Order Baru, Brief Submitted, Pembayaran) masih berupa tampilan tanpa fungsi; diganti
dengan pengaturan yang benar-benar dipakai ini.

**Tidak dikirim** untuk: Uji bot, nomor yang diblokir, dan chat instruksi owner. Penerima: user OWNER yang sudah
mengaktifkan notifikasi di perangkatnya (bisa beberapa perangkat).

**Perubahan 2026-11-08** (owner melaporkan "Perlu harga" tidak masuk saat tes dari nomor owner):

- Order tes owner (#klien) **tetap mengirim notifikasi**, judulnya diawali "[Tes]" (mis. "[Tes] Perlu harga"), supaya
  owner bisa memastikan notifikasi masuk tanpa nomor kedua. Sebelumnya dilewati.
- **Klien baru** ditentukan dari pesan masuk paling awal, bukan jumlah pesan: klien yang mengetik beruntun ("halo",
  "mau logo") tetap memicu notifikasi walau pesan keduanya sudah tersimpan saat jeda gabung pesan selesai.
- Setiap kejadian dicatat di log server: `[push] NEEDS_QUOTE terkirim ke 1/1 perangkat`, atau "tidak terkirim: tidak
  ada perangkat …". Penolakan layanan push tetap dicatat sebagai error.

**Biaya**: gratis (memakai layanan push bawaan browser: Google, Apple, Mozilla).

## 2a. Pengingat "menunggu admin" (2026-11-13)

Disetujui owner 2026-11-13 setelah evaluasi chat: 4 chat mode admin menunggu 1–2 jam ("chatnya ketimbun"), pertanyaan
bot ke owner menunggu berjam-jam (median dijawab 6 menit, tetapi 6 masih tertunda), dan DP Mif diterima lewat HP tanpa
invoice di portal. Notifikasi kejadian di atas hanya dikirim sekali, jadi yang terlewat tidak diingatkan lagi.

- **Saluran**: web push (keputusan 2026-11-07), kejadian **Pengingat menunggu admin**; bisa dimatikan di
  Settings › Notifications seperti kejadian lain.
- **Yang dihitung** (`src/lib/notifications/waiting-reminders.ts`):
  - **Chat belum dibalas**: chat mode admin (bukan Uji bot, bukan nomor diblokir, bukan nomor owner) yang pesan
    terakhirnya dari klien, dalam 24 jam terakhir. Lama menunggu dihitung dari pesan klien pertama sesudah balasan
    terakhir yang bukan basa-basi. Basa-basi saja ("Baik kak", "ok, ditunggu") tidak dihitung. Chat mode bot tidak dihitung (bot membalas).
  - **Pertanyaan bot belum dijawab**: `WaOwnerQuery` `PENDING` yang belum kedaluwarsa (24 jam). Dilewati bila admin
    sudah membalas klien itu langsung (HP atau portal) atau order klien itu sudah diberi harga sesudah pertanyaan
    dibuat, karena dianggap sudah ditangani.
  - **DP lewat HP belum dicatat di portal**: pesan admin dari HP dalam 24 jam terakhir yang memuat nomor rekening aktif
    (Settings › Pembayaran) atau kabar "DP/pembayaran … terima", padahal percakapan itu tidak punya invoice portal dalam
    30 hari dan klien tidak punya project baru dalam 30 hari (pelunasan project berjalan tidak dihitung).
- **Waktu**: pengingat pertama setelah menunggu 30 menit, kedua setelah 2 jam (paling cepat 30 menit dari yang
  pertama), lalu berhenti untuk item itu (`admin_wait_reminders`, dibersihkan setelah 3 hari). Pesan klien baru setelah
  admin membalas dihitung sebagai item baru.
- **Isi**: satu notifikasi ringkas, judul "3 hal menunggu admin", maksimal 4 baris urut dari yang paling lama, nomor
  tersamar, mis. "Coffee Duri (6281****2256) · pertanyaan bot belum dijawab · 3 jam 30 mnt". Notifikasi berikutnya
  menggantikan yang lama di perangkat (tag sama). Tautan: Inbox (langsung ke chat bila hanya satu chat).
- **Cron**: `POST /api/cron/admin-reminders` (Bearer `CRON_SECRET`, sama dengan kabar progres klien), dipanggil timer
  `yukdesain-admin-reminders` tiap 5 menit. Unit systemd ada di `deploy/systemd/`.

## 3. Inbox chat

Menu **Order WA** mendapat dua tab: **Order** (daftar yang sekarang) dan **Inbox**.

- **Inbox**: semua percakapan WhatsApp (bukan Uji bot), terbaru di atas: nama/nomor tersamar, potongan pesan terakhir,
  waktu, status (**Bot** / **Admin** / **Diblokir**), label **Tes owner**, dan tautan ke order aktif jika ada.
- Filter: Semua · Menunggu admin · Belum ada order · Diblokir. Pencarian nama/nomor.
- Klik percakapan → riwayat chat lengkap dengan tombol yang sama seperti di order: balas manual, ambil alih /
  kembalikan ke bot, blokir / buka blokir. Jadi nomor spam yang **belum punya order** kini juga bisa diblokir.
- Diperbarui otomatis setiap ±20 detik saat terbuka.

## 4. Perubahan teknis (ringkas)

| Bagian | Perubahan |
|---|---|
| Dependensi | `web-push` (kirim push dari server, standar VAPID) |
| Env (rahasia, di VPS) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto studio); dibuat di server, tidak lewat chat |
| Schema (additive) | model `WebPushSubscription` (userId, endpoint unik, kunci p256dh/auth, perangkat, dibuat/terakhir dipakai); `User.notifyPrefs Json?` |
| PWA | `public/sw.js` (service worker: tampilkan notifikasi + buka tautan), `manifest.webmanifest` (nama, warna, ikon) |
| API | `POST/DELETE /api/notifications/subscription`, `GET/PUT /api/notifications/prefs`; `GET /api/wa-conversations` (Inbox) dan `GET /api/wa-conversations/[id]` + aksi balas / mode / blokir per percakapan |
| Pemicu | konfirmasi brief, bukti DP disimpan, percakapan baru dibuat, chat pindah ke mode admin → `notifyOwners(event)`; langganan yang ditolak layanan push (kedaluwarsa) dihapus otomatis |
| UI | Settings › Notifications (aktifkan perangkat, uji notifikasi, toggle per kejadian); tab Inbox di Order WA |

## 5. Yang perlu dipastikan owner

- **Ikon aplikasi** untuk notifikasi dan ikon di Layar Utama HP: memakai **logo studio** yang sudah ada di Settings ›
  General (atau owner mengirim file logo persegi, minimal 512×512 px). Tidak dibuat ikon baru tanpa persetujuan.

## 6. Catatan implementasi

- Kirim: `src/lib/notifications/push.ts` (`notifyOwnersPush`, `sendTestPush`, prefs `User.notifyPrefs.disabled`),
  kejadian: `src/lib/notifications/owner-events.ts`. Notifikasi tidak ditunggu (`void`) supaya balasan bot tidak tertunda.
- Pemicu: `confirm_brief` (status Perlu harga) dan `submit_payment_proof` di `ai/tools.ts`; pesan masuk pertama sebuah
  nomor di `bot.ts` (juga saat Balas otomatis nonaktif); `callAdmin(conversationId, reason)` di
  `src/lib/whatsapp/handoff.ts` (tanpa mengubah mode chat, dibatasi `CALL_ADMIN_INTERVAL_MS` = 30 menit per chat dan
  alasan). Mode HUMAN hanya dari balasan admin: `phone-takeover.ts` (HP), `POST /api/wa-conversations/[id]/mode` dan
  `/api/wa-intakes/[id]/mode` (Ambil alih), balasan manual dari portal.
- PWA: `src/app/manifest.ts` (dinamis, logo studio) dan `public/sw.js` (tanpa cache offline). Keduanya ada di
  `PUBLIC_PATHS` proxy karena browser mengambil manifest tanpa cookie.
- Inbox: `src/lib/whatsapp/inbox.ts`, `GET /api/wa-conversations` (+`[id]`, `mode`, `block`, `messages`); aktivitas
  dicatat dengan `entityType: "WaConversation"`. Tab di `/wa-orders?tab=inbox&chat=<id>` (tautan dari notifikasi).
- API baru masuk `OWNER_ONLY_API` di proxy, dan setiap route memakai `requireOwner`.

## 7. Langkah deploy

1. Deploy seperti biasa (`db push` menambah tabel `web_push_subscriptions` dan kolom `notifyPrefs`, tanpa hapus data).
2. Buat kunci VAPID **sekali** di VPS dan simpan ke `.env` (jangan lewat chat), lalu restart:
   `npx web-push generate-vapid-keys` → isi `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT="mailto:…"`.
   Kunci jangan diganti setelah dipakai: semua perangkat harus mengaktifkan ulang.
3. Owner: Settings › Notifications › **Aktifkan di perangkat ini** → **Kirim notifikasi uji**.
4. Pengingat menunggu admin (§2a, 2026-11-13), sekali di VPS setelah deploy yang memuat route-nya:
   `cp deploy/systemd/yukdesain-admin-reminders.* /etc/systemd/system/ && systemctl daemon-reload &&
   systemctl enable --now yukdesain-admin-reminders.timer`. Memakai `/etc/yukdesain/cron.env` yang sudah ada.
