#!/usr/bin/env bash
# Paper/D0 SPA build — force-clear lab Vite env so fixture seed cannot bake into dist.
# Desk Connect (auth HOLD) is opt-in via VITE_PUBLIC_DESK_CONNECT without lab fixture seed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VITE_INTEGRATION_MODE=paper \
VITE_LAB_API=0 \
VITE_EXCHANGE_API_ORIGIN= \
VITE_PUBLIC_DESK_CONNECT="${VITE_PUBLIC_DESK_CONNECT:-1}" \
  npx tsc && \
VITE_INTEGRATION_MODE=paper \
VITE_LAB_API=0 \
VITE_EXCHANGE_API_ORIGIN= \
VITE_PUBLIC_DESK_CONNECT="${VITE_PUBLIC_DESK_CONNECT:-1}" \
  npx vite build && \
  node scripts/cf_chunk_assets.mjs
