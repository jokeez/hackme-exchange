# Phase 2 backend readiness

> **STALE (kickoff inventory).** Current lab status: [`PHASE2_VERDICT.md`](PHASE2_VERDICT.md). Do not treat unchecked lists below as open Phase-2-lab work.  
> Inventory + gap analysis for starting **Phase 2** (`exchange.hackme.tech` + `exchange-api`).  
> Sibling work (UI polish, econ, security hardening of the demo) is out of scope here.  
> Last updated: 2026-07-23

---

## Current state (Phase 1)

| Area | Reality |
|------|---------|
| **Repo shape** | Single Vite SPA — **not** a monorepo. No `apps/`, no `packages/`, no `exchange-api` package. |
| **Runtime** | `npm run dev` → static SPA on `:5199`. All trade state in **browser `localStorage`**. |
| **Matching** | Client-side (`execution.ts` / `orders.ts`). Synthetic book (`book.ts`) + synthetic tape. |
| **Oracle** | **Real** read-only: `hackme.tech` pool coordinator + `/api/sup/economics` (dev proxy: `/hub-proxy`, `/pool-proxy`, plus `/pool` + `/api` for hub pages). |
| **Node** | **Real** read-only: `GET {VITE_NODE_ORIGIN}/api/wallet` → Sync HMC/SUP. No transfers from SPA. |
| **Live mode** | `VITE_INTEGRATION_MODE=live` is **hard-blocked** → runs as paper (`isLiveMode()` always `false`). |
| **Auth** | None (accepted for demo). |
| **Deploy** | Not public. No `exchange.hackme.tech` nginx/DNS. |

**Adapter boundary (stubs):**

| Module | Role today | Live gap |
|--------|------------|----------|
| `src/config/integration.ts` | Mode + origins | Live forced to paper |
| `src/adapters/settlement.ts` | Interface + hybrid node sync | No `settleTrade` / `withdraw`; live path returns demo stub |
| `src/adapters/nodeWallet.ts` | Node GET client | No exchange ledger client |
| `src/adapters/assets.ts` | Asset registry | USDT/BTC marked bridge/paper; XMR in `PLANNED_ASSETS` only |
| `src/store.ts` | Persist DemoState | Still localStorage — not API |
| `src/execution.ts` | Instant paper fills | Not wired to settlement adapter |

Plan docs (not implemented): `ARCHITECTURE.md`, `INTEGRATION.md`, `WALLET_ASSETS.md`, `SCOPE.md`, `SECURITY.md`.

---

## What “Phase 2 backend” means here

From repo docs (`ARCHITECTURE.md`, `INTEGRATION.md`, `SCOPE.md`, `README.md`):

1. **Static host** — build `dist/` → deploy as `exchange.hackme.tech`.
2. **New service `hackme-exchange-api`** — REST + WebSocket; authoritative accounts, ledger, order book (PostgreSQL + Redis sketched).
3. **Nginx** — SPA root + `location /api/` → loopback exchange-api (`:18443` in sketch).
4. **Live SPA mode** — `VITE_INTEGRATION_MODE=live`: server balances/orders; stop trusting client wallet.
5. **Bridge assets** — USDT/BTC leave paper demo (custodial / CEX deposit addresses); HMC/SUP deposits via chain watch + internal ledger.
6. **Auth** — session (JWT / httpOnly cookie); keys never in browser.

**Explicitly not Phase 2 (deferred):** XMR / monero-wallet-rpc (Phase 3), full on-chain trade settlement sweeps (Phase 3), `dashboard.html` USDT/BTC/XMR rows (Phase 4 / main HackMe), public marketing launch until custody+security ready.

---

## Gaps blocking Phase 2 (prioritized)

### P0 — must-fix before any real backend / live mode

| # | Gap | Evidence |
|---|-----|----------|
| 1 | **No `exchange-api` codebase** | Plans only; nothing to proxy or call |
| 2 | **No SPA↔API contract** | No OpenAPI/JSON schema for balances, orders, fills, deposits, withdraws, WS book/tape |
| 3 | **Settlement adapter incomplete** | `settleTrade` / `withdraw` undefined; `activeSettlement()` never selects a live impl |
| 4 | **Live mode permanently disabled** | `effectiveMode("live")` → paper; `isLiveMode()` hardcodes `false` |
| 5 | **Authoritative state is client-side** | Wallet/orders/trades/ledger in `localStorage` via `store.ts` |
| 6 | **No matching engine / real book** | `buildOrderBook` synthesizes ladder; tape marked `synthetic` |
| 7 | **No auth / session model** | Demo has zero login; prod needs JWT/cookie + CSRF/CORS allowlist |
| 8 | **USDT/BTC still paper** | Lab bridge-credit / starting wallet; no demo +USDT/+HMC top-up buttons |

### P1 — needed to ship Phase 2 deploy safely

