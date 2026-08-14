# HackMe Exchange — Spot Pro Demo

Binance-style **Spot · Convert · Account · Pool** terminal for the HackMe ecosystem.

| | |
|--|--|
| **Status** | Private lab / localhost only — **not** a public exchange |
| **Soft target** | **D0 Paper · 2026-09-15** (`exchange.hackme.tech` static UI) |
| **Go / no-go** | **2026-09-10** — see [`STATUS.md`](STATUS.md) · [`docs/D0_CHECKLIST.md`](docs/D0_CHECKLIST.md) |

> **Own HMC market** (not a third-party listing claim):  
> **Now** — paper / private-lab Spot + Convert · **Soft** — static paper UI mid-September (**no** public matching API) · **Live deposits / foreign CEX** — only after custody + security gates.  
> No ROI promises. No fake “Tier-1 tomorrow.”

---

## Quick start

```bash
cd hackme-exchange-demo
cp .env.example .env   # optional local overrides
npm install
npm test               # unit / UI / abuse / custody e2e (skips if API down)
npm run build
npm run dev            # → http://127.0.0.1:5199
```

### Optional private lab API

```bash
# Terminal A — loopback matching (never public bind)
cd ../hackme-exchange-api && go run ./cmd/exchange-api
# → http://127.0.0.1:18443/health

# Terminal B — SPA with lab wiring
cd ../hackme-exchange-demo
# .env: VITE_LAB_API=1  VITE_EXCHANGE_API_ORIGIN=http://127.0.0.1:18443
npm run dev
# Account → Connect fixture → mint / Spot / Convert against lab ledger
```

---

## Modes

| Mode | Meaning |
|------|---------|
| **paper** (default) | localStorage wallet · oracle mids · **not** real custody |
| **lab** | Opt-in loopback `exchange-api` · real SQLite matching · still **not** public |
| **live** | **Blocked** in the SPA until an explicit public go-live |

Copy `.env.example` → `.env` (gitignored). **Never** put admin tokens in `VITE_*` — Vite would ship them to the browser.

---

## What you get

- **Spot** — book, chart, market/limit/stop/OCO, VIP fees, pay-fees-in-HMC  
- **Convert** — seed mid (lab) / paper mid · inventory-aware when API connected  
- **Account** — balances, VIP, lab mint/bridge, withdraw **request** (complete = CLI only)  
- **Pool** — read-only oracle telemetry · links to [hackme.tech](https://hackme.tech)  
- **Hub embed** — `#exchange` iframe · paper chrome  

---

## Project layout

```
src/           SPA (Spot / Convert / Account / Pool)
  adapters/    exchange-api · lab fixture · node wallet
  config/      integration modes (paper / lab / live-blocked)
docs/          D0 checklist · scope · economics · security pointers
scripts/       D0 static tarball helper
```

Canonical **API** threat model / hosting / pre-public gates live in sibling repo `hackme-exchange-api/docs/`.

---

## Docs map

| Doc | Purpose |
|-----|---------|
| [`STATUS.md`](STATUS.md) | Public / soft / live ladder |
| [`docs/D0_CHECKLIST.md`](docs/D0_CHECKLIST.md) | Sep 10 go/no-go gates |
| [`docs/SCOPE.md`](docs/SCOPE.md) | What belongs here vs HackMe hub |
| [`docs/LAB_API.md`](docs/LAB_API.md) | Wire SPA ↔ `:18443` |
| [`docs/ECONOMICS.md`](docs/ECONOMICS.md) | Fees · VIP · convert |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup · PRs · secrets |

---

## Isolation

- This folder is the **exchange SPA only**.  
- Main **HackMe** hub (pool / node / site) is a **separate** repo — do not merge.  
- Hub may iframe this app (`#exchange`); it must not ship lab API origins in production builds.

---

## License

Internal HackMe Network tooling — demo / private lab. Not a licensed exchange.
