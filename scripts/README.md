# Scripts

Local QA and release helpers. **No script here deploys automatically** — ops runs deploy manually at D0/rc17.

| Script | Purpose |
|--------|---------|
| `prepare_d0_static.sh` | **D0 gate** — `npm test`, paper build, `dist-d0/`, tarball, CSP + fixture guards |
| `full_audit.sh` | Full local audit (vitest + security subset + D0 build + optional D1 smoke) |
| `run_all_e2e.sh` | Preview + vitest + UI passes (viewport, UX, chart, G10, convert, mega audit) |
| `lab-smoke.ts` | Live smoke vs loopback API `:18443` (`npm run smoke:lab`) |
| `d1-smoke.ts` | D1 Postgres stack smoke (`npm run smoke:d1`) |
| `d1-local-dev.sh` | Start SPA in staging mode (`npm run dev:d1`) |
| `lab-mm-bot.ts` | Optional MM refresh bot for private lab |
| `smoke_layout_hub.mjs` | Playwright hub embed layout (needs `:8080` + `:5199`) |
| `g10_visual_pass.mjs` | G10 visual regression gate |
| `full_ui_ux_pass.mjs` | Full UI/UX pass |
| `b_chart_manual_pass.mjs` | Chart pair smoke |
| `convert_account_pass.mjs` | Convert + account flows |
| `multi_viewport_pass.mjs` | Responsive viewport pass |
| `mega_ui_audit.mjs` | Mega UI audit |
| `cf_chunk_assets.mjs` | Post-build asset chunking (called by `npm run build`) |
| `generate_pwa_icons.py` | PWA icon generation (`npm run icons:gen`) |
| `deploy_d0_vps.sh` | **HOLD** — manual rsync to exchange VPS (rc17/D0 window only) |

Evidence from audits lands in `docs/.local/` (gitignored).
