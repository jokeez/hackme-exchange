# D0 Paper — go/no-go checklist

**Target soft-launch:** 2026-09-15 (`exchange.hackme.tech` static, PAPER only)  
**Decision gate:** 2026-09-10  
**If red:** slip D0 → **2026-10-15** (winter ok)

## Locked decisions (2026-08-06)

| Topic | Decision |
|-------|----------|
| Subdomain now? | **NO** until D0 week — localhost / hub `#exchange` only |
| D0 content | Static SPA from `dist/` + `STATUS.md` — **no** exchange-api on public edge |
| Live mode | Remains **blocked** in SPA |
| DB for D1 | **Postgres** preferred for `exchange-api` (lab SQLite stays private) |
| VPS for D0 | **Not required** (static on mirror or CF later) |
| VPS for D1 | **Required** — separate from mining hub |
| Hub USDT rows | **Do not** ship in main HackMe dashboard until Phase 2 approve |
| Repos | Stay split: `hackme-exchange` + `hackme-exchange-api` — not merged into HackMe hub |

## Must be green by 2026-09-10

| # | Gate | How | Status |
|---|------|-----|--------|
| G1 | Unit/UI suite | `npm test` | ✅ **480** (2026-08-15) |
| G2 | UI smoke | `npm run test:ui-smoke` | ✅ (covered in suite) |
| G3 | Production build | `npm run build` | ✅ paper via `prepare_d0_static.sh` |
| G4 | XSS / sanitize / redteam | `vitest` sanitize + stress_redteam + hardening + stateSanitize | ✅ |
| G5 | Paper/abuse/econ honest | `abuse_econ_latency` | ✅ |
| G6 | STATUS disclaimer visible | root `STATUS.md` + in-app PAPER badges | ✅ |
| G7 | Live mode blocked | `isLiveMode()` false | ✅ |
| G8 | Lab API (optional) | `go test ./...` + live custody e2e | ✅ 2026-08-15 · audit v3 |
| G9 | Mirror restore drill | hub ops | ✅ earlier Aug |
| G10 | Visual pass (human + script) | `node scripts/g10_visual_pass.mjs` desktop+mobile | ✅ 2026-08-15 · **P0=0 P1=0** · oracle live |
| G11 | Static publish dry-run | `scripts/prepare_d0_static.sh` → tarball; **no DNS** | ✅ 2026-08-15 (CSP no `:18443`, no fixture seed) |
| G12 | TG copy drafted (not posted) | `docs/TG_POST_DRAFT.md` | ✅ draft ready |
| G13 | PRE_PUBLIC API smoke | API `bash scripts/pre_public_dry_run.sh` | ✅ 2026-08-15 · public still **HOLD** |

## Explicitly NOT required for D0

- Public `exchange-api` / custody / withdraw  
- Postgres  
- New VPS  
- USDT/BTC real rails  
- Foreign CEX outreach  

## Commands

```bash
cd ~/Desktop/hackme-exchange-demo
npm test && npm run test:ui-smoke && npm run build
npx vitest run src/stress_redteam.test.ts src/sanitize.test.ts src/abuse_econ_latency.test.ts src/hardening.ui.test.ts
bash scripts/prepare_d0_static.sh

cd ~/Desktop/hackme-exchange-api
bash scripts/pre_public_dry_run.sh
```
