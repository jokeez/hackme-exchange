# Exchange board (private) — matching / deposits / withdraw

Lightweight issue board until GitHub projects exist. Update status in place.

## Now (D0 paper — freeze)

| ID | Item | Owner track | Status |
|----|------|-------------|--------|
| B1 | Paper SPA QA green + STATUS | demo | ✅ 808 tests · G10 P0=0 |
| B2 | Lab matching smoke (orders/cancel/fill/convert) | api+demo | ✅ |
| B3 | Soft-mid convert smoke size | demo script | ✅ mid **0.05** |
| B4 | D0 static tarball script | demo | ✅ `npm run d0:static` |
| B5 | Human visual pass desktop/mobile | demo | ✅ G10 / full UI · P0=0 |
| B6 | Draft TG paper-only post (do not publish) | social | ⬜ |
| B7 | Reference mids 0.05 / 0.01 · no GH price scale | demo+api | ✅ |
| B8 | WS market stream + session reconnect | api+demo | ✅ |

## Next (D1 staging — local first)

| ID | Item | Notes | Status |
|----|------|-------|--------|
| C1 | Postgres schema for ledger/orders/fills | `d1_local_up.sh` | ✅ local |
| C2 | `exchange-api` on separate VPS behind TLS | PRE_PUBLIC P0 | ⬜ deferred |
| C3 | HMC/SUP deposit watchers | node-watch + sup activity | 🟢 |
| C4 | Withdraw queue + caps + 2FA | lab stub + per-user TOTP | 🟢 |
| C5 | Fee → treasury wallet runbook | lab fee wallet | ✅ |
| C6 | OpenAPI freeze | `/auth/session`, `/ws/market` | ✅ lab |
| C7 | Fresh DB — no lab fixture residue on edge | P0-13 | ⬜ |

## Later (D2+)

| ID | Item | Status |
|----|------|--------|
| D1 | USDT/BTC partner rails | ⬜ |
| D2 | Foreign PoW CEX outreach | after D1 KPI |

## Anti-goals

- Admin token on public edge  
- Hot wallet on mining hub  
- Merging SPA into HackMe monorepo  
- Promising Binance dates  
