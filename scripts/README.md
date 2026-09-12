# Scripts

Nine scripts — build, D0 gate, API smoke, and two Playwright tiers (G10 + mega).

| Script | npm / usage |
|--------|-------------|
| `cf_chunk_assets.mjs` | `npm run build` (post-vite chunking) |
| `generate_pwa_icons.py` | `npm run icons:gen` |
| `prepare_d0_static.sh` | `npm run d0:static` |
| `full_audit.sh` | `npm run audit:full` |
| `lab-smoke.ts` | `npm run smoke:lab` — loopback API `:18443` |
| `d1-smoke.ts` | `npm run smoke:d1` — Postgres D1 stack |
| `d1-local-dev.sh` | `npm run dev:d1` |
| `g10_visual_pass.mjs` | `npm run test:e2e` — desktop + mobile visual gate |
| `mega_ui_audit.mjs` | `npm run test:e2e:full` — deep Playwright audit (pre-release) |

**Prereq for Playwright:** Vite on `:5199` (`npm run dev` or `npm run preview -- --port 5199`) or set `EX_UI_BASE`.

**Live lab custody vitest:** skipped by default. Opt-in with `EX_LIVE_LAB=1 npm test`.

Evidence from audits → `docs/.local/` (gitignored). Static output → `dist-d0/` (gitignored).

Deploy to `exchange.hackme.tech` is **manual ops at rc17/D0** — not a script in this repo.
