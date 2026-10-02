# Scripts (maintainers)

Build helpers, paper gate, and optional Playwright / lab smokes.

| Script | npm / usage |
|--------|-------------|
| `cf_chunk_assets.mjs` | `npm run build` (post-vite) |
| `generate_pwa_icons.py` | `npm run icons:gen` |
| `prepare_d0_static.sh` / `build_paper.sh` | `npm run d0:static` / `npm run build` |
| `full_audit.sh` | `npm run audit:full` |
| `g10_visual_pass.mjs` | `npm run test:e2e` |
| `mega_ui_audit.mjs` | `npm run test:e2e:full` |
| `live_smoke.mjs` | `npm run smoke:live` — production desk site + `/desk-api/health` soft-launch |
| `desk-connect-smoke.ts` | `npm run smoke:desk` — Connect + book; `EX_MATCHING_GO=1` expects book 200 |
| `matching_go_security_probe.ts` | `npm run smoke:matching-sec` — CSRF/CORS/cookies/admin/metrics matrix |
| `matching_go_acceptance_smoke.ts` | `npm run smoke:matching-go` — place/cancel; `EX_MATCHING_GO=1 EX_CUSTODY_GO=1` for public soft-launch |
| `deploy_paper_origin.sh` | rsync `dist-d0` → CF origin `89.150.41.40:/var/www/exchange` (not hub VPS) |
| `lab-smoke.ts` | `npm run smoke:lab` — loopback `:18443` |
| `d1-smoke.ts` / `d1-local-dev.sh` | Staging helpers |
| `node-watch-auth.ts` | Helper for API `d1_node_watch_e2e.sh` (auth + HMC/SUP deposit addrs, no lab mint) |

Matching GO ops checklist: [`docs/MATCHING_GO_CHECKLIST.md`](../docs/MATCHING_GO_CHECKLIST.md).

## Smoke matrix

| Command | Expect |
|---------|--------|
| `npm run smoke:live` | Public desk origin + CSP; `/desk-api/health` matching **ok** (soft-launch) |
| `EX_MATCHING_GO=1 EX_CUSTODY_GO=1 npm run smoke:desk` | Connect + book **200** + custody paths |
| `npm run smoke:matching-sec` | Security matrix (CSRF/CORS/cookies/admin) |
| `EX_MATCHING_GO=1 EX_CUSTODY_GO=1 npm run smoke:matching-go` | Soft-launch place/cancel acceptance |
| `npm run smoke:lab` | Loopback `:18443` only — never against public edge without flags |

See also [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) · [`STATUS.md`](../STATUS.md).

**Playwright:** Vite on `:5199` (`npm run dev`) or set `EX_UI_BASE`.

**Live lab custody vitest:** skipped by default — `EX_LIVE_LAB=1 npm test`.

Evidence → `docs/.local/` (gitignored). Static output → `dist-d0/` (gitignored).

Day-to-day contributors only need `npm test` and `npm run build`. Production hosting is outside this repo.
