# Deploy portal di VPS

Portal berjalan di satu VPS (bukan Vercel): service systemd `yukdesain` (`next start` di `127.0.0.1:3000`), di
belakang nginx. Bot WhatsApp (webhook Kirimi), web push owner, dan timer `yukdesain-client-notices` ada di server yang
sama, jadi error saat deploy juga mengenai webhook bot. Berlaku sejak 2026-11-08.

## 1. Masalah yang diperbaiki

Script lama menjalankan `npm ci` dan `next build` di folder yang sedang dipakai server. Selama build (±2 menit) server
lama membaca `.next/` yang sedang ditulis ulang dan mengeluarkan `InvariantError: The client reference manifest for
route "/" does not exist` serta `Failed to load static file for page: /500 ENOENT` (log 2026-11-08 08:36). `npm ci` juga
menghapus `node_modules` di bawah server yang sedang jalan.

## 2. Susunan folder

```
/var/www/yukdesain/
  repo.git/                         clone bare dari GitHub, sumber semua rilis
  shared/.env                       satu-satunya .env (root, 600), di-symlink ke tiap rilis
  releases/<YYYYMMDD-HHMMSS>-<sha>/  git worktree + node_modules + .next
/var/www/yukdesain-project-managent  symlink ke rilis aktif
```

Unit systemd tetap memakai `WorkingDirectory=/var/www/yukdesain-project-managent`. systemd mengikuti symlink saat
start, jadi proses node berjalan di path asli rilisnya (sudah diuji di bawah SELinux enforcing). Server yang sedang
jalan tidak terpengaruh oleh rilis baru yang sedang di-build.

## 3. Alur deploy (`/root/deploy-yukdesain.sh`)

Sumber script: `deploy/deploy-yukdesain.sh` di repo ini. Salinan di server yang dijalankan.

1. Kunci `flock` (`/var/lock/yukdesain-deploy.lock`) supaya tidak ada dua deploy sekaligus.
2. `git fetch` ke `repo.git`, lalu `git worktree add` rilis baru dari `main`, lalu symlink `.env` dari `shared/`.
3. Di folder rilis baru: `npm ci`, `prisma generate`, `prisma db push` (aditif saja), `next build --webpack`
   (`--max-old-space-size=2048`; RAM 1,7 GB + swap 4 GB). `npm ci`, `prisma generate`, dan build jalan dengan
   `nice -n 15` supaya server yang sedang melayani tetap kebagian CPU (VPS 2 core). `ionice` tidak dipakai karena
   scheduler disk (`mq-deadline`) mengabaikannya. Kalau satu langkah gagal, folder rilis dihapus dan server lama tetap
   jalan tanpa perubahan apa pun.
4. Symlink ditukar secara atomik (`ln -sfn` + `mv -T`), lalu `systemctl restart yukdesain`.
5. Script menunggu `GET /login` sehat hingga 30 detik. Kalau tidak sehat, symlink dikembalikan ke rilis sebelumnya dan
   service di-restart lagi (exit 1).
6. Hanya 3 rilis terbaru yang disimpan (±2 GB per rilis). Rilis aktif dan rilis sebelumnya tidak pernah dihapus.

Jalankan terlepas dari SSH (koneksi bisa putus selama build):

```bash
ssh root@38.9.47.29 'nohup setsid /root/deploy-yukdesain.sh > /root/deploy-last.log 2>&1 < /dev/null; echo EXIT=$? >> /root/deploy-last.log'
```

Pantau dengan `tail -f /root/deploy-last.log`. Baris terakhir yang diharapkan: `Deploy OK: <sha> (...)` lalu `EXIT=0`.

Yang masih tersisa: jeda restart ±1–2 detik (Next siap dalam ±0,3 detik). Request yang masuk tepat di jeda itu
mendapat 502 dari nginx. Kalau ini perlu dihilangkan, langkahnya dua port bergantian dengan pengalihan upstream di
nginx. Untuk sekarang itu belum dibuat.

## 4. Rollback

```bash
ssh root@38.9.47.29 /root/rollback-yukdesain.sh
```

