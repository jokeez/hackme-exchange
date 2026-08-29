#!/usr/bin/env bash
# Full E2E battery — requires preview on :5199
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export EX_UI_BASE="${EX_UI_BASE:-http://127.0.0.1:5199/}"

echo "[e2e] vitest"
npm test

for script in multi_viewport_pass.mjs full_ui_ux_pass.mjs b_chart_manual_pass.mjs g10_visual_pass.mjs convert_account_pass.mjs mega_ui_audit.mjs; do
  echo "[e2e] node scripts/$script"
  node "scripts/$script"
done

echo "[e2e] ALL PASS"
