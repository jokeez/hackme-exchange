# Lab API wiring (SPA → loopback)

**Optional** contributor path. Connect this SPA to a local matching API on `127.0.0.1:18443` (private sibling repo). Paper mode needs **no** API.

## Enable lab mode

```bash
# .env (gitignored)
VITE_LAB_API=1
VITE_EXCHANGE_API_ORIGIN=http://127.0.0.1:18443
```

Or `VITE_INTEGRATION_MODE=staging` / `lab`. Origin **must** be loopback — non-loopback is ignored.

```bash
# D1 local stack (Postgres + API)
cd ../hackme-exchange-api && bash scripts/d1_local_up.sh

# SPA staging
npm run dev:d1   # http://127.0.0.1:5199 → proxied API
```

## What the SPA uses

| Area | Module | Notes |
|------|--------|-------|
| Auth | `adapters/exchangeApi.ts` | Challenge → Ed25519 → cookie + CSRF |
| Reconnect | `adapters/labSessionRestore.ts` | `GET /auth/session` before fixture re-sign |
| Session guard | `adapters/labSession.ts` | Stale CSRF detect + periodic sync |
| Fixture | `adapters/labFixture.ts` | Local demo key — **never** public |
| Matching | `adapters/labMatching.ts` | Place / cancel / sync + live book |
| Market stream | `adapters/marketStream.ts` | WS when `health.streams.*`, else poll |
| Settlement | `adapters/settlement.ts` | `labApiSettlement` when lab origin set |
| Account | Account → Connect fixture | Mint / bridge / withdraw **request** |

Admin complete / fee sweep stay **CLI + `X-Admin-Token`** — the SPA never embeds admin tokens.

## Optional tools

| Script | Purpose |
|--------|---------|
| `scripts/lab-smoke.ts` | Lab smoke against `:18443` (`npm run smoke:lab`) |
| `scripts/d1-smoke.ts` | D1 staging smoke (`npm run smoke:d1`) |
| `scripts/prepare_d0_static.sh` | Paper D0 tarball (`npm run d0:static`) |
| `scripts/g10_visual_pass.mjs` | Visual gate (`npm run test:e2e`) |

## Hard rules

- Paper is default; lab is opt-in.  
- `isLiveMode()` stays **false** until an explicit public go-live.  
- Do not ship `VITE_EXCHANGE_API_ORIGIN` in public D0 builds.  
- Pre-public gates: [API PRE_PUBLIC_CHECKLIST](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/PRE_PUBLIC_CHECKLIST.md)