Tanpa argumen, script kembali ke rilis terbaru sebelum rilis aktif. Dengan argumen nama folder, misalnya
`/root/rollback-yukdesain.sh 20261108-083800-eb2a815`, script kembali ke rilis itu. Daftar rilis:
`ls /var/www/yukdesain/releases`. Skema DB tidak ikut mundur. Karena `db push` hanya aditif, kode lama tetap bisa jalan.
Sumber script: `deploy/rollback-yukdesain.sh`.

## 5. Mengubah env

Ubah **`/var/www/yukdesain/shared/.env`** langsung, lalu `systemctl restart yukdesain`. Jangan memakai `sed -i` lewat
path `/var/www/yukdesain-project-managent/.env`: `sed -i` mengganti symlink dengan file biasa, sehingga perubahan
hanya berlaku di rilis itu dan hilang di deploy berikutnya. Kalau ada env yang juga disalin ke `/etc/yukdesain/cron.env`
(lihat `docs/CLIENT_NOTIFICATIONS.md`), salinan itu tetap harus diperbarui sendiri.

**`AI_KEYS_SECRET`** (kunci enkripsi API key provider AI, `docs/AI_PROVIDERS.md`): 32 byte acak base64 di
`shared/.env`, dibuat sekali langsung di server (`openssl rand -base64 32`). Jangan diganti setelah ada provider
tersimpan: key yang sudah tersimpan tidak bisa dibuka lagi dan harus diisi ulang.

## 6. Aturan yang tidak berubah

- Jangan pernah menjalankan `prisma/seed.ts` (atau `npm run db:seed` / `db:reset`) di produksi.
- Skema hanya berubah lewat `prisma db push` aditif.
- Rahasia tidak ditulis di chat atau di repo.
- Deploy dijalankan setelah merge ke `main` disetujui owner.

## 7. Migrasi sekali jalan (sudah dilakukan 2026-11-08)

Dicatat supaya bisa diulang di server baru:

```bash
B=/var/www/yukdesain; OLD=/var/www/yukdesain-project-managent
REL=$B/releases/20261108-083800-eb2a815
mkdir -p $B/releases $B/shared && chmod 700 $B/shared
cp -a $OLD/.env $B/shared/.env && chmod 600 $B/shared/.env
rm $OLD/.env && ln -s $B/shared/.env $OLD/.env
git clone --bare $OLD $B/repo.git
git --git-dir=$B/repo.git remote set-url origin https://github.com/NichoAdhyatma/yukdesain-project-managent.git
ln -sfn $REL $OLD.tmp && mv $OLD $REL && mv -Tf $OLD.tmp $OLD
```

Script lama disimpan di `/root/deploy-yukdesain.sh.bak`.

## 8. Validasi

Deploy pertama dengan script baru, 2026-11-08 08:44–08:52 WIB, `main` = `eb2a815`:

| Tahap | Waktu |
|---|---|
| `npm ci` | 3 m 31 d |
| `prisma generate` + `db push` | 7 d |
| `next build --webpack` (tanpa cache) | 4 m 30 d |
| Restart sampai `/login` 200 | ±2 d |

- `journalctl -u yukdesain` sejak deploy dimulai: **0** baris `InvariantError` / `ENOENT` / `manifest`.
- Probe `curl -m 5 http://127.0.0.1:3000/login` tiap ±2 detik: 153 dari 163 mendapat 200.
  - 2 gagal saat restart (08:52:27, connection refused), sesuai jeda restart.
  - 8 timeout >5 detik selama `npm ci` dan build. Penyebabnya CPU (2 core, load ±5) dan RAM (tersisa ±100 MB) di VPS
    kecil, bukan error. Server lama tidak restart (PID sama, tidak ada OOM). Tekanan ini juga ada dengan script lama.
- Setelah deploy, proses node berjalan di path asli rilis baru (`/proc/<pid>/cwd`). Rilis lama tetap ada untuk rollback.
- `nice -n 15` ditambahkan setelah deploy ini untuk mengurangi timeout di atas. Efeknya belum diukur; ukur di deploy
  berikutnya dengan probe yang sama (`curl -m 5 -w "%{http_code} %{time_total}"` tiap 2 detik).
- `status=143` / "Failed with result 'exit-code'" saat restart adalah SIGTERM biasa dari `systemctl restart`, bukan
  crash.
