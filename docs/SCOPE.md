# Scope & boundaries

## Where work lives

| Location | What belongs here |
|----------|-------------------|
| **This repo** (SPA) | Spot / Convert / Account / Pool UI, adapters, tests |
| **Matching API** (private sibling) | Loopback lab matching — not on the public edge |
| **[hackme](https://github.com/jokeez/hackme)** hub | Node, pool, dashboard — Exchange is a **sidecar tab** (iframe), not merged product code |

**Do not merge** the TS SPA into the HackMe git tree. Hub may host `#exchange` iframe + `#wallet` deep links only.

---

## Soft-launch (public desk — GO)

- Spot / Convert / Account / Pool with optional **Desk Connect**
- Live matching book/orders via same-origin `/desk-api` (soft-launch caps)
- HMC/SUP deposit addresses + withdraw with per-user TOTP; ops completes withdraws
- Hub iframe embed (`?embed=hub`)
- Read-only oracle from public `hackme.tech` APIs
- Operator reference mids (**0.05** HMC · **0.25** SUP); pool GH is telemetry only

---

## Out of scope / still HOLD

| Item | Status |
|------|--------|
| Public matching (book/orders live) | **GO** (soft-launch caps) |
| HMC/SUP deposit + withdraw + TOTP | **GO** (ops-gated complete) |
| USDT auto hot-send / Didit KYT | **HOLD** — BSC watch + stub KYT **manual** is live |
| BTC hot custody | **HOLD** — paper stub only |
| Merging SPA into HackMe hub git | Sidecar only |
| Foreign CEX “listing” claims | Not this product |

### Hostmap (ops)

| Role | Host |
|------|------|
| Paper SPA / Caddy | `89.150.41.40` · `exchange.hackme.tech` |
| Same-origin desk proxy | `https://exchange.hackme.tech/desk-api/*` → loopback API (Strict cookies; SPA CSP `connect-src 'self'`) |
| Public desk API | `exchange-api.hackme.tech` (CF) for ops/probes — **not** in SPA CSP |
| Private C2 API (loopback) | **same** `89.150.41.40` — soft-launch trading ON |
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
| Paper / desk product | Live SPA + soft-launch matching |
| Matching / HMC·SUP custody | **GO** |
| USDT watch + manual KYT | **GO** (no Didit / no hot-send) |
| BTC hot custody | **HOLD** |
