# Kabar otomatis ke klien

Bot mengirim kabar WhatsApp ke klien saat order mereka berubah. Disetujui owner 2026-11-08
(spec: `docs/superpowers/specs/2026-11-08-client-tracking-chat-revisions-design.md` §4, Bagian A).

## 1. Kejadian

| Kejadian | Pemicu | Isi |
|---|---|---|
| `STARTED` | status project menjadi Sedang Dikerjakan (kanban) | Project mulai dikerjakan + link portal |
| `PROGRESS` | desainer mengirim update progres dengan **Kabari klien** menyala | Persen (bila diisi) + catatan (≤300 karakter) + link portal |
| `FINAL_SUBMITTED` | desainer mengirim hasil akhir (form progres di 100%) | Hasil final siap, cek dan setujui lewat link portal. Belum lunas: sisa pelunasan + rekening aktif + "kirim bukti transfernya di chat ini"; sudah lunas: "cek, setujui, dan unduh" |
| `REVISION_DONE` | desainer menekan **Tandai revisi selesai** | Revisi #n sudah dikerjakan + link portal |
| `COMPLETED` | owner menandai Selesai (kanban) atau klien menyetujui final | Project selesai, terima kasih; belum lunas: + sisa pelunasan dan rekening |
| `FILES_UNLOCKED` | owner mencatat pembayaran yang membuat project lunas, setelah hasil akhir dikirim | Pelunasan diterima, file final sudah bisa diunduh + link portal |

Teks ada di `src/lib/notifications/client-notice-text.ts`. Tidak pernah memuat nama desainer atau catatan internal.
Nominal hanya sisa pelunasan project itu sendiri, di `FINAL_SUBMITTED`/`COMPLETED` yang belum lunas (disetujui owner
2026-11-12).

## 1a. File final terkunci sampai lunas (disetujui owner 2026-11-12)

Temuan project Nicho (12 Nov): desainer menekan "Selesai", "Kirim hasil akhir", lalu update 100%, sehingga klien
menerima tiga pesan dalam 40 detik dengan urutan terbalik; file final yang dikirim desainer tidak tampil di portal; dan
project baru dibayar Rp50.000 dari Rp250.000.

- Desainer: satu form progres. Progres 100% sebelum hasil akhir dikirim = mode **Kirim hasil akhir** (file wajib,
  kategori FINAL, satu kabar `FINAL_SUBMITTED`). Desainer tidak lagi bisa menandai Selesai (API 403); project Selesai
  saat klien menyetujui hasil akhir, atau ditandai owner.
- Portal klien: kartu **File final** menampilkan nama file. Selama `paymentStatus` belum `PAID`, `storageKey` tidak
  dikirim ke browser (file terkunci) dan kartu menampilkan sisa pelunasan + tombol ke tab Pembayaran. Gambar progres
  tetap terlihat supaya klien bisa review dan approve.
- Pelunasan dicatat owner di portal (`POST /api/payments`); begitu lunas dan hasil akhir sudah dikirim, klien menerima
  `FILES_UNLOCKED`. Bukti transfer pelunasan yang dikirim klien lewat chat: bot tidak memprosesnya, menyampaikan akan
  dicek admin, lalu mengalihkan chat ke admin.
Kalimat `FINAL_SUBMITTED` akan berubah ke "balas setuju di chat" setelah Bagian B (revisi dan final lewat chat) aktif.

## 1b. Cara kirim hasil akhir: file / link / WhatsApp (permintaan owner 2026-11-14)

Di mode **Kirim hasil akhir**, desainer memilih cara kirim (`Project.finalDelivery`, kosong = data lama = file):

| Cara | Yang diisi desainer | Portal klien sebelum lunas | Sesudah lunas | Kabar WA |
|---|---|---|---|---|
| `FILE` (default) | file wajib (kategori FINAL) | nama file terkunci + sisa pelunasan | unduh file | seperti §1a |
| `LINK` | link http(s) lengkap (`Project.finalLink`), mis. Google Drive | "Link file final" terkunci + sisa pelunasan; link tidak dikirim ke browser | tombol "Buka link file final" | belum lunas: "Link file final bisa dibuka setelah pelunasan …"; lunas: "cek, setujui, dan buka link filenya"; `FILES_UNLOCKED`: "Link file final sudah bisa dibuka" |
| `WHATSAPP` | tidak ada file/link; admin mengirim file dari HP | "Dikirim lewat WhatsApp setelah pelunasan" + sisa pelunasan | "File final dikirim tim kami lewat WhatsApp" | belum lunas: "File final kami kirim lewat WhatsApp setelah pelunasan …" + rekening; lunas: "File finalnya kami kirim lewat WhatsApp di chat ini"; `FILES_UNLOCKED`: "File final segera kami kirim lewat WhatsApp" |

