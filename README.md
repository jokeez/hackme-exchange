# HackMe Exchange

Paper / private-lab **Spot · Convert · Account · Pool** terminal for the [HackMe](https://hackme.tech) ecosystem.

| | |
|--|--|
| **Status** | Private lab · localhost — **not** a public exchange |
| **Soft target** | **D0 Paper · 2026-09-15** — static UI on `exchange.hackme.tech` |
| **Go / no-go** | **2026-09-10** — see [`STATUS.md`](STATUS.md) |
| **Reference mids** | **0.05** USDT/HMC · **0.01** USDT/SUP (±0.35% paper drift) |

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

Wiring: [`docs/LAB_API.md`](docs/LAB_API.md)

---

## Modes

| Mode | Meaning |
|------|---------|
| **paper** (default) | localStorage wallet · operator reference mids — **not** real custody |
| **lab** | Loopback [exchange-api](https://github.com/jokeez/hackme-exchange-api) — still **not** public |
| **live** | **Blocked** until an explicit public go-live |

Never put admin tokens in `VITE_*` — Vite inlines them into the browser bundle.

---

## What you get

| Surface | Includes |
|---------|----------|
| **Spot** | Book, chart, market / limit / stop / OCO, VIP fees, pay-fees-in-HMC |
| **Convert** | Paper or lab seed mid · inventory-aware when API connected |
| **Account** | Balances, VIP, lab mint / bridge, withdraw **request** (complete = CLI) |
| **Pool** | Read-only oracle telemetry → [hackme.tech](https://hackme.tech) |
| **Hub embed** | `#exchange` iframe · paper chrome |

**Pricing (paper):** operator refs **0.05 / 0.01** with mild live drift; BTC crosses use `usdt / btcUsd` (Binance BTCUSDT when CSP allows, else fallback). Pool GH is **telemetry only** — it does not scale mid.

---

## QA (current)

```bash
npm test                              # unit / UI / security suites
node scripts/full_ui_ux_pass.mjs      # Spot · Convert · Account · Pool
node scripts/g10_visual_pass.mjs      # mobile / visual
node scripts/b_chart_manual_pass.mjs  # chart pairs / TF
bash scripts/prepare_d0_static.sh     # paper dist tarball (gitignored)
```

Sibling API: `go test ./...` · `bash scripts/pre_public_dry_run.sh` → public **HOLD**.

---

## Docs

| Doc | Purpose |
|-----|---------|
| [`STATUS.md`](STATUS.md) | Soft / live ladder · messaging |
| [`docs/README.md`](docs/README.md) | Full docs index |
| [`docs/D0_CHECKLIST.md`](docs/D0_CHECKLIST.md) | Sep 10 go/no-go |
| [`docs/SCOPE.md`](docs/SCOPE.md) | Boundaries vs HackMe hub |
| [`docs/LAB_API.md`](docs/LAB_API.md) | SPA ↔ loopback API |
| [`docs/ECONOMICS.md`](docs/ECONOMICS.md) | Fees · VIP · reference mids |
| [`docs/SECURITY.md`](docs/SECURITY.md) | SPA threat checklist |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup · PRs · secrets |

Canonical **API** security / hosting / pre-public gates:  
[hackme-exchange-api/docs](https://github.com/jokeez/hackme-exchange-api/tree/main/docs)

---

## License

Internal HackMe Network tooling — demo / private lab. Not a licensed exchange.
