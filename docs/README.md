# Docs — HackMe Exchange (SPA)

Open-source Spot UI. Soft-launch matching + HMC/SUP custody are **GO**; USDT = BSC watch + stub KYT **manual**; BTC hot custody remains **HOLD** (no Didit / no auto hot-send).

## Ecosystem

| Project | Link |
|---------|------|
| HackMe hub | [github.com/jokeez/hackme](https://github.com/jokeez/hackme) · [hackme.tech](https://hackme.tech) |
| Desk SPA | [exchange.hackme.tech](https://exchange.hackme.tech) · [../README.md](../README.md) |
| Matching API | Private sibling [`hackme-exchange-api`](https://github.com/jokeez/hackme-exchange-api) · public via same-origin `/desk-api` |

> GitHub repo name: **`jokeez/hackme-exchange`**. Local checkouts are often named `hackme-exchange-demo`.

## Start here

| Doc | Purpose |
|-----|---------|
| [../README.md](../README.md) | Quick start · modes |
| [../STATUS.md](../STATUS.md) | Product status · matching/custody GO |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Setup · PRs · secrets |
| [../scripts/README.md](../scripts/README.md) | Maintainer QA scripts |

## Scope & product

| Doc | Purpose |
|-----|---------|
| [SCOPE.md](SCOPE.md) | Boundaries vs HackMe hub |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Topology · hostmap |
| [ECONOMICS.md](ECONOMICS.md) | Fees · VIP · reference mids |
| [SECURITY.md](SECURITY.md) | SPA threat checklist |
| [HUB_TAB.md](HUB_TAB.md) | Hub `#exchange` embed |
| [MATCHING_GO_CHECKLIST.md](MATCHING_GO_CHECKLIST.md) | Public matching GO gates · rollback |

## Contributors (loopback lab)

| Doc | Purpose |
|-----|---------|
| [LAB_API.md](LAB_API.md) | SPA ↔ loopback API |

**Rule:** Public edge ships the desk SPA + same-origin `/desk-api` soft-launch. Didit / USDT hot-send / BTC hot custody stay HOLD — see [MATCHING_GO_CHECKLIST.md](MATCHING_GO_CHECKLIST.md) and sibling API docs.

## UI polish notes

- Tickers / pairs / prices use `translate="no"` + `.notranslate` so browser translators do not rewrite `HMC/USDT`.
- Mobile layout: chart / trade / markets / orders panels + safe-area bottom nav.
- Desktop: quieter kbd-hint / announce chrome; trading surface stays primary.
