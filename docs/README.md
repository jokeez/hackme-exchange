# Docs — HackMe Exchange (SPA)

Paper / private-lab UI docs. Canonical **API** security & hosting live in the sibling API repo.

## Ecosystem

| Project | Link |
|---------|------|
| HackMe hub | [github.com/jokeez/hackme](https://github.com/jokeez/hackme) · [hackme.tech](https://hackme.tech) |
| This SPA | [github.com/jokeez/hackme-exchange](https://github.com/jokeez/hackme-exchange) |
| Exchange API | [github.com/jokeez/hackme-exchange-api](https://github.com/jokeez/hackme-exchange-api) · [API docs](https://github.com/jokeez/hackme-exchange-api/tree/main/docs) |

## SPA docs

| Doc | Purpose |
|-----|---------|
| [../STATUS.md](../STATUS.md) | Soft / live ladder · messaging |
| [../README.md](../README.md) | Quick start |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Setup · PRs |
| [D0_CHECKLIST.md](D0_CHECKLIST.md) | Sep 10 go/no-go |
| [SCOPE.md](SCOPE.md) | Boundaries vs HackMe hub |
| [LAB_API.md](LAB_API.md) | SPA ↔ loopback API |
| [ECONOMICS.md](ECONOMICS.md) | Fees · VIP · convert |
| [ARCHITECTURE.md](ARCHITECTURE.md) | SPA structure |
| [INTEGRATION.md](INTEGRATION.md) | Origins · proxies · modes |
| [BOARD.md](BOARD.md) | Matching / deposits board |
| [HUB_TAB.md](HUB_TAB.md) | Hub `#exchange` embed |
| [WALLET_ASSETS.md](WALLET_ASSETS.md) | Asset registry notes |
| [SECURITY.md](SECURITY.md) | SPA checklist |

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
