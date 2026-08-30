#!/usr/bin/env bash
# HOLD — manual static deploy for exchange.hackme.tech (D0 / rc17 cut window only).
# Does NOT run unless you invoke it explicitly. Prefer prepare_d0_static.sh for local QA.
#
#   EXCHANGE_VPS=user@host EXCHANGE_VPS_PATH=/var/www/exchange bash scripts/deploy_d0_vps.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VPS="${EXCHANGE_VPS:?set EXCHANGE_VPS=user@host}"
REMOTE_PATH="${EXCHANGE_VPS_PATH:-/var/www/exchange}"

echo "[deploy] D0 static gate (local)"
bash scripts/prepare_d0_static.sh

OUT_DIR="${OUT_DIR:-$ROOT/dist-d0}"
echo "[deploy] rsync dist-d0 → ${VPS}:${REMOTE_PATH}/"
rsync -avz --delete "$OUT_DIR/" "${VPS}:${REMOTE_PATH}/"

echo "[deploy] remote probe"
ssh "$VPS" "wc -c '${REMOTE_PATH}/index.html' && ls -la '${REMOTE_PATH}/assets/' | head -5"

echo "[deploy] OK — verify https://exchange.hackme.tech/"
