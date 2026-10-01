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
| `live_smoke.mjs` | `npm run smoke:live` — production paper site + `/desk-api/health` HOLD |
| `desk-connect-smoke.ts` | `npm run smoke:desk` — Connect + book 503; `EX_MATCHING_GO=1` flips book expect to 200 |
| `deploy_paper_origin.sh` | rsync `dist-d0` → CF origin `89.150.41.40:/var/www/exchange` (not hub VPS) |
| `lab-smoke.ts` | `npm run smoke:lab` — loopback `:18443` |
| `d1-smoke.ts` / `d1-local-dev.sh` | Staging helpers |
| `node-watch-auth.ts` | Helper for API `d1_node_watch_e2e.sh` (auth + HMC/SUP deposit addrs, no lab mint) |

Matching GO ops checklist: [`docs/MATCHING_GO_CHECKLIST.md`](../docs/MATCHING_GO_CHECKLIST.md).

## Smoke matrix

| Command | Expect |
|---------|--------|
| `npm run smoke:live` | Public paper origin + CSP; `/desk-api/health` matching HOLD |
| `npm run smoke:desk` | Connect + book **503** (HOLD) |
| `EX_MATCHING_GO=1 npm run smoke:desk` | Book **200** only after explicit Matching GO |
| `npm run smoke:lab` | Loopback `:18443` only — never against public edge |

See also [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) · [`STATUS.md`](../STATUS.md).

**Playwright:** Vite on `:5199` (`npm run dev`) or set `EX_UI_BASE`.

**Live lab custody vitest:** skipped by default — `EX_LIVE_LAB=1 npm test`.

Evidence → `docs/.local/` (gitignored). Static output → `dist-d0/` (gitignored).

Day-to-day contributors only need `npm test` and `npm run build`. Production hosting is outside this repo.
