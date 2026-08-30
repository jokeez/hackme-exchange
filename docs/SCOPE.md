# Scope & boundaries

## Where work lives

| Location | What belongs here |
|----------|-------------------|
| **[hackme-exchange](https://github.com/jokeez/hackme-exchange)** (this SPA) | Spot / Convert / Account / Pool UI, adapters, tests |
| **[hackme-exchange-api](https://github.com/jokeez/hackme-exchange-api)** | Private loopback matching API |
| **[hackme](https://github.com/jokeez/hackme)** hub | Node, pool, dashboard — Exchange is a **sidecar tab** (iframe), not merged product code |

**Do not merge** the TS SPA into the HackMe git tree. Hub may host `#exchange` iframe + `#wallet` deep links only.

---

## In scope now (private lab)

- Spot / Convert / Account / Pool on **paper** or **private lab** sessions
- Soft D0 = **static paper UI** only — no public `exchange-api`
- Lab custody: mint / bridge / withdraw **request** (admin complete = CLI — no SPA admin token)
- Hub iframe embed (`?embed=hub`) — default `exchange.hackme.tech` (hub code in rc17); loopback `:5199` via `localStorage` override
- Read-only oracle from public `hackme.tech` APIs  
- Operator reference mids (**0.05** HMC · **0.01** SUP); pool GH is telemetry only

---

## Out of scope

| Item | Status |
|------|--------|
| Public bind / public matching API | ❌ HOLD until pre-public checklist |
| Real USDT custody in the browser | ❌ Never |
| Merging SPA into HackMe hub git | ❌ Sidecar only |
| Foreign CEX “listing” claims | ❌ Not this product’s soft launch |

---

## Allowed touchpoints with main HackMe

- Consume: `GET http://127.0.0.1:8080/api/wallet`, public pool/oracle APIs
- Hub: Exchange tab iframe + Wallet tab; SPA may `postMessage` `goto-tab: wallet`
- Rebuild desktop embed after `dashboard.html` Exchange chrome changes

---

## Public launch window

**Not public yet.** Private lab / QA only — GO private lab · HOLD public.
