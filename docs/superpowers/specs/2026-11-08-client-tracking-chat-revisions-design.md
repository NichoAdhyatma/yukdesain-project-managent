# Desain: kabar otomatis ke klien, revisi dan persetujuan final lewat chat, portal khusus tracking

Tanggal: 2026-11-08. Status: **menunggu review owner**. Disusun dari diskusi dengan owner (sesi 2026-11-08).

## 1. Tujuan

Portal klien hanya untuk **memantau progres**, supaya klien tidak terbebani. Semua tindakan klien (revisi, persetujuan
hasil final) pindah ke chat WhatsApp dengan bot, dan bot **mengabari klien** saat ada perubahan di order mereka.

Kriteria berhasil:

1. Klien menerima kabar WhatsApp saat project mulai dikerjakan, saat desainer mengirim update (jika dipilih), saat hasil
   final dikirim, dan saat revisi atau project selesai.
2. Klien bisa meminta revisi dan menyetujui hasil final lewat chat, dengan konfirmasi, tanpa membuka portal.
3. Portal klien hanya menampilkan status, progres, deadline, timeline, pembayaran, dan invoice (plus form brief untuk alur
   form-link).
4. Kuota revisi, aturan final, dan data yang terlihat klien tetap sama seperti sekarang.

## 2. Keputusan owner (2026-11-08)

| Topik | Keputusan |
|---|---|
| Revisi lewat chat | **Bot merangkum, klien konfirmasi**: bot merangkum permintaan + gambar referensi, klien membalas "kirim", lalu revisi tercatat dan terhitung 1x. |
| Kabar ke klien | Semua: **mulai dikerjakan**, **update progres desainer**, **hasil final dikirim**, **revisi selesai / project selesai**. |
| Persetujuan final | **Lewat chat dengan satu kali konfirmasi**; permintaan perubahan setelah final dikirim menjadi revisi. |
| Frekuensi update progres | **Desainer memilih per update** ("Kabari klien", default tercentang) + pengaman: maksimal satu kabar progres per project per jam; update di jeda itu digabung menjadi satu pesan berisi update terakhir. |
| Portal klien | Khusus tracking. Form revisi dan tombol setujui final dihapus. |

Tetap tidak berubah: bot tidak menentukan harga, deadline, validitas DP, atau membuat project; kuota revisi per project
(`Project.revisionQuota`, Operasional studio); revisi ditutup setelah final disetujui.

## 3. Kondisi sekarang (dari kode)

- Status project berubah di `api/projects/[id]/status` (kanban owner/desainer); update progres dibuat di
  `api/designer/projects/[id]/updates` (`ProjectUpdate.progress`); hasil final di `api/designer/projects/[id]/submit-final`
  (`finalSubmittedAt`); persetujuan final di `api/client-links/[token]/approve-final` (`finalApprovedAt` + status
  `SELESAI`).
- Revisi diajukan klien di portal (`api/client-links/[token]/revisions`) atau oleh owner (`api/projects/[id]/revisions`).
  `RevisionStatus` = PENDING / APPROVED / REJECTED, tetapi **tidak ada kode yang mengubah status revisi**: belum ada cara
  menandai revisi sudah dikerjakan.
- Bot hanya membaca project (`get_my_projects`, `get_project_by_code`, `client-safe-dto.ts`) dan menyatakan "tidak bisa
  menerima revisi lewat chat".
- Pesan ke klien di luar bot: `sendToClient` (`outbound.ts`, saluran aktif; di Meta di luar 24 jam lewat template).
- Klien terhubung ke chat lewat `WaConversation.clientId` / `Client.phone`.
- Tidak ada tugas terjadwal (cron) di aplikasi.

## 4. Bagian A: kabar otomatis ke klien

### 4.1 Kejadian dan isi pesan

| Kejadian | Pemicu | Isi (ringkas, ramah, tanpa data internal) |
|---|---|---|
| `STARTED` | status menjadi `SEDANG_DIKERJAKAN` | Project mulai dikerjakan + link portal |
| `PROGRESS` | update progres dengan "Kabari klien" tercentang | Persen + catatan desainer (≤300 karakter) + link portal |
| `FINAL_SUBMITTED` | `submit-final` | Hasil final siap dicek di link portal; balas "setuju" atau tulis revisi di chat |
| `REVISION_DONE` | desainer menandai revisi selesai (4.3) | Revisi #n sudah dikerjakan + link portal |
| `COMPLETED` | final disetujui / status `SELESAI` | Project selesai, terima kasih |

