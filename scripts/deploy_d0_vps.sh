#!/usr/bin/env bash
# Build paper SPA and rsync to exchange.hackme.tech static root.
#
#   EXCHANGE_VPS=root@89.150.41.40 EXCHANGE_VPS_PATH=/var/www/exchange bash scripts/deploy_d0_vps.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VPS="${EXCHANGE_VPS:-root@89.150.41.40}"
REMOTE_PATH="${EXCHANGE_VPS_PATH:-/var/www/exchange}"

echo "[deploy] npm test"
npm test

echo "[deploy] paper build (no lab fixture in bundle)"
VITE_INTEGRATION_MODE=paper \
VITE_LAB_API=0 \
VITE_EXCHANGE_API_ORIGIN= \
  npm run build

if grep -Rqs '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20' dist/assets/*.js 2>/dev/null; then
  echo "[deploy] FAIL: lab fixture seed in dist" >&2
  exit 1
fi

echo "[deploy] rsync → ${VPS}:${REMOTE_PATH}/"
rsync -avz --delete dist/ "${VPS}:${REMOTE_PATH}/"

echo "[deploy] remote index probe"
ssh "$VPS" "wc -c '${REMOTE_PATH}/index.html' && ls -la '${REMOTE_PATH}/assets/' | head -5"

echo "[deploy] OK — https://exchange.hackme.tech/"
