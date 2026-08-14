# HackMe Exchange — Future Architecture

> **Plan document only.** Nothing here is implemented in the main HackMe repo.  
> All exchange work stays in `hackme-exchange-demo/` until Phase 2 is explicitly started.  
> See [`SCOPE.md`](SCOPE.md).

## Current state (demo)

```
┌─────────────────────────────────────────────────────────────┐
│  hackme-exchange-demo (Vite SPA, static dist/)              │
│  • UI: spot terminal, charts, orders                        │
│  • Balances: localStorage (paper USDT/BTC + optional sync)  │
│  • Oracle: GET hackme.tech/pool/coordinator + /api/sup/...  │
└───────────────┬─────────────────────────────┬───────────────┘
                │ read-only                    │ deep link
                ▼                              ▼
┌───────────────────────────┐    ┌────────────────────────────┐
│ hackme.tech (nginx)       │    │ hackme-node :8080          │
│ • static site             │    │ dashboard.html #wallet     │
│ • public GET APIs         │    │ POST /api/tx/send (HMC)    │
│ • coordinator :18081      │    │ POST /api/sup/tx/send      │
└───────────────────────────┘    └────────────────────────────┘
```

**No matching engine, no custodial backend, no on-chain settlement for trades yet.**

---

## Target state (phased)

### Phase 1 — Read-only bridge (now)

| Component | Location | Status |
|-----------|----------|--------|
| Pair/asset registry | `src/registry.ts`, `src/adapters/assets.ts` | ✅ |
| Integration config | `src/config/integration.ts` | ✅ |
| Node wallet read | `src/adapters/nodeWallet.ts` | ✅ |
| Settlement interface | `src/adapters/settlement.ts` | ✅ stub |
| Deep links | `src/adapters/walletLinks.ts` | ✅ |

User runs local node → **Sync HMC/SUP** pulls `GET /api/wallet` into demo balances.

### Phase 2 — `exchange.hackme.tech` (deferred — not in main HackMe)

> **Plan only.** No nginx block, no VPS deploy, no exchange-api in main repo until Phase 2 approval.

```
exchange.hackme.tech          hackme-exchange-api (future, not built)
      │                                │
      │  static dist/                  │  REST + WS
      └────────── SPA ─────────────────┘
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
    PostgreSQL   Redis book   hackme-node
    (accounts)   (orders)     (deposits/withdrawals)
```

**Deploy static UI:**

```bash
npm run build
rsync -av dist/ vps:/opt/hackme/web/exchange/
```

**Nginx** (add to `hackme-site-domain.tls.conf`):

```nginx
server {
  server_name exchange.hackme.tech;
  root /opt/hackme/web/exchange;
  location / { try_files $uri $uri/ /index.html; }
  location /api/ {
    proxy_pass http://127.0.0.1:18443/;  # future exchange-api
  }
}
```

Oracle CORS already works from `hackme.tech` coordinator endpoints.

### Phase 3 — Settlement layers

| Asset | Deposit | Withdraw | Trade settle |
|-------|---------|----------|--------------|
| HMC | Watch `GET /api/address/{HMC-…}` | `POST /api/tx/send` | Internal ledger + periodic on-chain sweep |
| SUP | On-chain mint + address watch | `POST /api/sup/tx/send` | Same |
| USDT | CEX/custodian deposit address | CEX API or manual | Paper → custodial |
| BTC | External BTC address | External | Bridge price only in demo |
| XMR | monero-wallet-rpc or custodian | Same | Phase 3+ |

Reference: `HackMe/docs/EXCHANGE_LISTING_WALLET_PREP.md` for HMC wire format.

### Phase 4 — Wallet dashboard integration (deferred — main repo)

> **Not planned for implementation now.** When Phase 2+ starts, this would be a separate change in `HackMe/dashboard.html`. Do not edit main repo during Phase 1.

`dashboard.html` (`127.0.0.1:8080/#wallet`) could gain rows from `ASSET_REGISTRY`:

- **HMC, SUP** — already live (on-chain)
- **USDT, BTC** — read-only paper or custodial balance from exchange-api
- **XMR** — planned (`PLANNED_ASSETS` in `src/adapters/assets.ts`)

Deep links from exchange:

- `http://127.0.0.1:8080/#wallet` — overview
- `http://127.0.0.1:8080/#wallet?asset=hmc` — future query param
- Transfer: use node UI `POST /api/tx/send` (never from exchange SPA directly in prod without auth)

---

## Module map (demo repo)

| Path | Role |
|------|------|
| `src/registry.ts` | Trading pairs |
| `src/adapters/assets.ts` | Wallet assets + settlement kind |
| `src/config/integration.ts` | URLs, mode |
| `src/adapters/nodeWallet.ts` | Node API client |
| `src/adapters/settlement.ts` | Pluggable settlement backend |
| `src/execution.ts` | Fill logic (swap adapter in live mode) |
| `src/store.ts` | State persistence (→ API in live) |

---

## Adding a new coin

1. Add `PairId` + entry in `src/registry.ts`
2. Add asset in `src/adapters/assets.ts` with `settlement` kind
3. Extend `Wallet` in `src/types.ts` if new balance field
4. If on-chain: add node API mapping in `nodeWallet.ts`
5. Tests in `registry.test.ts` + `integration.test.ts`