Nama desainer, catatan internal, `ownerId`, dan nominal lain tidak pernah masuk pesan (aturan DTO klien yang sudah ada).

### 4.2 Pengiriman

- Modul baru `src/lib/notifications/client-project-events.ts`: `notifyClientProjectEvent(projectId, event)` dipanggil
  lewat `after()` dari route pemicu (gagal kirim tidak membatalkan aksi desainer/owner).
- Tujuan: percakapan WA klien project itu (`WaConversation` dengan `clientId` project, bukan sandbox, tidak diblokir).
  Tanpa percakapan atau nomor → dilewati dan dicatat.
- Pesan dikirim dengan `sendToClient` (tersimpan sebagai OUTBOUND, tampil di Inbox). Mode HUMAN tidak menahan kabar ini
  (pesan sistem, sama seperti penawaran harga).
- Saluran Meta di luar 24 jam: belum ada template untuk kabar ini → **dilewati dan dicatat** (bukan dikirim template lain).
  Kirimi dan Fonnte selalu teks.
- Log baru `ClientProjectNotice` (aditif): `projectId`, `event`, `refId` (update/revisi), `status` (SENT / SKIPPED /
  PENDING / FAILED), `reason`, `sentAt`, `createdAt`. Unik per (`event`, `refId`) supaya klik ganda / retry tidak
  mengirim dua kali.

### 4.3 Revisi selesai

- Kolom baru `Revision.completedAt DateTime?` dan `completedById String?` (aditif). `RevisionStatus` lama tidak diubah.
- Workspace desainer mendapat tombol **"Tandai revisi selesai"** per revisi PENDING milik project yang ditugaskan;
  endpoint `POST api/designer/projects/[id]/revisions/[revisionId]/complete` (desainer yang ditugaskan atau owner).
- Portal dan bot menampilkan revisi "Selesai dikerjakan" bila `completedAt` terisi.

### 4.4 Penggabungan update progres

- Form update progres mendapat centang **"Kabari klien"** (default tercentang); disimpan sebagai
  `ProjectUpdate.notifyClient Boolean @default(true)`.
- Bila kabar `PROGRESS` untuk project itu terkirim kurang dari 60 menit lalu, update baru dicatat `PENDING` (tidak
  dikirim). Update `PENDING` yang lebih lama diganti yang terbaru (satu PENDING per project).
- Tugas terjadwal: `POST /api/cron/client-notices` (header `Authorization: Bearer <CRON_SECRET>`, env baru, di
  `PUBLIC_PATHS`) mengirim PENDING yang jedanya sudah lewat. Dijalankan systemd timer di VPS setiap 5 menit
  (`docs/CLIENT_NOTIFICATIONS.md` berisi unit timer-nya). Kabar selain `PROGRESS` tidak ditahan.

## 5. Bagian B: revisi dan persetujuan final lewat chat

### 5.1 Tool bot baru

| Tool | Input | Aturan server |
|---|---|---|
| `draft_revision` | `project_code`, `description` (≤2000), `image_message_ids[]` (dari STATE) | Project milik klien nomor ini (pencocokan sama dengan `get_my_projects`), sudah dikerjakan (`SEDANG_DIKERJAKAN`), belum final disetujui, kuota tersisa > 0. Menyimpan draft di percakapan (belum terhitung). Mengembalikan ringkasan + sisa kuota + `revisionNotice`. |
| `confirm_revision` | — | Hanya bila ada draft yang sudah dikirim ke klien pada giliran sebelumnya dan sesudahnya ada pesan klien baru (pengaman di bawah). Membuat `Revision` (nomor berikutnya, `remainingQuota` dari kuota project, lampiran dari gambar WA), notifikasi desainer + owner (web push), lalu draft dihapus. |
| `approve_final` | `project_code`, `confirmed` | Hanya bila `finalSubmittedAt` terisi dan `finalApprovedAt` kosong. Panggilan pertama mencatat permintaan konfirmasi dan mengembalikan kalimatnya; `confirmed: true` hanya diterima bila permintaan itu dibuat pada giliran sebelumnya dan sesudahnya ada pesan klien baru → `finalApprovedAt` + `SELESAI` (logika sama dengan `approve-final` portal, diekstrak ke `src/lib/projects/approve-final.ts`) + kabar `COMPLETED`. |

- Draft revisi atau permintaan konfirmasi final disimpan di `WaConversation.pendingClientAction Json?` (aditif):
  `{ kind: "REVISION" | "FINAL_APPROVAL", projectId, createdAt, … }`, berlaku 24 jam, satu per percakapan.
