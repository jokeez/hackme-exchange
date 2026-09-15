# Scripts (maintainers)

Build helpers, paper gate, and optional Playwright / lab smokes.

| Script | npm / usage |
|--------|-------------|
| `cf_chunk_assets.mjs` | `npm run build` (post-vite) |
| `generate_pwa_icons.py` | `npm run icons:gen` |
| `prepare_d0_static.sh` | `npm run d0:static` — paper dist gate |
| `full_audit.sh` | `npm run audit:full` |
| `g10_visual_pass.mjs` | `npm run test:e2e` |
| `mega_ui_audit.mjs` | `npm run test:e2e:full` |
| `lab-smoke.ts` | `npm run smoke:lab` — loopback `:18443` |
| `d1-smoke.ts` / `d1-local-dev.sh` | Staging helpers (contributors) |

**Playwright:** Vite on `:5199` (`npm run dev`) or set `EX_UI_BASE`.

**Live lab custody vitest:** skipped by default — `EX_LIVE_LAB=1 npm test`.

Evidence → `docs/.local/` (gitignored). Static output → `dist-d0/` (gitignored).

Day-to-day contributors only need `npm test` and `npm run build`. Production hosting is outside this repo.
