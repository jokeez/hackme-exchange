#!/usr/bin/env bash
# Publish dist-d0 paper SPA to the Cloudflare origin for exchange.hackme.tech.
# CF DNS A → 89.150.41.40 (proxied). Do NOT deploy only to hackme-vps (/opt/hackme/web/exchange).
#
# Never use rsync --delete (can wipe sibling origin files). Never HOT_SEND.
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

echo "[deploy-paper] rsync → ${HOST}:${REMOTE}/ (no --delete)"
rsync -az -e 'ssh -o BatchMode=yes' "$LOCAL"/ "${HOST}:${REMOTE}/"
ssh -o BatchMode=yes "$HOST" "date -u +%Y%m%dT%H%M%SZ > ${REMOTE}/CUTOVER_MARKER.txt"

BOOT=$(grep -oE 'boot-[A-Za-z0-9_-]+\.js' "$LOCAL/index.html" | head -1)
echo "[deploy-paper] local boot=$BOOT"
LIVE=$(curl -fsS --max-time 20 -H 'Cache-Control: no-cache' "https://exchange.hackme.tech/" | grep -oE 'boot-[A-Za-z0-9_-]+\.js' | head -1 || true)
echo "[deploy-paper] public boot=${LIVE:-?}"
if [[ -n "$LIVE" && "$LIVE" != "$BOOT" ]]; then
  echo "[deploy-paper] WARN: public HTML still shows $LIVE (CF/browser cache?) — expected $BOOT" >&2
fi

SW=$(grep -oE '/sw-v5-[a-f0-9]+\.js' "$LOCAL/index.html" | head -1 || true)
if [[ -z "$SW" ]]; then
  SW=$(grep -oE 'sw-v5-[a-f0-9]+\.js' "$LOCAL"/assets/*.part 2>/dev/null | head -1 | sed 's/.*://;s|^|/|' || true)
fi
# Fallback: hashed file on disk
if [[ -z "$SW" ]]; then
  SW="/$(basename "$(ls -1 "$LOCAL"/sw-v5-*.js 2>/dev/null | head -1)")"
fi
echo "[deploy-paper] local SW=${SW}"

# Soft header checks (document hard-refresh no longer required when these hold).
# Hashed /sw-v5-*.js cannot be a sticky CF HIT of an older worker body.
for path in "/" "/index.html" "${SW}" "/assets/${BOOT}"; do
  [[ "$path" == "/"* ]] || continue
  cc=$(curl -fsSI --max-time 15 -H 'Cache-Control: no-cache' "https://exchange.hackme.tech${path}" \
    | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print tolower($2); exit}')
  cf=$(curl -fsSI --max-time 15 -H 'Cache-Control: no-cache' "https://exchange.hackme.tech${path}" \
    | tr -d '\r' | awk -F': ' 'tolower($1)=="cf-cache-status"{print toupper($2); exit}')
  echo "[deploy-paper] Cache-Control ${path}: ${cc:-<missing>} cf=${cf:-?}"
  case "$cc" in
    *no-store*|*no-cache*|*max-age=0*) ;;
    *)
      echo "[deploy-paper] WARN: expected no-cache/no-store on ${path}, got '${cc:-<missing>}'" >&2
      ;;
  esac
done
if [[ -n "$SW" && "$SW" != "/." ]]; then
  if ! curl -fsS --max-time 15 "https://exchange.hackme.tech${SW}" | grep -q 'hackme-ex-v5'; then
    echo "[deploy-paper] FAIL: ${SW} does not look like v5 worker" >&2
    exit 1
  fi
  LIVE_SW_META=$(curl -fsS --max-time 15 -H 'Cache-Control: no-cache' "https://exchange.hackme.tech/" \
    | grep -oE 'content="/sw-v5-[a-f0-9]+\.js"' | head -1 || true)
  echo "[deploy-paper] HTML hackme-sw meta: ${LIVE_SW_META:-<missing>}"
fi

echo "[deploy-paper] OK"