| # | Gap | Notes |
|---|-----|-------|
| 9 | **Nginx + DNS + TLS** for `exchange.hackme.tech` | Sketch in `ARCHITECTURE.md`; not applied |
| 10 | **Deposit watchers** | HMC/SUP address assign + confirmations; USDT/BTC custodial policy |
| 11 | **Hot/cold wallet + withdrawal path** | Server-side `POST /api/tx/send` (never from SPA with admin token) |
| 12 | **Vite / SPA API base URL** | `VITE_EXCHANGE_ORIGIN` unused; no `/api` client; optional node proxy still undocumented in `vite.config.ts` |
| 13 | **localStorage migration** | Wipe or ignore demo keys when live; reject client balance overrides (`SECURITY.md`) |
| 14 | **Rate limits, idempotency, audit log** | Listed in `INTEGRATION.md` §6 / `SECURITY.md` |
| 15 | **Wire `execution.ts` → settlement** | Today fills bypass adapter entirely |

### P2 — deferred / after soft-public

| # | Item |
|---|------|
| 16 | XMR asset + pairs + price feed |
| 17 | Main-repo `dashboard.html` USDT/BTC/XMR rows + hash query parser |
| 18 | KYC/AML, PoR, HSM, WAF |
| 19 | Periodic on-chain sweep / full Phase 3 settlement matrix |

---

## Must-fix before backend (checklist)

Use this as the gate before writing production exchange-api code or flipping live:

- [ ] **Approve Phase 2** as a separate project (per `SCOPE.md`) — do not mix into main HackMe casually
- [ ] **Publish API contract** (OpenAPI or equivalent) covering at least:
  - Auth session
  - `GET` balances / ledger
  - Place/cancel orders + fill stream (WS)
  - Deposit address + status
  - Withdraw request + status
- [ ] **Implement `liveSettlement` adapter** implementing `SettlementAdapter` + feature-flag unblocking `isLiveMode()`
- [ ] **Replace synthetic book/tape** with API/WS feeds (keep demo synthetic behind `demo`/`paper` only)
- [ ] **Custody decision** for USDT/BTC (internal ledger vs partner CEX)
- [ ] **Env matrix** for public build: `VITE_INTEGRATION_MODE=live`, `VITE_EXCHANGE_ORIGIN`, loopback-only `VITE_NODE_ORIGIN`, **never** `VITE_HACKME_ADMIN_TOKEN` in public bundles
- [ ] **Security review** against `docs/SECURITY.md` production principles
- [ ] **Nginx sketch applied** + health checks for exchange-api

---

## Deferred (do not block Phase 2 kickoff design)

- Soft-public marketing / TG announce (operator window Aug–Sep 2026 or later)
- XMR / Phase 3 settlement
- Dashboard wallet tab expansion in main HackMe
- Demo UI polish, chart tools, fee-tier chrome (sibling agents)
- Economy/oracle formula changes (oracle already live read-only)

---

## Mock vs real APIs (quick map)

| Surface | Mode | Endpoint / mechanism |
|---------|------|----------------------|
| Pool stats / work stats | **Real** | `{pool}/api/pool/stats`, `{pool}/api/work/stats` |
| SUP economics | **Real** | `{hub}/api/sup/economics` |
| Node wallet sync | **Real (read)** | `{node}/api/wallet`, probe `{node}/api/status?lite=1` |
| Node transfers | **Not called** | Deep-link to dashboard only |
| Balances / orders / fills | **Fake** | `localStorage` + client matching |
| Order book / public tape | **Fake** | Deterministic synthetic generators |
| USDT/BTC deposit-withdraw UI | **Fake** | Instant paper ledger rows |
| exchange-api `/api/*` | **Missing** | Planned behind nginx |

---

## Dev smoke: Explorer Lite via hub-proxy

Hub `explorer-lite.html` uses root-absolute `/pool/...` and `/api/...` fetches. Vite must proxy those (not only `/hub-proxy`), or the panes show the exchange SPA `index.html`.

```bash
# Restart `npm run dev` after vite.config.ts changes, then:
curl -sS http://127.0.0.1:5199/hub-proxy/explorer-lite.html | head -n 5
# expect: HackMe Explorer Lite title

curl -sS http://127.0.0.1:5199/pool/coordinator/api/pool/stats | head -c 120
# expect: JSON with "pool" / "status" — NOT <!doctype html> exchange index

curl -sS http://127.0.0.1:5199/pool/coordinator/api/work/stats | head -c 120
# expect: JSON work stats
```

Browser: open `http://localhost:5199/hub-proxy/explorer-lite.html` — Pool Stats and Coordinator Work Stats should be JSON, not Vite HTML.

---

## Related paths

| Path | Use |
|------|-----|
| [`SCOPE.md`](SCOPE.md) | Isolation from main HackMe |
| [`ECONOMICS.md`](ECONOMICS.md) | Fees, spreads, HMC flows, econ GO/notes |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Target topology + nginx sketch |
| [`INTEGRATION.md`](INTEGRATION.md) | Deploy + live checklist |
| [`SECURITY.md`](SECURITY.md) | Prod principles + localStorage warning |
| [`WALLET_ASSETS.md`](WALLET_ASSETS.md) | USDT/BTC/XMR roadmap |
| `../AUDIT_HARDENING_VERDICT.md` | Demo hardening status (not backend) |
