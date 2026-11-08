# Kabar otomatis ke klien

Bot mengirim kabar WhatsApp ke klien saat order mereka berubah. Disetujui owner 2026-11-08
(spec: `docs/superpowers/specs/2026-11-08-client-tracking-chat-revisions-design.md` §4, Bagian A).

## 1. Kejadian

| Kejadian | Pemicu | Isi |
|---|---|---|
| `STARTED` | status project menjadi Sedang Dikerjakan (kanban) | Project mulai dikerjakan + link portal |
| `PROGRESS` | desainer mengirim update progres dengan **Kabari klien** menyala | Persen (bila diisi) + catatan (≤300 karakter) + link portal |
| `FINAL_SUBMITTED` | desainer mengirim hasil final | Hasil final siap, cek dan setujui lewat link portal |
| `REVISION_DONE` | desainer menekan **Tandai revisi selesai** | Revisi #n sudah dikerjakan + link portal |
| `COMPLETED` | project Selesai (kanban) atau klien menyetujui final | Project selesai, terima kasih |

Teks ada di `src/lib/notifications/client-notice-text.ts`. Tidak pernah memuat nama desainer, nominal, atau catatan internal.
Kalimat `FINAL_SUBMITTED` akan berubah ke "balas setuju di chat" setelah Bagian B (revisi dan final lewat chat) aktif.

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
EnvironmentFile=/var/www/yukdesain-project-managent/.env
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

Aktifkan: `systemctl daemon-reload && systemctl enable --now yukdesain-client-notices.timer`.

## 4. Revisi selesai

Workspace desainer → tab Revisi → **Tandai revisi selesai** (konfirmasi singkat). Mengisi `Revision.completedAt` dan
`completedById`, mencatat ActivityLog `REVISION_COMPLETED`, lalu mengirim kabar `REVISION_DONE`. Hanya desainer yang
ditugaskan atau owner; revisi ditutup bila final sudah disetujui. Portal klien menampilkan langkah "Revisi #n selesai".
