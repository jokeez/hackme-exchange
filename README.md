# HackMe Exchange

Paper / private-lab **Spot · Convert · Account · Pool** terminal for the [HackMe](https://hackme.tech) ecosystem.

| | |
|--|--|
| **Status** | Private lab · localhost only — **not** a public exchange |
| **Soft target** | **D0 Paper · 2026-09-15** — static UI on `exchange.hackme.tech` |
| **Go / no-go** | **2026-09-10** — see [`STATUS.md`](STATUS.md) |

> Own HMC market — **not** a third-party listing claim.  
> Soft D0 = paper UI only (**no** public matching API). Live deposits only after custody gates.

---

## Ecosystem

| Project | Link |
|---------|------|
| **HackMe** (hub · pool · node) | [github.com/jokeez/hackme](https://github.com/jokeez/hackme) · [hackme.tech](https://hackme.tech) |
| **Exchange SPA** (this repo) | [github.com/jokeez/hackme-exchange](https://github.com/jokeez/hackme-exchange) |
| **Exchange API** (lab matching) | [github.com/jokeez/hackme-exchange-api](https://github.com/jokeez/hackme-exchange-api) |

Pool oracle & explorer live on the main site — this repo does **not** ship mining or custody.

---

## Quick start

```bash
cp .env.example .env   # optional
npm install
npm test
npm run build
npm run dev            # → http://127.0.0.1:5199
```

### Optional private lab API

```bash
# Terminal A
cd ../hackme-exchange-api && go run ./cmd/exchange-api
# → http://127.0.0.1:18443/health

# Terminal B — .env: VITE_LAB_API=1  VITE_EXCHANGE_API_ORIGIN=http://127.0.0.1:18443
npm run dev
```

Wiring details: [`docs/LAB_API.md`](docs/LAB_API.md)

---

## Modes

| Mode | Meaning |
|------|---------|
| **paper** (default) | localStorage wallet · pool-oracle mids — **not** real custody |
| **lab** | Loopback [exchange-api](https://github.com/jokeez/hackme-exchange-api) · still **not** public |
| **live** | **Blocked** until an explicit public go-live |

Never put admin tokens in `VITE_*` — Vite inlines them into the browser bundle.

---

## What you get

- **Spot** — book, chart, market / limit / stop / OCO, VIP fees, pay-fees-in-HMC  
- **Convert** — paper or lab seed mid · inventory-aware when API connected  
- **Account** — balances, VIP, lab mint / bridge, withdraw **request** (complete = CLI)  
- **Pool** — read-only oracle telemetry → [hackme.tech](https://hackme.tech)  
- **Hub embed** — `#exchange` iframe · paper chrome  

---

## Docs

| Doc | Purpose |
|-----|---------|
| [`STATUS.md`](STATUS.md) | Soft / live ladder · messaging |
| [`docs/README.md`](docs/README.md) | Full docs index |
| [`docs/D0_CHECKLIST.md`](docs/D0_CHECKLIST.md) | Sep 10 go/no-go |
| [`docs/SCOPE.md`](docs/SCOPE.md) | Boundaries vs HackMe hub |
| [`docs/LAB_API.md`](docs/LAB_API.md) | SPA ↔ loopback API |
| [`docs/ECONOMICS.md`](docs/ECONOMICS.md) | Fees · VIP · convert |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup · PRs · secrets |

Canonical **API** security / hosting / pre-public gates:  
[hackme-exchange-api/docs](https://github.com/jokeez/hackme-exchange-api/tree/main/docs)

---

## License

Internal HackMe Network tooling — demo / private lab. Not a licensed exchange.
