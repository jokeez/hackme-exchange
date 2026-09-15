<div align="center">

<pre aria-label="HackMe Exchange ASCII">
██╗  ██╗ █████╗  █████╗ ██╗  ██╗███╗   ███╗███████╗    ███████╗██╗  ██╗
██║  ██║██╔══██╗██╔════╝██║ ██╔╝████╗ ████║██╔════╝    ██╔════╝╚██╗██╔╝
███████║███████║██║     █████╔╝ ██╔████╔██║█████╗      █████╗   ╚███╔╝
██╔══██║██╔══██║██║     ██╔═██╗ ██║╚██╔╝██║██╔══╝      ██╔══╝   ██╔██╗
██║  ██║██║  ██║╚██████╗██║  ██╗██║ ╚═╝ ██║███████╗    ███████╗██╔╝ ██╗
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝    ╚══════╝╚═╝  ╚═╝
</pre>

# HackMe Exchange

### Open-source paper Spot terminal for the HackMe ecosystem

**PAPER ONLY** — simulated balances in `localStorage`. Not a licensed exchange. Not financial advice. No real custody or public matching API.

<br/>

[![Paper site](https://img.shields.io/badge/paper-exchange.hackme.tech-00d1ff?style=for-the-badge)](https://exchange.hackme.tech)
[![Matching API](https://img.shields.io/badge/matching_API-HOLD-ff6b9d?style=for-the-badge)](STATUS.md)
[![License](https://img.shields.io/badge/license-AGPL--3.0-7fe7ff?style=for-the-badge&logo=gnu&logoColor=white)](LICENSE)
[![Mids](https://img.shields.io/badge/HMC_0.05_·_SUP_0.01-ffb020?style=for-the-badge)](docs/ECONOMICS.md)
[![Hub](https://img.shields.io/badge/hackme.tech-hub-ff6b9d?style=for-the-badge)](https://hackme.tech)

<br/>

**[🏠 Main HackMe](https://github.com/jokeez/hackme)** · **[Live paper](https://exchange.hackme.tech)** · **[STATUS](STATUS.md)** · **[Docs](docs/README.md)** · **[Economics](docs/ECONOMICS.md)** · **[Security](docs/SECURITY.md)**

</div>

---

## What this is

HackMe’s pool and chain live in the **[main HackMe repository](https://github.com/jokeez/hackme)**. This sidecar is the **spot desk UI**: charts, book, convert, paper wallet — so the network can show an own-market terminal without merging SPA code into the hub.

| Pillar | What you get |
|--------|----------------|
| **Spot** | Chart · book · market / limit / stop / OCO · VIP fees · pay-fees-in-HMC |
| **Convert** | Instant swap at mid (paper) |
| **Account** | Balances · VIP · paper portfolio |
| **Pool** | Read-only oracle telemetry from [hackme.tech](https://hackme.tech) |

> Own HMC market desk — **not** a third-party CEX listing claim.  
> Live site: [exchange.hackme.tech](https://exchange.hackme.tech) (static paper SPA).

---

## Modes

| Mode | Meaning |
|------|---------|
| **paper** (default) | localStorage wallet · shared reference mids — **not** real custody |
| **lab** | Optional loopback sibling API — contributor / private lab only |
| **live** | **Blocked** in this SPA until an explicit product go-live |

Never put admin tokens in `VITE_*` — Vite inlines them into the browser bundle.

---

## Pricing (paper)

| Pair / leg | Reference | Notes |
|------------|-----------|-------|
| **HMC/USDT** | **0.05** | Mild paper drift · **not** scaled by pool GH |
| **SUP/USDT** | **0.01** | Same |
| **HMC/SUP** | **5.0** | Cross = HMC ÷ SUP |
| **HMC/BTC · SUP/BTC** | `usdt / btcUsd` | Shared paper pin |

Canonical sheet: [`docs/ECONOMICS.md`](docs/ECONOMICS.md).

---

## Quick start

```bash
cp .env.example .env   # optional
npm install
npm test
npm run build
npm run dev            # → http://127.0.0.1:5199
```

### Optional local lab API (contributors)

Requires a checkout of the private sibling API next to this repo:

```bash
# Terminal A
cd ../hackme-exchange-api && go run ./cmd/exchange-api
# → http://127.0.0.1:18443/health

# Terminal B — .env: VITE_LAB_API=1  VITE_EXCHANGE_API_ORIGIN=http://127.0.0.1:18443
npm run dev
```

Wiring: [`docs/LAB_API.md`](docs/LAB_API.md)

---

## QA

| Gate | Command |
|------|---------|
| Unit + security | `npm test` |
| UI smoke | `npm run test:ui-smoke` |
| Visual (G10) | `npm run test:e2e` (needs Vite on `:5199`) |
| Live paper smoke | `npm run smoke:live` |
| Paper static build | `npm run d0:static` → gitignored `dist-d0/` |

Maintainer extras (`test:e2e:full`, `audit:full`, lab smokes): [`scripts/README.md`](scripts/README.md).

---

## Docs

| Doc | Purpose |
|-----|---------|
| [`STATUS.md`](STATUS.md) | Product status · HOLD on matching/custody |
| [`docs/README.md`](docs/README.md) | Docs index |
| [`docs/SCOPE.md`](docs/SCOPE.md) | Boundaries vs HackMe hub |
| [`docs/ECONOMICS.md`](docs/ECONOMICS.md) | Fees · VIP · reference mids |
| [`docs/SECURITY.md`](docs/SECURITY.md) | SPA threat checklist |
| [`docs/LAB_API.md`](docs/LAB_API.md) | Loopback API (contributors) |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup · PRs · secrets |

---

## Related

| Project | Link |
|---------|------|
| **HackMe Network** | [github.com/jokeez/hackme](https://github.com/jokeez/hackme) |
| **Paper site** | [exchange.hackme.tech](https://exchange.hackme.tech) |
| **Hub / pool** | [hackme.tech](https://hackme.tech) |

Matching / custody API remains a **private** sibling until its own public gates pass.

---

## License

[GNU Affero General Public License v3.0](LICENSE) — same family as [HackMe](https://github.com/jokeez/hackme).

Paper tooling only. **Not** a licensed exchange · **not** production custody.

<sub>Copyright © 2026 HackMe contributors · <a href="LICENSE">AGPL-3.0</a></sub>
