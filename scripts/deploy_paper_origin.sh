#!/usr/bin/env bash
# Publish dist-d0 paper SPA to the Cloudflare origin for exchange.hackme.tech.
# CF DNS A → 89.150.41.40 (proxied). Do NOT deploy only to hackme-vps (/opt/hackme/web/exchange).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL="${ROOT}/dist-d0"
HOST="${EXCHANGE_DEPLOY_HOST:-root@89.150.41.40}"
REMOTE="${EXCHANGE_DEPLOY_PATH:-/var/www/exchange}"

if [[ ! -f "$LOCAL/index.html" ]]; then
  echo "missing $LOCAL — run: npm run d0:static" >&2
  exit 1
fi
if ! grep -q 'boot-' "$LOCAL/index.html"; then
  echo "FAIL: dist-d0 index has no boot asset" >&2
  exit 1
fi

echo "[deploy-paper] rsync → ${HOST}:${REMOTE}/"
rsync -az --delete -e 'ssh -o BatchMode=yes' "$LOCAL"/ "${HOST}:${REMOTE}/"
ssh -o BatchMode=yes "$HOST" "date -u +%Y%m%dT%H%M%SZ > ${REMOTE}/CUTOVER_MARKER.txt"

BOOT=$(grep -oE 'boot-[A-Za-z0-9_-]+\.js' "$LOCAL/index.html" | head -1)
echo "[deploy-paper] local boot=$BOOT"
LIVE=$(curl -fsS --max-time 20 "https://exchange.hackme.tech/" | grep -oE 'boot-[A-Za-z0-9_-]+\.js' | head -1 || true)
echo "[deploy-paper] public boot=${LIVE:-?}"
if [[ -n "$LIVE" && "$LIVE" != "$BOOT" ]]; then
  echo "[deploy-paper] WARN: public HTML still shows $LIVE (CF/browser cache?) — expected $BOOT" >&2
fi
echo "[deploy-paper] OK"
