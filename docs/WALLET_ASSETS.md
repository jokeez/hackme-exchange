# Wallet Assets Roadmap — Dashboard + Exchange

> **Roadmap / plan only.** USDT, BTC, XMR tabs in `HackMe/dashboard.html` are **not** being added now.  
> Exchange demo uses paper balances + asset table in Account tab.  
> See [`SCOPE.md`](SCOPE.md).

Target (future): extend `dashboard.html` wallet tab and exchange balances consistently.

## Asset matrix

| Symbol | Exchange demo | Node wallet tab | Settlement | Phase |
|--------|---------------|-----------------|------------|-------|
| **HMC** | ✅ tradable | ✅ live | on_chain | Now |
| **SUP** | ✅ tradable | ✅ live | on_chain | Now |
| **USDT** | ✅ paper quote | 🔜 planned tab | bridge/custodial | 2 |
| **BTC** | ✅ paper quote | 🔜 planned tab | bridge/custodial | 2 |
| **XMR** | — | 🔜 planned | external_chain | 3 |

Source of truth for labels: `src/adapters/assets.ts`

---

## HMC / SUP (on-chain — now)

**Dashboard:** `#wallet` → treasury, earnings, transfer

**APIs:**

```
GET  /api/wallet
POST /api/tx/send          # HMC transfer_v1
POST /api/sup/tx/send      # SUP
GET  /api/worker/settlement
```

**Exchange integration:**

- Sync button reads node wallet (local dev)
- Live: exchange-api mirrors confirmed on-chain + internal ledger

---

## USDT (Phase 2 — plan only, main repo unchanged)

**Demo (now):** `state.wallet.usdt` — paper starting balance (no demo top-up buttons). Lab uses bridge-credit / deposit address.

**Production options:**

1. **Internal stablecoin ledger** — user deposits USDT to exchange TRC20/ERC20 address, ops credits account
2. **Partner CEX API** — not native to HackMe chain
3. **Future:** wrapped USDT on HackMe (not in codebase today)

**Dashboard UI (future — not implemented):**

- Row in `ECOSYSTEM_COINS` / wallet sidebar
- Show exchange-api balance, link "Deposit USDT" → instructions modal
- No `POST /api/tx/send` for USDT on hackme-node

---

## BTC (Phase 2 — plan only)

**Demo (now):** reference price `btcUsd` in `market.ts`; pairs `HMC_BTC`, `SUP_BTC`

**Production:**

- Watch-only BTC deposit address (bitcoind or custodian)
- Withdraw via batch BTC tx from exchange hot wallet
- Price feed: exchange-api or external oracle (not pool coordinator)

---

## Monero / XMR (Phase 3 — plan only)

**Not in HackMe node today. Not in exchange demo wallet yet.**

**Integration paths:**

| Approach | Pros | Cons |
|----------|------|------|
| `monero-wallet-rpc` sidecar | Self-hosted privacy | Ops heavy |
| Custodial (CEX sub-account) | Faster launch | Trust model |
| Atomic swap (future) | Decentralized | Complex |

**Exchange pairs (future):** `XMR_USDT`, optionally `HMC_XMR`

**Add to codebase when ready (exchange-demo first, main repo later):**

1. `PLANNED_ASSETS` → `ASSET_REGISTRY` with `id: "xmr"`
2. Extend `Wallet` type: `xmr: number`
3. `dashboard.html` — new coin profile (main HackMe, **deferred**)
4. Price feed adapter in `src/market.ts`

---

## Dashboard ↔ Exchange deep linking

| Link | URL |
|------|-----|
| Wallet home | `{nodeOrigin}/#wallet` |
| Mining | `{nodeOrigin}/#mining` |
| Orders/fuzz | `{nodeOrigin}/#orders` |
| Ecosystem | `{nodeOrigin}/#ecosystem` |
| Listing docs | `https://hackme.tech/listing.html` |

Implemented helpers: `src/adapters/walletLinks.ts`

**Future query params** (needs `dashboard.html` parser):

- `#wallet?coin=sup`
- `#wallet?focus=transfer&asset=hmc`

---

## Consistency rules

1. **Symbol names** match `ASSET_REGISTRY.symbol` everywhere
2. **Decimals:** HMC/SUP = 8 (Kapa); USDT = 6; BTC = 8; XMR = 12
3. **Never mix** accrual (coordinator) with exchange ledger without settlement event
4. **Orders escrow** on node (`balance_orders_spendable_hmc`) ≠ exchange balance — document in UI
