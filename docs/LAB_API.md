# Lab API wiring (SPA → loopback)

Private-lab only. Connect this SPA to [hackme-exchange-api](https://github.com/jokeez/hackme-exchange-api) on `127.0.0.1:18443`.

Canonical HTTP surface: [API LAB_API.md](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/LAB_API.md)  
Operator rules: [PRIVATE_LAB](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/PRIVATE_LAB.md)

## Enable lab mode

```bash
# .env (gitignored)
VITE_LAB_API=1
VITE_EXCHANGE_API_ORIGIN=http://127.0.0.1:18443
```

Or `VITE_INTEGRATION_MODE=lab`. Origin **must** be loopback — non-loopback is ignored.

```bash
# Terminal A
cd ../hackme-exchange-api && go run ./cmd/exchange-api

# Terminal B
npm run dev   # http://127.0.0.1:5199
```

## What the SPA uses

| Area | Module | Notes |
|------|--------|-------|
| Auth | `adapters/exchangeApi.ts` | Challenge → Ed25519 → cookie + CSRF |
| Fixture | `adapters/labFixture.ts` | Local demo key — **never** public |
| Matching | `adapters/labMatching.ts` | Place / cancel / sync + live book |
| Settlement | `adapters/settlement.ts` | `labApiSettlement` when lab origin set |
| Account | Account → Connect fixture | Mint / bridge / withdraw **request** |

Admin complete / fee sweep stay **CLI + `X-Admin-Token`** — the SPA never embeds admin tokens.

## Optional tools

| Script | Purpose |
|--------|---------|
| `scripts/lab-smoke.ts` | Lab smoke against `:18443` |
| `scripts/lab-mm-bot.ts` | Poll `POST /lab/mm/seed` (`EXCHANGE_MM_BOT_ONCE=1` for one-shot) |
| `scripts/prepare_d0_static.sh` | Paper D0 tarball (no lab wiring in dist) |
| `scripts/g10_visual_pass.mjs` | Desktop/mobile visual gate |

## Hard rules

- Paper is default; lab is opt-in.  
- `isLiveMode()` stays **false** until an explicit public go-live.  
- Do not ship `VITE_EXCHANGE_API_ORIGIN` in public D0 builds.  
- Pre-public gates: [API PRE_PUBLIC_CHECKLIST](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/PRE_PUBLIC_CHECKLIST.md)
