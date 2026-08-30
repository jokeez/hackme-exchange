<div align="center">

# HackMe Exchange — Status

**Updated:** 2026-08-31 · **Public:** NO · **D0 Paper:** 2026-09-15 · **Go/no-go:** 2026-09-10

[![Main HackMe](https://img.shields.io/badge/main_repo-jokeez%2Fhackme-00d1ff?style=for-the-badge&logo=github&logoColor=white)](https://github.com/jokeez/hackme)
[![SPA](https://img.shields.io/badge/SPA-hackme--exchange-7fe7ff?style=for-the-badge&logo=github&logoColor=white)](https://github.com/jokeez/hackme-exchange)
[![API](https://img.shields.io/badge/API-HOLD-ff6b9d?style=for-the-badge)](https://github.com/jokeez/hackme-exchange-api)

**[🏠 Main HackMe](https://github.com/jokeez/hackme)** · **[hackme.tech](https://hackme.tech)** · **[README](README.md)** · **[D0 checklist](docs/D0_CHECKLIST.md)**

</div>

---

**Public:** **NO** — private lab / localhost only.  
**Soft-public target:** **D0 Paper · 2026-09-15** (`exchange.hackme.tech` static).  
**Go / no-go:** **2026-09-10**.

## Ecosystem

| Project | Link |
|---------|------|
| **HackMe hub (main)** | [github.com/jokeez/hackme](https://github.com/jokeez/hackme) · [hackme.tech](https://hackme.tech) |
| Exchange SPA | [github.com/jokeez/hackme-exchange](https://github.com/jokeez/hackme-exchange) |
| Exchange API | [github.com/jokeez/hackme-exchange-api](https://github.com/jokeez/hackme-exchange-api) |

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
| HMC/BTC · SUP/BTC | `usdt / btcUsd` | Live BTCUSDT when available |

Lab MM soft mids match the refs (exact). See [`docs/ECONOMICS.md`](docs/ECONOMICS.md).

## Locked decisions

| Topic | Decision |
|-------|----------|
| Hub `#exchange` embed | Code → `exchange.hackme.tech` (deploy with **rc17**); lab override `:5199` |
| D0 | Static SPA + this STATUS — **no** public API/custody |
| D1 DB | **Postgres** (lab SQLite stays private) |
| D1 host | Separate **exchange-VPS** (not mining hub) |
| Live mode | Blocked until explicit go-live |
| Repos | Split: SPA + API (not merged into HackMe hub) |

## What this is NOT

- Not a licensed exchange · not financial advice  
- Not real USDT/BTC custody in the browser  
- Not **live** custody / matching on `exchange.hackme.tech` until post-D0 gates  
- Not a promise of foreign CEX listing  

## How to run (private)

```bash
# SPA
cd hackme-exchange && npm test && npm run build && npm run dev
# → http://127.0.0.1:5199

# Optional lab API
cd hackme-exchange-api && go test ./... && go run ./cmd/exchange-api
# → http://127.0.0.1:18443/health
```

## QA snapshot (2026-08-21)

| Gate | Result |
|------|--------|
| `npm test` | **544** pass |
| Full UI/UX · G10 · B-chart | **P0=0** |
| `bash scripts/prepare_d0_static.sh` | **ok** — paper dist, CSP without loopback `:18443` |
| API `go test ./...` | **ok** |
| PRE_PUBLIC dry-run | **ok** · public still **HOLD** |
| Public edge | **HOLD** |

## Roadmap

| Gate | Date | Public |
|------|------|--------|
| **D0 Paper** | 2026-09-15 | static SPA, PAPER only |
| **D1 Live HMC/SUP** | 2026-11-01 | real HMC/SUP in/out + caps |
| **D2 Stables** | 2027-01-15 | USDT/BTC rails |
| **D3 Foreign CEX** | 2027-02+ | outreach *if* D1 KPI |

## Docs

- [`docs/D0_CHECKLIST.md`](docs/D0_CHECKLIST.md) — Sep 10 go/no-go  
- [`docs/SCOPE.md`](docs/SCOPE.md) — boundaries  
- [`docs/ECONOMICS.md`](docs/ECONOMICS.md) — fees · reference mids  
- [API PRE_PUBLIC checklist](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/PRE_PUBLIC_CHECKLIST.md)  
- [`CONTRIBUTING.md`](CONTRIBUTING.md)

## Contact

Private lab — HackMe ops channel. No public withdrawal support until D1.
