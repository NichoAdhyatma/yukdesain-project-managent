#!/bin/bash
# Deploy portal YukDesain di VPS tanpa mengganggu server yang sedang jalan.
#
# Build dilakukan di folder rilis baru (releases/<waktu>-<sha>). Server lama tetap
# melayani dari foldernya sendiri sampai build selesai, lalu symlink
# /var/www/yukdesain-project-managent ditukar ke rilis baru dan service di-restart.
# Kalau /login tidak sehat setelah restart, symlink dikembalikan ke rilis lama.
#
# Salinan terpasang: /root/deploy-yukdesain.sh. Panduan: docs/DEPLOY.md.
# Jalankan terlepas dari SSH:
#   nohup setsid /root/deploy-yukdesain.sh > /root/deploy-last.log 2>&1; echo EXIT=$?
set -euo pipefail

# cegah dua deploy jalan bersamaan
exec 9>/var/lock/yukdesain-deploy.lock
flock -n 9 || { echo "Deploy lain masih jalan"; exit 1; }

export PATH=/usr/local/bin:/usr/bin:/bin
export HOME=/root
export NODE_OPTIONS="--dns-result-order=ipv4first --max-old-space-size=2048"
export GIT_TERMINAL_PROMPT=0
export NEXT_TELEMETRY_DISABLED=1

BASE=/var/www/yukdesain
REPO=$BASE/repo.git
RELEASES=$BASE/releases
SHARED=$BASE/shared
LIVE=/var/www/yukdesain-project-managent # symlink ke rilis aktif (dipakai unit systemd)
KEEP=3
HEALTH_URL=http://127.0.0.1:3000/login
# Build jalan dengan prioritas CPU rendah supaya server yang sedang melayani tetap kebagian CPU (VPS 2 core).
# ionice tidak dipakai: scheduler disk mq-deadline mengabaikannya.
LOW="nice -n 15"

log() { echo "[$(date '+%F %T')] $*"; }

wait_healthy() {
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null -m 5 "$HEALTH_URL" && return 0
    sleep 1
  done
  return 1
}

point_live_to() {
  ln -sfn "$1" "$LIVE.tmp"
  mv -Tf "$LIVE.tmp" "$LIVE"
}

[ -L "$LIVE" ] || { echo "$LIVE bukan symlink; lakukan migrasi di docs/DEPLOY.md dulu"; exit 1; }
PREV=$(readlink -f "$LIVE")

git --git-dir="$REPO" fetch --prune origin +refs/heads/main:refs/heads/main
SHA=$(git --git-dir="$REPO" rev-parse --short main)
NEW="$RELEASES/$(date +%Y%m%d-%H%M%S)-$SHA"
log "Rilis baru: $NEW"
log "Rilis aktif: $PREV"

# Rilis yang gagal di-build dibuang supaya tidak memakan disk.
SWITCHED=0
cleanup_failed() {
  if [ "$SWITCHED" = 0 ] && [ -d "$NEW" ]; then
    log "Build gagal, menghapus $NEW (server lama tetap jalan)"
    rm -rf "$NEW"
    git --git-dir="$REPO" worktree prune
  fi
}
trap cleanup_failed EXIT

git --git-dir="$REPO" worktree add --detach "$NEW" main
ln -s "$SHARED/.env" "$NEW/.env"

cd "$NEW"
# Paket: rilis baru selalu folder baru, jadi tanpa ini npm ci memasang ulang 1,1 GB dari nol (±3,5 menit di VPS
# 2 core). Bila package-lock.json sama dengan rilis aktif, node_modules disalin sebagai hardlink (beberapa detik).
# Hasil generate Prisma ditulis ulang di rilis baru; foldernya diganti salinan penuh dulu supaya prisma generate
# tidak menimpa file yang dipakai rilis aktif (hardlink = file yang sama).
if [ -d "$PREV/node_modules" ] && cmp -s "$PREV/package-lock.json" "$NEW/package-lock.json" \
  && cp -al "$PREV/node_modules" "$NEW/node_modules"; then
  log "package-lock sama: node_modules disalin dari rilis aktif"
  # node_modules/.cache: alat build menulis di sana; dibuang supaya tidak ikut mengubah file rilis aktif.
  rm -rf "$NEW/node_modules/.prisma" "$NEW/node_modules/@prisma/client" "$NEW/node_modules/.cache"
  cp -a "$PREV/node_modules/@prisma/client" "$NEW/node_modules/@prisma/client"
else
  rm -rf "$NEW/node_modules"
  log "npm ci"
  $LOW npm ci --no-audit --no-fund || $LOW npm install --no-audit --no-fund
fi
# Cache build webpack dari rilis aktif (salinan penuh, ±460 MB): next build tidak mulai dari nol (±4,5 menit).
if [ -d "$PREV/.next/cache" ]; then
  log "Salin cache build dari rilis aktif"
  mkdir -p "$NEW/.next"
  cp -a "$PREV/.next/cache" "$NEW/.next/cache" || rm -rf "$NEW/.next/cache"
fi
log "prisma generate + db push"
$LOW npx prisma generate
npx prisma db push
log "next build"
$LOW npx next build --webpack

log "Tukar symlink ke rilis baru dan restart"
point_live_to "$NEW"
SWITCHED=1
timeout 60 systemctl restart yukdesain </dev/null

if ! wait_healthy; then
  log "Rilis baru tidak sehat, kembali ke $PREV"
  point_live_to "$PREV"
  timeout 60 systemctl restart yukdesain </dev/null
  wait_healthy && log "Rollback OK" || log "Rollback juga tidak sehat, cek journalctl -u yukdesain"
  exit 1
fi

# Simpan $KEEP rilis terbaru; rilis aktif dan sebelumnya tidak pernah dihapus.
ls -1d "$RELEASES"/*/ | sed 's#/$##' | sort -r | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "$old" = "$NEW" ] || [ "$old" = "$PREV" ] && continue
  log "Hapus rilis lama $old"
  rm -rf "$old"
done
git --git-dir="$REPO" worktree prune

echo "Deploy OK: $SHA ($NEW)"
