#!/usr/bin/env bash
# D1 local dev — Vite staging mode against loopback exchange-api (Postgres backend).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ROOT="${HACKME_EXCHANGE_API:-$ROOT/../hackme-exchange-api}"
PORT="${VITE_DEV_PORT:-5199}"

if ! curl -sf "http://127.0.0.1:18443/health" >/dev/null 2>&1; then
  echo "[dev:d1] API not up — starting local stack..."
  bash "$API_ROOT/scripts/d1_local_up.sh"
fi

export VITE_INTEGRATION_MODE=staging
export VITE_LAB_API=1
export VITE_EXCHANGE_API_ORIGIN=http://127.0.0.1:18443
export VITE_NODE_ORIGIN="${VITE_NODE_ORIGIN:-http://127.0.0.1:8080}"

cd "$ROOT"
echo "[dev:d1] http://127.0.0.1:${PORT} · staging · API http://127.0.0.1:18443"
exec npm run dev -- --host 127.0.0.1 --port "$PORT" --strictPort
