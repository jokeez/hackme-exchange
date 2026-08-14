# Exchange board (private) — matching / deposits / withdraw

Lightweight issue board until GitHub projects exist. Update status in place.

## Now (lab / paper → D0)

| ID | Item | Owner track | Status |
|----|------|-------------|--------|
| B1 | Paper SPA QA green + STATUS | demo | ✅ 2026-08-06 |
| B2 | Lab matching smoke (orders/cancel/fill/convert) | api+demo | ✅ 2026-08-06 |
| B3 | Soft-mid convert smoke size | demo script | ✅ fixed |
| B4 | D0 static tarball script | demo | 🔧 see `scripts/prepare_d0_static.sh` |
| B5 | Human visual pass desktop/mobile | demo | ⬜ before 10 Sep |
| B6 | Draft TG paper-only post (do not publish) | social | ⬜ |

## Next (after D0 → D1)

| ID | Item | Notes | Status |
|----|------|-------|--------|
| C1 | Postgres schema for ledger/orders/fills | replace lab SQLite for public | ⬜ |
| C2 | `exchange-api` on separate VPS behind TLS | PRE_PUBLIC P0 checklist | ⬜ |
| C3 | Deposit addresses HMC/SUP + watcher | caps + pause switches | ⬜ |
| C4 | Withdraw queue + caps + 2FA | default off on edge | ⬜ |
| C5 | Fee → treasury wallet runbook | already sketched in lab | ⬜ |
| C6 | OpenAPI freeze `/orders` `/convert` `/balances` | `openapi.yaml` exists (lab) | 🟡 lab only |
| C7 | Fresh DB — no lab fixture residue on edge | P0-13 | ⬜ |

## Later (D2+)

| ID | Item | Status |
|----|------|--------|
| D1 | USDT/BTC partner rails | ⬜ |
| D2 | Stop/OCO server-side | 501 by design today |
| D3 | Foreign PoW CEX outreach | after D1 KPI |

## Anti-goals

- Admin token on public edge  
- Hot wallet on mining hub  
- Merging SPA into HackMe monorepo  
- Promising Binance dates  
