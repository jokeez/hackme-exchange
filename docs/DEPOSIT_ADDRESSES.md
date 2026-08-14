# Deposit addresses (lab)

> **Not production custody.** Loopback lab only. Do **not** send mainnet USDT/BTC to stub addresses.

## Mapping / bridge model

| Asset | Address kind | `bridge_model` | Format | Credit path |
|-------|--------------|----------------|--------|-------------|
| **HMC** | `hmc_ed25519` | `hmc_node_watch` | `HMC-` + 16 hex | Node watch / lab chain-watch |
| **USDT** | `lab_stub` | `paper_bridge_stub` | `labdep1usdt{16hex}` | `POST /lab/bridge-credit` (paper) or chain-watch sim |
| **BTC** | `lab_stub` | `paper_bridge_stub` | `labdep1btc{16hex}` | Same as USDT |
| SUP | `lab_stub` | `lab_stub_address` | `labdep1sup…` | Lab chain-watch only (no bridge-credit) |

USDT/BTC issuance is **honest**: responses label `kind=lab_stub` and `bridge_model=paper_bridge_stub`. There is **no** real TRON/ERC20/BTC custody in this lab.

## HMC derivation (HackMe-compatible)

1. Master seed: `EXCHANGE_DEPOSIT_MASTER_SEED` (64 hex / 32 bytes), **or** lab fallback  
   `SHA256("hackme-exchange-deposit-master-v1|" + EXCHANGE_JWT_SECRET)`.
2. Per-account Ed25519 seed:  
   `HMAC-SHA256(master, "hackme-exchange-deposit-hmc-v1|{account_lower}")`.
3. Address: `HMC-` + first 16 hex of `SHA256(ed25519_pubkey)` — identical to HackMe `nodecrypto.Address()`.

Private keys are **never** returned by the API. They can be re-derived server-side from the master for operator cold ops; do not bake into the SPA.

Legacy rows that still have `labdep1hmc…` for HMC are upgraded to the Ed25519 address on next `GET /deposit/address?asset=HMC`.

## Credit paths

### HMC (near-real lab)

1. User: `GET /deposit/address?asset=HMC` → show `deposit_address`.
2. On-chain (or sim): transfer HMC **to** that address.
3. Operator: `POST /admin/node-watch-sync` with `X-Admin-Token`  
   → polls `GET {EXCHANGE_NODE_ORIGIN}/api/wallet/activity?address=…`  
   → credits ledger via `CreditDepositByAddress` (idempotent `tx_id`).
4. Lab without node: `POST /lab/chain-watch` or `/admin/chain-watch` with the deposit address.

### USDT / BTC (paper bridge)

1. User: `GET /deposit/address?asset=USDT` → stub `labdep1…` + warning.
2. Session: `POST /lab/bridge-credit` `{ "asset":"USDT", "amount": … }` (CSRF)  
   → credits own stub address; audit `source=lab_bridge_credit`; **asset-gated** to USDT|BTC only.
3. Alternate: `/lab/chain-watch` with the stub address (same ledger path, less explicit labeling).

## Env

```bash
# Optional dedicated master (recommended if rotating JWT independently):
# EXCHANGE_DEPOSIT_MASTER_SEED=$(openssl rand -hex 32)
# EXCHANGE_NODE_ORIGIN=http://127.0.0.1:8080
```
