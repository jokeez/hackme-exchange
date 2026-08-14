# Lab API surface (private loopback)

> **DEMO/LAB ONLY — do not public deploy.**  
> Bind default: `127.0.0.1:18443`. Operator rules: [`PRIVATE_LAB.md`](./PRIVATE_LAB.md).  
> Demo wiring: [`../../hackme-exchange-demo/docs/LAB_API.md`](../../hackme-exchange-demo/docs/LAB_API.md).  
> Stop/OCO design: [`STOP_OCO_DESIGN.md`](./STOP_OCO_DESIGN.md).

## Matching + fees

- Price-time book in memory; **open orders + fills persisted to SQLite** and reloaded on API restart.
- VIP **tier-by-volume** fees on fill (Regular 8/10 → VIP1 6/8 → VIP2 4/6 → VIP3 2/4 via `TierForVolume`).
- Self-trade prevention: same account never matches itself.
- Amounts: integer minor units (`1e8`). Price: quote minor per 1 whole base.
- Live triggers: `stop_limit`, `stop_market`, `oco`, `trailing_stop`.
- **Lab MM** soft-launch seed + auto top-up on by default (`lab_mm` on `/health`); refresh `POST /lab/mm/seed`. Optional poller: `scripts/lab-mm-bot.ts`.
- **Custody fees** `GET /fees/custody`; hold via `POST /admin/hold`; pause `EXCHANGE_DEPOSIT_ENABLED` / `EXCHANGE_WITHDRAW_ENABLED`. Docs: retention, bridge later, runbook pause (API tree).
- **Fee sweep** `GET/POST /admin/fees*` — CLI + `X-Admin-Token` only (SPA never embeds token).
- Demo SPA: paper convert fallback; lab session prefers `POST /convert` when `fees.convert_fee` is set; orders/convert may send `pay_fee_in_hmc`.

## Endpoints (phase 2-matching-lab)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET` | `/health` | — | `phase`, pairs, fees (`hmc_fee_pay`, `hmc_fee_discount_pct`, `convert_fee`), matching, `book: sqlite-persisted`, optional `fee_wallet` `{ address, note }` (lab fee sink; never private key) |
| `GET` | `/metrics` | — | place/cancel latency percentiles |
| `GET` | `/book?pair=` | — | **L2 snapshot** from live engine (survives restart) |
| `POST` | `/auth/challenge` | — | Ed25519 challenge |
| `POST` | `/auth/verify` | — | Sets session + CSRF cookies |
| `POST` | `/auth/logout` | CSRF | Clears cookies + denylists JWT `jti` |
| `POST` | `/auth/revoke-all` | session+CSRF | Bump `session_version` (all prior sessions dead) |
| `GET` | `/balances` | session | Available / reserved |
| `GET` | `/deposit/address?asset=` | session | HMC = Ed25519/`HMC-`; USDT/BTC = paper stub — see DEPOSIT_ADDRESSES.md |
| `GET` | `/admin/fees` | `X-Admin-Token` | Fee wallet balances + recent sweeps (CLI only — never SPA) |
| `POST` | `/admin/fees/sweep` | `X-Admin-Token` | Lab fee sweep: debit fee wallet → destination (ledger stub; optional `dry_run`) |
| `POST` | `/admin/credit` | `X-Admin-Token` | Lab credit stub (operator) |
| `POST` | `/admin/chain-watch` | `X-Admin-Token` | Simulate inbound tx → credit by deposit address |
| `POST` | `/admin/node-watch-sync` | `X-Admin-Token` | Poll `EXCHANGE_NODE_ORIGIN` `/api/wallet/activity` → credit |
| `POST` | `/admin/withdraw/complete` | `X-Admin-Token` | Complete pending withdraw + debit |
| `POST` | `/admin/withdraw/fail` | `X-Admin-Token` | Fail pending withdraw + release |
| `POST` | `/lab/deposit` | session+CSRF | Direct session credit stub |
| `POST` | `/lab/chain-watch` | session+CSRF | Simulate inbound to **own** deposit address |
| `POST` | `/lab/bridge-credit` | session+CSRF | Paper USDT/BTC only (asset-gated) — not real chain |
| `POST` | `/orders` | session+CSRF | limit/market + stop_limit/stop_market/oco/trailing_stop; optional `pay_fee_in_hmc` |
| `POST` | `/convert` | session+CSRF | mid + VIP taker; optional `pay_fee_in_hmc`; SPA prefers when `fees.convert_fee` |
| `POST` | `/withdraw` | session+CSRF(+TOTP) | Lab withdraw request (pending) — see WITHDRAWALS.md |
| `GET` | `/withdrawals` | session | List withdraw requests |
| `GET` | `/orders` | session | Open / partial + armed triggers |
| `DELETE` | `/orders/{id}` | session+CSRF | Cancel + release reserve |
| `GET` | `/fills` | session | Recent fills (ring + SQLite) |
| `POST` | `/lab/counterparty` | session+CSRF | **DEMO/LAB bot** crosses resting order |

### Book persistence

Open/partial orders are upserted into `open_orders`; fills into `fills`. On startup `Engine.LoadFromStore` rebuilds the book **without re-reserving** (ledger `reserved` already holds funds).

### `GET /deposit/address?asset=HMC|USDT`

HMC returns `kind: hmc_ed25519` and a real `HMC-…` deposit wallet (see [DEPOSIT_ADDRESSES.md](./DEPOSIT_ADDRESSES.md)). USDT/BTC remain `labdep1…` stubs.

### `POST /withdraw` / admin complete

See [WITHDRAWALS.md](./WITHDRAWALS.md).

### `POST /lab/chain-watch` / `POST /admin/chain-watch`

Body: `{ "deposit_address": "…", "amount": <minor>, "tx_id"?: "…", "asset"?: "USDT" }`

Credits the owning account; `tx_id` unique (409 on duplicate). Writes `chain_watch_events` + ledger row.

### `POST /lab/deposit`

Credits the **authenticated session** wallet (no address mapping). Writes a proper `ledger_entries` row.

Body: `{ "asset": "USDT", "amount": <minor>, "tx_id"?: "…", "reason"?: "…" }`

Caps: `EXCHANGE_MAX_LAB_DEPOSIT`. Rate-limited (`EXCHANGE_LAB_RATE_PER_MIN`).

### `POST /lab/counterparty`

Body: `{ "pair": "HMC/USDT", "order_id"?: "…", "qty"?: <base minors> }`

Places opposite limit from a fixed second fixture wallet (auto-credited).

## Run

```bash
set -a && source .env && set +a
go test ./...
go run ./cmd/exchange-api
# → http://127.0.0.1:18443
```

## Verify persist + deposit (curl)

```bash
# After placing a resting limit, restart API, then:
curl -s 'http://127.0.0.1:18443/book?pair=HMC/USDT' | jq '{bids,asks}'
# Deposit address + simulate (needs session cookies from auth/verify):
# GET /deposit/address?asset=USDT
# POST /lab/chain-watch  {"deposit_address":"…","amount":100000000,"tx_id":"t1"}
```
