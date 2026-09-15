#!/usr/bin/env bash
# Build a D0-ready static tarball (PAPER SPA only). Does NOT publish DNS or touch CF.
#
#   bash scripts/prepare_d0_static.sh
#   → dist-d0/ and hackme-exchange-d0-YYYYMMDD.tar.gz
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${OUT_DIR:-$ROOT/dist-d0}"
TAR="${TAR:-$ROOT/hackme-exchange-d0-${STAMP}.tar.gz}"

echo "[d0-static] npm test (gate)"
npm test

echo "[d0-static] build (paper — force-clear lab Vite env so fixture seed is stripped)"
# Shell env overrides .env (CRYPTO-001). Empty origin + LAB_API≠1 → no fixture in dist.
VITE_INTEGRATION_MODE=paper \
VITE_LAB_API=0 \
VITE_EXCHANGE_API_ORIGIN= \
  npm run build

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -a dist/. "$OUT_DIR/"
cp -a STATUS.md "$OUT_DIR/STATUS.md"
cp -a docs/D0_CHECKLIST.md "$OUT_DIR/D0_CHECKLIST.md" 2>/dev/null || true

# Soft check: warn only if live mode is the *default* build (should be paper).
if grep -Rqs 'VITE_INTEGRATION_MODE","live\|mode:"live"' "$OUT_DIR"/assets/*.js 2>/dev/null; then
  echo "[d0-static] WARN: possible live default in bundle — inspect" >&2
fi
# CRYPTO-001: known DEMO/LAB fixture seed must not ship in paper release dist.
if grep -Rqs '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20' "$OUT_DIR"/assets/*.js 2>/dev/null; then
  echo "[d0-static] FAIL: lab fixture Ed25519 seed present in dist — build without VITE_LAB_API / VITE_EXCHANGE_API_ORIGIN" >&2
  exit 1
fi
if ! grep -qs 'frame-ancestors.*hackme\.tech' "$OUT_DIR"/index.html 2>/dev/null; then
  echo "[d0-static] FAIL: paper CSP missing frame-ancestors https://hackme.tech (hub embed)" >&2
  exit 1
fi
# The blocked-live console string is expected in the bundle; ignore it.

tar -C "$(dirname "$OUT_DIR")" -czf "$TAR" "$(basename "$OUT_DIR")"
echo "[d0-static] wrote $OUT_DIR"
echo "[d0-static] wrote $TAR"
echo "[d0-static] paper dist ready (gitignored) — publish with your own static host pipeline"
