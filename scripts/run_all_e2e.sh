#!/usr/bin/env bash
# Full E2E battery — requires preview on :5199
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export EX_UI_BASE="${EX_UI_BASE:-http://127.0.0.1:5199/}"

PREVIEW_PID=""
cleanup_preview() {
  if [[ -n "$PREVIEW_PID" ]]; then kill "$PREVIEW_PID" 2>/dev/null || true; fi
}
trap cleanup_preview EXIT

if ! curl -sf "${EX_UI_BASE%/}/" >/dev/null 2>&1; then
  echo "[e2e] starting preview on ${EX_UI_BASE}"
  npm run preview -- --port 5199 --host 127.0.0.1 >/tmp/hackme-ex-preview.log 2>&1 &
  PREVIEW_PID=$!
  for _ in $(seq 1 30); do
    curl -sf "${EX_UI_BASE%/}/" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

echo "[e2e] paper build (preview serves dist/)"
VITE_INTEGRATION_MODE=paper VITE_LAB_API=0 VITE_EXCHANGE_API_ORIGIN= npm run build

echo "[e2e] vitest"
npm test

for script in multi_viewport_pass.mjs full_ui_ux_pass.mjs b_chart_manual_pass.mjs g10_visual_pass.mjs convert_account_pass.mjs; do
  echo "[e2e] node scripts/$script"
  node "scripts/$script"
done

echo "[e2e] node scripts/mega_ui_audit.mjs (build skipped — fresh dist above)"
EX_AUDIT_SKIP_BUILD=1 node scripts/mega_ui_audit.mjs

echo "[e2e] ALL PASS"
