# D0 Paper — go/no-go checklist

**Target soft-launch:** 2026-09-15 (`exchange.hackme.tech` static, PAPER only)  
**Decision gate:** 2026-09-10  
**If red:** slip D0 → **2026-10-15**

Related: [STATUS.md](../STATUS.md) · [HackMe hub](https://github.com/jokeez/hackme) · [exchange-api](https://github.com/jokeez/hackme-exchange-api)

## Locked decisions

| Topic | Decision |
|-------|----------|
| Subdomain now? | **NO** until D0 week — localhost / hub `#exchange` only |
| D0 content | Static SPA from `dist/` + `STATUS.md` — **no** exchange-api on public edge |
| Live mode | Remains **blocked** in SPA |
| DB for D1 | **Postgres** (lab SQLite stays private) |
| VPS for D0 | **Not required** |
| VPS for D1 | **Required** — separate from mining hub |
| Repos | Stay split: SPA + API — not merged into HackMe hub |

## Must be green by 2026-09-10

| # | Gate | How | Status |
|---|------|-----|--------|
| G1 | Unit / UI suite | `npm test` | ✅ **486** (2026-08-15) |
| G2 | UI smoke | `npm run test:ui-smoke` | ✅ |
| G3 | Production build | `npm run build` / `prepare_d0_static.sh` | ✅ |
| G4 | XSS / sanitize / redteam | vitest sanitize + stress_redteam | ✅ |
| G5 | Paper / abuse / econ | `abuse_econ_latency` | ✅ |
| G6 | STATUS disclaimer | root `STATUS.md` + in-app PAPER badges | ✅ |
| G7 | Live mode blocked | `isLiveMode()` false | ✅ |
| G8 | Lab API (optional) | `go test ./...` + custody e2e | ✅ |
| G9 | Mirror restore drill | hub ops | ✅ |
| G10 | Visual pass | `node scripts/g10_visual_pass.mjs` | ✅ P0=0 P1=0 |
| G11 | Static publish dry-run | `scripts/prepare_d0_static.sh` · **no DNS** | ✅ |
| G12 | Comms draft | ops channel (not in repo) | ✅ |
| G13 | PRE_PUBLIC API smoke | API `bash scripts/pre_public_dry_run.sh` | ✅ · **HOLD** |

## Explicitly NOT required for D0

- Public `exchange-api` / custody / withdraw  
- Postgres · new VPS · real USDT/BTC · foreign CEX outreach  

## Commands

```bash
# SPA
npm test && npm run test:ui-smoke && npm run build
bash scripts/prepare_d0_static.sh

# API (sibling)
cd ../hackme-exchange-api
bash scripts/pre_public_dry_run.sh   # → docs/.local/ (gitignored)
```
