# Scope & boundaries

## Where work lives

| Location | What belongs here |
|----------|-------------------|
| **This repo** (SPA) | Spot / Convert / Account / Pool UI, adapters, tests |
| **Matching API** (private sibling) | Loopback lab matching — not on the public edge |
| **[hackme](https://github.com/jokeez/hackme)** hub | Node, pool, dashboard — Exchange is a **sidecar tab** (iframe), not merged product code |

**Do not merge** the TS SPA into the HackMe git tree. Hub may host `#exchange` iframe + `#wallet` deep links only.

---

## In scope (paper D0)

- Spot / Convert / Account / Pool on **paper** (default)
- Static paper UI on [exchange.hackme.tech](https://exchange.hackme.tech)
- Optional **lab** mode against loopback API for contributors
- Hub iframe embed (`?embed=hub`)
- Read-only oracle from public `hackme.tech` APIs
- Operator reference mids (**0.05** HMC · **0.25** SUP); pool GH is telemetry only

---

## Out of scope (public edge)

| Item | Status |
|------|--------|
| Public matching (book/orders live) | **HOLD** |
| Public desk hostname (health only) | Live under HOLD — `exchange-api.hackme.tech` |
| Real USDT / BTC custody in the browser | Never |
| Merging SPA into HackMe hub git | Sidecar only |
| Foreign CEX “listing” claims | Not this product’s paper launch |

### Hostmap (ops)

| Role | Host |
|------|------|
| Paper SPA / Caddy | `89.150.41.40` · `exchange.hackme.tech` |
| Public desk API HOLD | `exchange-api.hackme.tech` (CF) · `api.exchange.hackme.tech` fallback |
| Private C2 API (loopback) | **same** `89.150.41.40` — matching OFF |
| Mining hub / node | `132.243.112.100` — **not** exchange edge |

---

## Allowed touchpoints with main HackMe

- Consume: local node `GET http://127.0.0.1:8080/api/wallet` (optional), public pool/oracle APIs
- Hub: Exchange tab iframe + Wallet tab; SPA may `postMessage` `goto-tab: wallet`

---

## Visibility

| Layer | Status |
|-------|--------|
| This source repo | Public (AGPL) |
| Paper product | Live static SPA |
| Matching / custody | **HOLD** |