Untuk `WHATSAPP`, file tetap dikirim manual oleh admin/desainer dari HP (sistem tidak mengirim file). Link ditolak bila
bukan http(s) (mis. `javascript:`), dan hanya dikirim ke browser klien setelah `paymentStatus` = `PAID`.

## 2. Pengiriman

- `notifyClientProjectEvent` (`src/lib/notifications/client-project-events.ts`) dipanggil lewat `after()` dari route
  pemicu; gagal kirim tidak membatalkan aksi desainer/owner.
- Tujuan: percakapan WhatsApp klien project itu dengan pesan masuk terbaru (bukan Uji bot, bukan nomor yang diblokir).
  Klien tanpa chat WhatsApp (mis. alur form-link) → dilewati (`NO_CONVERSATION`).
- Dikirim sebagai teks lewat `sendSystemText` dan tercatat di riwayat chat (Inbox). Tetap dikirim walau chat sedang
  diambil alih admin (pesan sistem, sama seperti penawaran harga).
- Saluran Meta di luar 24 jam: dilewati (`OUTSIDE_SERVICE_WINDOW`); belum ada template untuk kabar ini. Kirimi dan Fonnte
  selalu teks.
- Log `ClientProjectNotice` (status `SENDING`/`SENT`/`PENDING`/`SKIPPED`/`FAILED`, alasan). Unik per
  (project, kejadian, update/revisi): klik ganda atau kartu kanban digeser bolak-balik tidak mengirim dua kali.

## 3. Jeda update progres

- Maksimal satu kabar progres per project per 60 menit. Update di dalam jeda dicatat `PENDING`; hanya update terbaru
  yang disimpan (yang lama diganti).
- Cron `POST /api/cron/client-notices` mengirim `PENDING` yang jedanya sudah lewat. Klaim atomik `PENDING → SENDING`
  mencegah kiriman ganda bila cron berjalan bersamaan.
- Pengaman: header `Authorization: Bearer <CRON_SECRET>` (env di VPS); tanpa secret → 401, env kosong → 503.

### Unit systemd (VPS)

`/etc/systemd/system/yukdesain-client-notices.service`:

```ini
[Unit]
Description=YukDesain: kirim kabar progres tertunda

[Service]
Type=oneshot
EnvironmentFile=/etc/yukdesain/cron.env
ExecStart=/bin/sh -c 'curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/client-notices'
```

`/etc/systemd/system/yukdesain-client-notices.timer`:

```ini
[Unit]
Description=YukDesain: kabar progres tertunda setiap 5 menit

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

`/etc/yukdesain/cron.env` (root, 600) berisi satu baris `CRON_SECRET=…` yang sama dengan `.env` aplikasi. systemd tidak
boleh membaca `.env` di `/var/www` (SELinux, "Failed to load environment files: Permission denied"), jadi secret disalin:
`grep "^CRON_SECRET=" /var/www/yukdesain-project-managent/.env > /etc/yukdesain/cron.env`.

Aktifkan: `systemctl daemon-reload && systemctl enable --now yukdesain-client-notices.timer`. Terpasang di produksi
2026-11-08 (uji: dengan secret `{"ok":true,…}`, tanpa secret 401).

## 4. Revisi selesai

Workspace desainer → tab Revisi → **Tandai revisi selesai** (konfirmasi singkat). Mengisi `Revision.completedAt` dan
`completedById`, mencatat ActivityLog `REVISION_COMPLETED`, lalu mengirim kabar `REVISION_DONE`. Hanya desainer yang
ditugaskan atau owner; revisi ditutup bila final sudah disetujui. Portal klien menampilkan langkah "Revisi #n selesai".