- **Pengaman konfirmasi**: model yang menilai jawaban klien (pola sama dengan `confirm_brief`), tetapi server hanya
  menerima konfirmasi bila tindakan tertunda dibuat pada giliran sebelumnya dan ada pesan INBOUND klien setelah
  `createdAt`. Jadi bot tidak bisa membuat dan mengonfirmasi dalam satu giliran.
- Gambar referensi: gambar klien yang belum ditanggapi (sudah tersimpan sebagai `WaMessage` image) disalin menjadi
  `Attachment` revisi.
- Prompt: bagian "Status project yang sudah berjalan" diperbarui (revisi bisa lewat chat dengan alur draft → konfirmasi;
  sampaikan `revisionNotice` apa adanya sebelum konfirmasi; kuota habis atau sudah final → jelaskan dan tawarkan
  admin).
- Kalimat prompt "tidak bisa menerima revisi lewat chat" dihapus.

### 5.2 Yang tidak boleh

- Bot tidak membuat revisi tanpa konfirmasi eksplisit, tidak menambah kuota, dan tidak mengubah status project selain
  persetujuan final yang dikonfirmasi klien.
- Owner sebagai klien uji (`#klien`) dan Uji bot (sandbox) tidak membuat revisi sungguhan pada project nyata; sandbox
  hanya membuat draft.

## 6. Bagian C: portal klien khusus tracking

- Tetap: status + progres pengerjaan (PR #25), deadline, timeline (brief, desainer, update progres dengan file, revisi
  sebagai catatan, final), status pembayaran, unduh invoice, form brief untuk project `DRAFT` (alur form-link).
- Dihapus: form "Request Revisi", tombol "Setujui hasil final", kartu kuota revisi yang mengajak mengajukan revisi
  (diganti teks sisa revisi saja).
- Ajakan tunggal: "Mau revisi atau menyetujui hasil? Balas lewat WhatsApp" dengan link `wa.me` ke nomor studio
  (`StudioSettings.phone`; disembunyikan bila kosong).
- Route `api/client-links/[token]/revisions` dan `approve-final` dinonaktifkan untuk klien (410 dengan pesan arahan ke
  WhatsApp); route owner `api/projects/[id]/revisions` tetap.
- Gambar progres dibuka dengan viewer yang sama dengan workspace desainer (PR #24).

## 7. Perubahan dokumen bisnis

- BRD: revisi dan persetujuan final dilakukan lewat chat bot dengan konfirmasi; portal klien khusus tracking; bot
  mengirim kabar status. Dicatat sebagai perubahan 2026-11-08.
- `docs/WHATSAPP_AI_CHATBOT.md`: tool baru dan batasnya; `docs/CLIENT_NOTIFICATIONS.md` (baru): kejadian, penggabungan,
  cron.

## 8. Urutan dan ketergantungan

1. **A** setelah PR #24 (workspace desainer) di-merge, karena form update progres ikut berubah.
2. **B** setelah A (konfirmasi final memicu kabar `COMPLETED`).
3. **C** setelah B berjalan di produksi (klien sudah bisa revisi lewat chat sebelum form portal dihapus).

## 9. Pengujian

- A: pemilihan kejadian per pemicu; dedupe (`event`, `refId`); jeda 60 menit dan satu PENDING per project; Meta di luar
  24 jam → SKIPPED; isi pesan tanpa data internal; cron menolak tanpa secret.
- B: `draft_revision` menolak project milik orang lain, project belum dikerjakan, final disetujui, dan kuota habis;
  `confirm_revision` tanpa draft, draft kedaluwarsa, atau di giliran yang sama dengan draft ditolak; nomor revisi dan `remainingQuota` benar; `approve_final`
  tanpa `confirmed`, atau tanpa pesan klien baru setelah permintaan konfirmasi, tidak mengubah apa pun; sandbox tidak
  membuat revisi.
- C: portal tanpa form revisi/approve; route lama 410; link WhatsApp tampil hanya bila nomor studio ada.
- Setiap bagian: typecheck, lint, test, build, uji browser (UI/UX Pro Max + `/antislop` untuk UI).

## 10. Di luar lingkup

- Template Meta untuk kabar di luar 24 jam.
- Pengiriman file hasil (gambar/PDF) langsung lewat WhatsApp; kabar memakai link portal.
- Penolakan revisi oleh desainer (REJECTED) dan alur sengketa revisi.
