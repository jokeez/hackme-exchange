# Integration Guide — Site, Wallet, API

> Paper SPA at [exchange.hackme.tech](https://exchange.hackme.tech/) · private lab API on loopback only.  
> Hub embed: [`HUB_TAB.md`](HUB_TAB.md). Boundaries: [`SCOPE.md`](SCOPE.md).

## Current architecture

```
exchange.hackme.tech (static SPA, paper default)
        │
        ├─► hackme.tech — pool oracle, hub iframe
        ├─► hackme-node :8080 — optional HMC/SUP wallet read
        └─► exchange-api :18443 — lab/staging only (127.0.0.1)
              ├─ Postgres or SQLite ledger
              ├─ in-memory matching + WS /ws/market
              └─ session JWT + CSRF (GET /auth/session reconnect)
```

**Public edge:** no matching API, no custody. PRE_PUBLIC checklist gates any bind.

## 1. `exchange.hackme.tech` (D0 static — live)

### What to deploy

- Run `npm run d0:static` → `dist-d0/` + tarball (see `scripts/prepare_d0_static.sh`)
- Separate subdomain keeps main site lightweight and allows independent releases
- **Deploy** is manual ops at rc17/D0 (rsync `dist-d0/` to mirror) — not automated here

### Nginx sketch

- Static root: contents of `dist-d0/` (paper build)
- No public `/api` proxy until PRE_PUBLIC green
- TLS on `exchange.hackme.tech` (separate from hub mining stack)

### Environment at build time

Copy `.env.example` → `.env.local`:

```env
VITE_INTEGRATION_MODE=paper
VITE_EXCHANGE_ORIGIN=https://exchange.hackme.tech
VITE_HUB_ORIGIN=https://hackme.tech
VITE_NODE_ORIGIN=http://127.0.0.1:8080
```

| Env | Local QA | Public later |
|-----|----------|--------------|
| `VITE_NODE_ORIGIN` | `127.0.0.1:8080` | Keep loopback in client (user’s node). Admin token stripped unless loopback. |
| `VITE_HUB_ORIGIN` / pool | `https://hackme.tech` | Same; soft-fail offline → fallback mids |
| `VITE_EXCHANGE_ORIGIN` | unused | Static SPA host when Phase 2 ships |

For production static build, `VITE_NODE_ORIGIN` is only used for **user's local node** links (Sync, Open wallet), not server-side. Never bake `VITE_HACKME_ADMIN_TOKEN` into a public bundle.

---

## 2. Local wallet `http://127.0.0.1:8080/#wallet`

### How dashboard works

- Single page `dashboard.html` served by `hackme-node`
- Tabs via hash: `#wallet`, `#mining`, `#orders`, …
- Wallet tab: HMC treasury, SUP accrual, transfer form

### Exchange ↔ Wallet flows

| User action | Demo today | Production target |
|-------------|------------|-------------------|
| View HMC balance | Sync button → `GET /api/wallet` | Exchange-api account balance |
| Buy HMC with USDT | Paper debit/credit | Lock USDT → credit HMC in ledger |
| Withdraw HMC | Link to node `#wallet` transfer | Exchange-api → `POST /api/tx/send` (server-side, signed) |
| Deposit HMC | Manual transfer in node | Poll `GET /api/address/{deposit}` |

### Deep links (implemented)

```typescript
import { nodeWalletUrl, nodeTransferUrl } from "./adapters/walletLinks";

nodeWalletUrl();           // http://127.0.0.1:8080/#wallet
nodeTransferUrl("hmc");    // #wallet?focus=transfer&asset=hmc (future dashboard parse)
```

Header button **Node wallet** and Account → **Open #wallet** use these URLs.

### Sync HMC/SUP (implemented)

`Account` tab or header **↻ Sync**:

1. `GET {VITE_NODE_ORIGIN}/api/wallet`
2. Maps `balance_display_hmc`, `balance_sup` into demo wallet
3. USDT/BTC unchanged (paper until Phase 2)

Requires local `hackme-node` running. CORS: node must allow origin or use same-origin proxy in dev.

---

## 3. Payments & transfers

### On-chain (HackMe native)

| Op | API | Notes |
|----|-----|-------|
| HMC transfer | `POST /api/tx/send` | `transfer_v1`, Ed25519, min fee 1000 Kapa |
| SUP transfer | `POST /api/sup/tx/send` | Companion lane |
| Balance | `GET /api/wallet`, `GET /api/address/{addr}` | 8 decimals (Kapa) |

**Exchange must NOT hold user seeds in the browser.** Production flow:

1. User deposits to exchange deposit address (assigned per user)
2. Backend watches chain / coordinator
3. Trades update internal ledger
4. Withdrawal: backend signs with hot wallet (HSM/vault)

### Paper (demo)

- Instant fill via `execution.ts` + `localStorage`
- Fees in `fees.ts` (maker/taker VIP) — see [`ECONOMICS.md`](ECONOMICS.md)

### USDT / BTC (bridge)

Demo: oracle reference prices only (`market.ts` → `btcUsd`, synthetic USDT).

Production options:

- **Custodial**: exchange holds USDT on Tron/ETH, credits internal balance
- **CEX bridge**: deposit/withdraw via partner API
- **No on-chain USDT in HackMe node** today

### Monero (future)

- Not in HackMe node
- Options: `monero-wallet-rpc` sidecar, or custodial XMR
- Add to `PLANNED_ASSETS`, pair `XMR_USDT` when price feed exists

---

## 4. Oracle & pricing (already integrated)

Demo fetches:

- `GET https://hackme.tech/pool/coordinator/api/pool/stats`
- `GET https://hackme.tech/pool/coordinator/api/work/stats`
- `GET https://hackme.tech/api/sup/economics`

Formula in `src/market.ts` — same narrative as pool site.

---

## 5. Dev proxy (Vite)

`vite.config.ts` already proxies:

| Prefix | Target | Purpose |
|--------|--------|---------|
| `/pool-proxy` | `hackme.tech/pool/coordinator` | SPA oracle fetches (`integration.ts`) |
| `/hub-proxy` | `hackme.tech` | Hub pages (e.g. Explorer Lite) |
| `/pool` | `hackme.tech` | Root-absolute paths inside hub HTML |
| `/api` | `hackme.tech` | Same (e.g. `/api/status` links) |
| `/exchange-api` | `127.0.0.1:18443` | Optional lab API |

Without `/pool` + `/api`, Explorer Lite stats panes SPA-fallback to exchange `index.html`.

Optional node proxy sketch:

```typescript
"/node-api": { target: "http://127.0.0.1:8080", rewrite: (p) => p.replace(/^\/node-api/, "") },
```

Then set `VITE_NODE_ORIGIN=""` and fetch `/node-api/api/wallet`.

---

## 6. Checklist before going live (Phase 2+ — future)

> Not applicable during Phase 1 demo. Keep as reference only.

- [ ] Exchange-api service (auth, ledger, order book)
- [ ] Deposit address generation + chain watchers
- [ ] Hot/cold wallet policy
- [ ] Rate limits, KYC/AML (jurisdiction-dependent)
- [ ] `VITE_INTEGRATION_MODE=live` + remove localStorage balances
- [ ] Security review (`docs/SECURITY.md`)
- [ ] Nginx + WAF for `exchange.hackme.tech`
