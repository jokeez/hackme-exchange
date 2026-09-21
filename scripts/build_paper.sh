#!/usr/bin/env bash
# Paper/D0 SPA build — force-clear lab Vite env so fixture seed cannot bake into dist.
# CRYPTO-001: shell env overrides .env; empty origin + LAB_API≠1 → no lab fixture.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VITE_INTEGRATION_MODE=paper \
VITE_LAB_API=0 \
VITE_EXCHANGE_API_ORIGIN= \
  npx tsc && \
VITE_INTEGRATION_MODE=paper \
VITE_LAB_API=0 \
VITE_EXCHANGE_API_ORIGIN= \
  npx vite build && \
  node scripts/cf_chunk_assets.mjs
