# HackMe Exchange — Status

**Updated:** 2026-08-15  
**Public:** **NO** — private lab / localhost only.  
**Soft-public target:** **D0 Paper · 2026-09-15** (`exchange.hackme.tech` static).  
**Go / no-go:** **2026-09-10**.

## Messaging (locked)

Own HMC market — **not** a third-party listing claim:

| Phase | What |
|-------|------|
| **Now** | Paper / private-lab Spot + Convert |
| **Soft** | Static paper UI ~mid-September — **no** public matching API |
| **Live deposits / foreign CEX** | Only after custody + security gates |

Pool: useful-PoW live → [https://hackme.tech/](https://hackme.tech/)  
No ROI promises. No fake “Tier-1 tomorrow.”

## Modes

| Mode | Meaning |
|------|---------|
| **paper** (default) | localStorage balances · oracle mids — **not** real custody |
| **lab** | Loopback `exchange-api` (`127.0.0.1:18443`) — real matching DB, still **not** public |
| **live** | **Blocked** in the SPA until an explicit public go-live |

## Locked decisions

| Topic | Decision |
|-------|----------|
| Subdomain before D0? | **No** — hub `#exchange` + `:5199` only |
| D0 | Static SPA + this STATUS — **no** public API/custody |
| D1 DB | **Postgres** (lab SQLite stays private) |
| Live mode | Blocked until explicit go-live |
| Repos | Split: `hackme-exchange` + `hackme-exchange-api` (private) |

## What this is NOT

- Not a licensed exchange · not financial advice  
- Not real USDT/BTC custody in the browser  
- Not `exchange.hackme.tech` until D0  
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

## QA snapshot (2026-08-15)

| Gate | Result |
|------|--------|
| `npm test` | **478** pass |
| `bash scripts/prepare_d0_static.sh` | **ok** — paper dist, CSP without loopback `:18443`, no lab fixture seed |
| G10 visual pass | **ok** — 2026-08-14 · P0=0 (re-run before 09-10 if UI churn) |
| D0 tarball (local only) | `hackme-exchange-d0-*.tar.gz` (gitignored) |
| API `go test ./...` | **ok** |
| Red team audit v3 (2026-08-15) | **H-OCO1 + M-TOTP-R closed** · FE harness green · public edge still **HOLD** |
| PRE_PUBLIC dry-run | **ok** loopback `PUBLIC_EDGE` — see API `docs/PRE_PUBLIC_EVIDENCE.md` |
| Public edge | **HOLD** |

## Roadmap ladder

| Gate | Date | Public |
|------|------|--------|
| **D0 Paper** | 2026-09-15 | static SPA, PAPER only |
| **D1 Live HMC/SUP** | 2026-11-01 | real HMC/SUP in/out + caps |
| **D2 Stables** | 2027-01-15 | USDT/BTC rails |
| **D3 Foreign CEX** | 2027-02+ | outreach *if* D1 KPI |

## Docs

- [`docs/D0_CHECKLIST.md`](docs/D0_CHECKLIST.md) — Sep 10 go/no-go  
- [`docs/PRE_PUBLIC_CHECKLIST.md`](docs/PRE_PUBLIC_CHECKLIST.md) — mirror; full detail in API repo  
- [`docs/SCOPE.md`](docs/SCOPE.md) — boundaries  
- [`docs/TG_POST_DRAFT.md`](docs/TG_POST_DRAFT.md) — draft only  
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup and PR notes  

## Contact / incidents

Private lab — HackMe ops channel. No public withdrawal support until D1.
