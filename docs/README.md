# Docs — HackMe Exchange (SPA)

Paper / private-lab UI docs. Canonical **API** security & hosting live in the sibling API repo.

## Ecosystem

| Project | Link |
|---------|------|
| HackMe hub | [github.com/jokeez/hackme](https://github.com/jokeez/hackme) · [hackme.tech](https://hackme.tech) |
| Paper SPA (D0) | [exchange.hackme.tech](https://exchange.hackme.tech) · source: [../README.md](../README.md) |
| Exchange API | [github.com/jokeez/hackme-exchange-api](https://github.com/jokeez/hackme-exchange-api) · [API docs](https://github.com/jokeez/hackme-exchange-api/tree/main/docs) |

## Start here

| Doc | Purpose |
|-----|---------|
| [../README.md](../README.md) | Quick start · modes · QA |
| [../STATUS.md](../STATUS.md) | Soft / live ladder · messaging · reference mids |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Setup · PRs · secrets |
| [../scripts/README.md](../scripts/README.md) | QA / release scripts |

## Launch & scope

| Doc | Purpose |
|-----|---------|
| [D0_CHECKLIST.md](D0_CHECKLIST.md) | Sep 10 go/no-go gates |
| [SCOPE.md](SCOPE.md) | Boundaries vs HackMe hub |
| [BOARD.md](BOARD.md) | Matching / deposits board |

## Product & economics

| Doc | Purpose |
|-----|---------|
| [ECONOMICS.md](ECONOMICS.md) | Fees · VIP · **0.05 / 0.01** reference mids |
| [WALLET_ASSETS.md](WALLET_ASSETS.md) | Asset registry notes |
| [HUB_TAB.md](HUB_TAB.md) | Hub `#exchange` embed |

## Engineering

| Doc | Purpose |
|-----|---------|
| [INTEGRATION.md](INTEGRATION.md) | Origins · proxies · architecture |
| [LAB_API.md](LAB_API.md) | SPA ↔ loopback API |
| [SECURITY.md](SECURITY.md) | SPA threat checklist |

## API docs (canonical)

| Topic | Link |
|-------|------|
| Pre-public P0 | [PRE_PUBLIC_CHECKLIST](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/PRE_PUBLIC_CHECKLIST.md) |
| Threat model | [THREAT_MODEL](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/THREAT_MODEL.md) |
| Hosting / VPS | [HOSTING](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/HOSTING.md) |
| Private lab ops | [PRIVATE_LAB](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/PRIVATE_LAB.md) |
| Withdrawals | [WITHDRAWALS](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/WITHDRAWALS.md) |
| Custody fees | [CUSTODY_FEES](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/CUSTODY_FEES.md) |
| Stop / OCO | [STOP_OCO_DESIGN](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/STOP_OCO_DESIGN.md) |

**Rule:** Soft D0 ships **static paper UI**. Public matching / custody is a later gate.
