<div align="center">

# HackMe Exchange — Status

**Updated:** 2026-09-14 · **Public:** NO · **D0 Paper:** 2026-09-15 · **Go/no-go:** **GO** (gates green 2026-09-14)

[![Main HackMe](https://img.shields.io/badge/main_repo-jokeez%2Fhackme-00d1ff?style=for-the-badge&logo=github&logoColor=white)](https://github.com/jokeez/hackme)
[![Paper site](https://img.shields.io/badge/paper-exchange.hackme.tech-7fe7ff?style=for-the-badge)](https://exchange.hackme.tech)
[![API](https://img.shields.io/badge/public_API-HOLD-ff6b9d?style=for-the-badge)](https://github.com/jokeez/hackme-exchange-api)

**[🏠 Main HackMe](https://github.com/jokeez/hackme)** · **[hackme.tech](https://hackme.tech)** · **[README](README.md)** · **[D0 checklist](docs/D0_CHECKLIST.md)**

</div>

---

**Public:** **NO** — paper / private lab only until explicit go-live gates.  
**Soft-public target:** **D0 Paper · 2026-09-15** — static SPA on `exchange.hackme.tech` (no public matching API).  
**Hub iframe:** code points at paper host — **deploy with HackMe rc17** (no early hub restart).

## Ecosystem

| Project | Link |
|---------|------|
| **HackMe hub** | [github.com/jokeez/hackme](https://github.com/jokeez/hackme) · [hackme.tech](https://hackme.tech) |
| **Paper SPA** | [exchange.hackme.tech](https://exchange.hackme.tech) · source in this repo |
| **Exchange API** | [github.com/jokeez/hackme-exchange-api](https://github.com/jokeez/hackme-exchange-api) (private lab · **HOLD** public) |

## Messaging (locked)

Own HMC market — **not** a third-party listing claim:

| Phase | What |
|-------|------|
| **Now** | Paper / private-lab Spot + Convert |
| **Soft (D0)** | Static paper UI ~mid-September — **no** public matching API |
| **Live deposits / foreign CEX** | Only after custody + security gates |

Pool: useful-PoW live → [hackme.tech](https://hackme.tech/)  
No ROI promises. No fake “Tier-1 tomorrow.”

## Modes

| Mode | Meaning |
|------|---------|
| **paper** (default) | localStorage balances · reference mids — **not** real custody |
| **lab** | Loopback `exchange-api` (`127.0.0.1:18443`) — still **not** public |
| **live** | **Blocked** until an explicit public go-live |

## Pricing (paper / soft)

| Asset | Operator reference | Notes |
|-------|--------------------|-------|
| HMC/USDT | **0.05** | Mild ±0.35% paper drift; **not** scaled by pool GH |
| SUP/USDT | **0.01** | Same |
| HMC/SUP | **5.0** | Cross = HMC÷SUP |
| HMC/BTC · SUP/BTC | `usdt / DEFAULT_BTC_USD` | Shared paper pin (no Binance fork across devices) |

Lab MM soft mids match the refs (exact). See [`docs/ECONOMICS.md`](docs/ECONOMICS.md).

## Locked decisions

| Topic | Decision |
|-------|----------|
| Hub `#exchange` embed | `exchange.hackme.tech` — **rc17** deploy + hub restart |
| D0 | Static SPA + this STATUS — **no** public API/custody |
| D1 DB | **Postgres** (lab SQLite stays private) |
| D1 host | Separate **exchange-VPS** (not mining hub) |
| Live mode | Blocked until explicit go-live |
| Repos | Split: SPA + API (not merged into HackMe hub) |

## What this is NOT

- Not a licensed exchange · not financial advice  
- Not real USDT/BTC custody in the browser  
- Not live matching / custody on `exchange.hackme.tech` until post-D0 gates  
- Not a promise of foreign CEX listing  

## QA snapshot (2026-09-14)

| Gate | Result |
|------|--------|
| `npm test` | **812** pass (live lab custody opt-in via `EX_LIVE_LAB=1`) |
| `npm run test:ui-smoke` | **46** pass |
| `npm run test:e2e` (G10) | **P0=0 P1=0** |
| `npm run test:e2e:full` (mega) | **P0=0 P1=0 P2=0** |
| `npm run d0:static` | **ok** — paper dist, `frame-ancestors` hackme.tech |
| API `go test ./...` | **ok** |
| Public matching / custody | **HOLD** |

Independent audit 2026-09-14: stop-market ceiling, OCO fill-fail cancel group, amend excludeId, convert fee buffer, off-spot alerts, dust freeBalance, tour/oracle a11y.

Setup: [README.md](README.md) · Scripts: [scripts/README.md](scripts/README.md)

## Roadmap

| Gate | Date | Public |
|------|------|--------|
| **D0 Paper** | 2026-09-15 | static SPA, PAPER only |
| **rc17 hub cut** | with D0 | hub iframe + SUP nginx |
| **D1 Live HMC/SUP** | 2026-11-01 | real HMC/SUP in/out + caps |
| **D2 Stables** | 2027-01-15 | USDT/BTC rails |
| **D3 Foreign CEX** | 2027-02+ | outreach *if* D1 KPI |

## Docs

- [`docs/README.md`](docs/README.md) — index  
- [`docs/D0_CHECKLIST.md`](docs/D0_CHECKLIST.md) — Sep 10 go/no-go  
- [`docs/SCOPE.md`](docs/SCOPE.md) · [`docs/ECONOMICS.md`](docs/ECONOMICS.md)  
- [API PRE_PUBLIC checklist](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/PRE_PUBLIC_CHECKLIST.md)  

## Contact

Private lab — HackMe ops channel. No public withdrawal support until D1.
