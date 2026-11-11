#!/bin/bash
# Kembalikan portal YukDesain ke rilis sebelumnya (atau rilis yang disebut).
#   /root/rollback-yukdesain.sh                 -> rilis terbaru sebelum yang aktif
#   /root/rollback-yukdesain.sh 20261108-...    -> rilis tertentu di releases/
# Catatan: skema DB tidak ikut mundur (db push hanya aditif, jadi kode lama tetap jalan).
set -euo pipefail

exec 9>/var/lock/yukdesain-deploy.lock
flock -n 9 || { echo "Deploy lain masih jalan"; exit 1; }

RELEASES=/var/www/yukdesain/releases
LIVE=/var/www/yukdesain-project-managent
CURRENT=$(readlink -f "$LIVE")

if [ $# -ge 1 ]; then
  TARGET="$RELEASES/$1"
else
  TARGET=$(ls -1d "$RELEASES"/*/ | sed 's#/$##' | sort -r | awk -v cur="$CURRENT" '$0 < cur { print; exit }')
fi

[ -n "${TARGET:-}" ] && [ -d "$TARGET/.next" ] || { echo "Rilis tujuan tidak ditemukan / belum di-build: ${TARGET:-}"; ls -1 "$RELEASES"; exit 1; }

echo "Rollback: $CURRENT -> $TARGET"
ln -sfn "$TARGET" "$LIVE.tmp"
mv -Tf "$LIVE.tmp" "$LIVE"
timeout 60 systemctl restart yukdesain </dev/null

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null -m 5 http://127.0.0.1:3000/login; then
    echo "Rollback OK"
    exit 0
  fi
  sleep 1
done
echo "Server belum sehat setelah rollback, cek journalctl -u yukdesain"
exit 1
