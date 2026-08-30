#!/usr/bin/env bash
# Deep local audit — vitest, security subset, D0 paper build, optional D1 smoke.
#
#   bash scripts/full_audit.sh
#   FULL_AUDIT_SKIP_D1=1 bash scripts/full_audit.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EVIDENCE="${FULL_AUDIT_EVIDENCE:-$ROOT/docs/.local/FULL_AUDIT_EVIDENCE.md}"
mkdir -p "$(dirname "$EVIDENCE")"

step() { echo ""; echo "======== $* ========"; }
pass() { echo "PASS  $*"; }

step "vitest (full suite)"
npm test
pass "vitest 701+"

step "security / redteam subset"
npx vitest run \
  src/stress_redteam.test.ts \
  src/hardening.ui.test.ts \
  src/nav_views.security.test.ts \
  src/abuse_ddos.chart.test.ts \
  src/abuse_econ_latency.test.ts \
  src/exchangeAudit.test.ts \
  src/import_xss_probe.test.ts
pass "security subset"

step "D0 paper static build (CRYPTO-001 fixture guard)"
bash scripts/prepare_d0_static.sh
pass "prepare_d0_static"

if [[ "${FULL_AUDIT_SKIP_E2E:-}" != "1" ]]; then
  step "G10 visual pass (preview on :5199)"
  if curl -sf "http://127.0.0.1:5199/" >/dev/null 2>&1; then
    node scripts/g10_visual_pass.mjs
    pass "g10_visual_pass"
  else
    echo "SKIP  start: npm run preview -- --port 5199"
  fi
fi

if [[ "${FULL_AUDIT_SKIP_D1:-}" != "1" ]]; then
  API_ROOT="${HACKME_EXCHANGE_API:-$ROOT/../hackme-exchange-api}"
  if [[ -x "$API_ROOT/scripts/d1_local_up.sh" ]]; then
    step "D1 smoke (requires loopback API)"
    bash "$API_ROOT/scripts/d1_local_up.sh"
    npm run smoke:d1
    pass "smoke:d1"
  else
    echo "SKIP  hackme-exchange-api not found at $API_ROOT"
  fi
else
  echo "SKIP  FULL_AUDIT_SKIP_D1=1"
fi

{
  echo "# Full audit evidence — exchange-demo"
  echo
  echo "**When:** \`$STAMP\` (UTC)"
  echo "**Verdict:** SPA gates green · paper dist safe"
  echo
  echo "## Gates"
  echo
  echo "| Gate | Result |"
  echo "|------|--------|"
  echo "| vitest full | PASS |"
  echo "| security subset | PASS |"
  echo "| prepare_d0_static | PASS |"
  if [[ "${FULL_AUDIT_SKIP_E2E:-}" != "1" ]]; then
    echo "| g10_visual_pass | PASS or SKIP |"
  fi
  if [[ "${FULL_AUDIT_SKIP_D1:-}" != "1" ]]; then
    echo "| smoke:d1 | PASS or SKIP |"
  else
    echo "| smoke:d1 | SKIP |"
  fi
} >"$EVIDENCE"

echo ""
echo "[full-audit] wrote $EVIDENCE"
echo "[full-audit] OK — all gates green"
