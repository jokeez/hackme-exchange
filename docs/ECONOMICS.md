# HackMe Exchange — Economics sheet

> **Canonical for Phase 2 backend design.** Demo numbers live in code (`src/fees.ts`, `src/market.ts`, `src/book.ts`); this doc states what is **demo**, what is **Phase 2 target**, and how exchange fees relate to **HackMe chain / pool / fuzz** economics (must not contradict).

**Status:** D0 Paper · paper settlement · shared reference mids (±drift)  
**Cross-check:** HackMe `internal/chain/economics.go`, `docs/FUZZ_ESCROW_20_80.md`, `docs/ORDER_ECONOMICS.md`, `docs/EXCHANGE_LISTING_MEMO.md`

---

## Summary table

| Item | Demo (now) | Phase 2 target | Notes |
|------|------------|----------------|-------|
| **Maker fee** | VIP Regular **8 bps** (0.080%) | Same schedule unless ops change | Canonical: API `internal/fees/fees.go`; demo `VIP_TIERS` mirrors it |
| **Taker fee** | VIP Regular **10 bps** (0.100%) | Same | Market / IOC crossing / stop triggers = taker |
| **VIP tiers** | Regular 8/10 → VIP1 6/8 (100k) → VIP2 4/6 (1M) → VIP3 2/4 (10M) 30d USDT | Server-side volume ledger | Client 30d from local trades is farmable in demo (import sanitization helps) |
| **Pay fees in HMC** | Optional; **−25%** discount (cap 0–25%) | Keep; settle in HMC at mid | Discount applies to quote-notional fee, then ÷ `hmcUsdt` |
| **Spread** | **8–36 bps** from pool GH/s | Real book + MM / external refs | `tickerFromMarket` synthetic bid/ask |
| **Oracle mid** | **Operator reference mid** (default **0.05** USDT/HMC); pool GH/rpm/workers are **telemetry only** | Keep as **reference**; trades need real liquidity | Not scaled by hashrate (fixed chain emission) |
| **Order book** | Synthetic ladder (~600+ base/level) | Matching engine + MM | Not real depth — UI only |
| **Convert** | **Taker fee** at mid (VIP schedule; optional HMC −25%) | Same; `POST /convert` when `/health` has `fees.convert_fee` | Paper path mirrors spot taker; lab SPA prefers API when session + flag |
| **Settlement** | `localStorage` wallet | Internal ledger + HMC/SUP deposit watch | See `adapters/settlement.ts` |
| **HMC chain fees** | N/A in demo | Withdrawals pay **transfer_v1** min fee (Kapa); **30% burn / 70% treasury** | Separate from spot maker/taker |
| **PoH order escrow** | N/A | Untouched by exchange | +5% platform fee, 10% burn tally on prepaid |
| **Fuzz escrow** | N/A | Untouched by exchange | **20% runs / 80% bounty** hybrid |

---

## 1. Spot trading fees (exchange rail)

### Maker / taker roles

| Order kind | Role | Condition |
|------------|------|-----------|
| Limit / OCO resting | **Maker** | Does not immediately cross |
| Limit / OCO immediate | **Taker** | Crosses book |
| Market / trailing stop | **Taker** | Always |
| Stop-limit | Maker until trigger → **Taker** on trigger fill |
| Post-only | Reject if would take | Demo enforces |

### VIP schedule (canonical — API truth)

Lab matching implements this table in `hackme-exchange-api/internal/fees/fees.go`. Demo `VIP_TIERS` must stay identical.

| Tier | 30d vol (USDT) | Maker | Taker |
|------|----------------|-------|-------|
| Regular | ≥ 0 | 8 bps | 10 bps |
| VIP 1 | ≥ 100,000 | 6 bps | 8 bps |
| VIP 2 | ≥ 1,000,000 | 4 bps | 6 bps |
| VIP 3 | ≥ 10,000,000 | 2 bps | 4 bps |

`FeeConfig.makerBps` / `takerBps` are **import clamps only** (1–100 bps). **`calcFee` always uses `VIP_TIERS`.** Do not dual-source rates from `FeeConfig`.

### HMC fee payment

- Toggle: `feeConfig.payFeesInHmc` (paper always; lab orders/convert send `pay_fee_in_hmc` when checked)
- Discount: `hmcDiscountPct` default **25**, sanitized **0–25**
- Formula: `feeQuote = notional × bps/10000 × (1 − discount/100)`; `feeHmc = feeQuote / hmcUsdt`
- Server-side: API `/health` exposes `fees.hmc_fee_pay` + `fees.hmc_fee_discount_pct`; fills and `POST /convert` debit HMC when `pay_fee_in_hmc: true`

### Fee disposition

**Lab:** fill fees credit a dedicated **fee collection wallet** (configurable via API `EXCHANGE_FEE_WALLET`). Address is public on `GET /health` as `fee_wallet` (ledger address only — never a private key). Demo Account → Custody shows it read-only when present. Fees are charged in the **quote asset of each trade** (USDT / BTC / SUP depending on pair). Collected amounts are **ledger balances on the fee wallet** until ops sweeps them via CLI `POST /admin/fees/sweep` (`X-Admin-Token`) — that closes the lab “balances stuck on ledger” gap (ledger debit + audit; not auto mainnet). Read balances / recent sweeps: `GET /admin/fees`. The SPA never embeds the admin token. Legacy audit sink label `HMC-exchangefees0000` may still appear in older notes.

#### What asset hits the fee wallet? (API `settleFillOps`)

| Pair | Fee asset on fee wallet | HMC as fee? |
|------|-------------------------|-------------|
| HMC/USDT | **USDT** | No |
| SUP/USDT | **USDT** | No |
| HMC/SUP | **SUP** | No |
| HMC/BTC | **BTC** | No |
| SUP/BTC | **BTC** | No |

Demo “pay fees in HMC (−25%)” applies on paper and lab (`pay_fee_in_hmc`). Seed (if auto-generated): `{dirname(EXCHANGE_DB_PATH)}/fee_wallet.seed` — **64-hex Ed25519, not BIP39**.

Demo paper mode (no lab API) **burns nothing** — fees vanish from the paper wallet.

**Production:** treat collected spot fees as **ops / insurance first** (custody ops, matching infra, listing risk — typically **70–100%**). Optionally allocate a **minority burn/buyback share (0–30%)** only if product wants a narrative echo of chain `NetworkFeeBurnShare = 0.30`; that share is optional, not required for launch. **Never** route spot fees into PoH order escrow or fuzz 20/80 — those are orthogonal customer prepaid rails on-node.

---

## 2. Liquidity & pricing assumptions

### Demo oracle (`market.ts`)

```
hmcUsdt = liveReferenceMid(oracleAnchor)   // ~0.05 ±0.35% paper drift
supUsdt = liveReferenceMid(0.01)           // ~0.01 ±0.35%
hmcSup  = hmcUsdt / supUsdt
hmcBtc  = hmcUsdt / btcUsd                 // btcUsd pinned DEFAULT_BTC_USD = 67500 (shared paper)
supBtc  = supUsdt / btcUsd
spreadBps = clamp(8 + 35/poolGh × 6, 8, 36)   // cosmetic book only
```

**Do not** scale mid by `(poolGh/35)^n`, `reward_per_m`, or SUP scarcity — chain emission is fixed; hashrate / mint stats are network health, not valuation. Paper drift is cosmetic only (mean-reverting around the operator refs).

Sources (telemetry): `GET …/pool/stats`, `…/work/stats`, `…/api/sup/economics`, BTCUSDT mark.

D0/D1 soft reference: **0.05 USDT/HMC**, **0.01 USDT/SUP**. Lab MM soft mids match the refs (exact); SPA breathes around them.

### Demo book (`book.ts`)

- Levels from ticker bid/ask ± `mid × 0.0011`
- Size waves are **cosmetic** — notional depth is not a market-making model
- `matchMarket` walks the synthetic book for slippage theater

### Phase 2 liquidity (design inputs)

| Assumption | Starter value | Risk if wrong |
|------------|---------------|---------------|
| Seed HMC/USDT MM inventory | Operator decision | Thin book → oracle mid ≠ tradeable |
| External BTC/USDT ref | Index or CEX feed | Demo uses fixed ~$67,500 |
| Min order notional | e.g. 1–5 USDT | Dust spam |
| Max slippage guard | Reject or partial | User loss / abuse |

Lab (loopback): **seed MM ladders** + **min notional** (~1 quote) + **price bands** (±15%) are on by default (`EXCHANGE_LAB_MM`, see API `LAB_API.md` / `/health`). This is demo depth, not a signed production MM/RFQ. Listing memo / soft-public still need an explicit MM plan before “live” marketing (`HackMe/docs/EXCHANGE_LISTING_MEMO.md`).

---

## 3. HMC / SUP flows vs HackMe product (no contradiction)

| HackMe product rail | Policy | Exchange interaction |
|---------------------|--------|----------------------|
| **HMC max supply** | 100,000,000 | Display / equity only; exchange does not mint |
| **Genesis treasury** | 50,000 HMC → `HMC-719006d93916ad52` | Withdrawals may pay network fee share to same treasury |
| **Transfer fee** | Min 1000 Kapa; **30% burn / 70% DevFee** | On **deposit/withdraw**, not on internal spot match |
| **PoH order escrow** | Prepaid + **5%** platform fee; **10%** burn tally | B2B audits — **orthogonal** to spot |
| **Fuzz escrow 20/80** | 20% runs / 80% bounty (+ crash bonus ≤1%) | **Orthogonal** — customer node escrow |
| **Pool settlement** | Coordinator accrual → on-chain settle | Miners sell HMC on exchange after withdraw |
| **SUP** | Max 21M; quality-gated mint | Companion pair; list after HMC |

Exchange spot fees **must not** be documented as “order fee 5%” or “fuzz 20/80” — different products, different wallets.

### Deposit / withdraw (Phase 2)

1. User sends HMC to exchange deposit `HMC-…` (watch `GET /api/address/{addr}`)
2. Credits **internal** balance (no double-spend vs node wallet sync in demo)
3. Spot trades move internal ledger only
4. Withdraw: exchange hot wallet `transfer_v1` → user pays/network fee per chain policy

Demo **Sync HMC/SUP** merges node balances into paper wallet — **not** custodial truth.

---

## 4. Demo paper numbers (UI / QA)

| Parameter | Value | Where |
|-----------|-------|-------|
| Starting wallet | 10k USDT · 50k HMC · 8k SUP · 0.15 BTC | `store.ts` |
| Demo top-up buttons | **Removed** — use node Sync / lab custody | Account · Funds |
| Oracle / reference mid | **0.05** USDT/HMC · **0.01** USDT/SUP | Settings · `DEFAULT_REFERENCE_MID` / `DEFAULT_SUP_REFERENCE_MID` |
| BTC ref | 67_500 USD | `market.ts` |
| Fee discount default | 25% | `DEFAULT_FEE_CONFIG` |

These are **QA fixtures**, not launch treasury or circulating supply claims.

---

## 5. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Synthetic mid ≠ tradeable price | High at go-live | Real book + external refs before public |
| Client VIP volume farming | Med (demo) | Server volume in Phase 2; import caps already |
| Free Convert undercuts spot fees | Low (closed on paper) | Paper convert charges taker; wire server convert when API ready |
| Confusing spot vs chain vs fuzz fees | Med | This doc + UI labels (“HackMe VIP”, not “order fee”) |
| Thin early liquidity / lab-only seed MM | Medium–High for public | Lab seed ≠ prod MM; soft-public only after signed MM/RFQ plan |
| Custody / hot-wallet drain | Critical | HSM, limits — `docs/SECURITY.md` |
| Oracle stale / fallback | Med | `oracleStatus` chips; reject trades if stale in live |

---

## 6. Phase 2 backend checklist (econ-facing)

- [x] Persist VIP schedule server-side (`fees.go` / `TierForVolume`); demo `VIP_TIERS` mirrors API
- [x] HMC fee-pay discount server-side (SPA sends `pay_fee_in_hmc`; API honors on fills + convert)
- [x] Fee on every fill; maker/taker role from matching engine (not client claim)
- [x] Fee disposition policy written (lab → `EXCHANGE_FEE_WALLET` / `/health` `fee_wallet`; prod ops/insurance ± optional burn; never PoH/fuzz)
- [x] Lab fee sweep closes “stuck on ledger” gap (`POST /admin/fees/sweep` + SPA CLI hint; not mainnet)
- [x] Convert fee parity with spot (**paper + server** `POST /convert` when `/health` has `fees.convert_fee`; SPA prefers lab path when session connected)
- [ ] Deposit/withdraw fee = **chain** transfer policy only (separate line item)
- [x] Do not mix fuzz 20/80 or PoH 5% into spot fee API
- [ ] Liquidity / MM assumptions signed off before soft-public
- [ ] Integer Kapa for HMC amounts on wire (8 decimals)

### Verify fee wallet credits (lab)

After a Spot fill (counterparty bot) or Convert swap on a connected lab session:

```bash
curl -sS -H "X-Admin-Token: $EXCHANGE_ADMIN_TOKEN" \
  http://127.0.0.1:18443/admin/fees | jq '.balances'
```

Expect the quote asset (or HMC if pay-fees-in-HMC) `available` on the fee wallet to rise. SPA never embeds `EXCHANGE_ADMIN_TOKEN` — Account → Custody shows CLI-only hints.

---

## 7. Verdict

**GO with notes** — fee schedule, maker/taker rules, HMC discount, and separation from chain/fuzz/order rails are clear enough to design `exchange-api` ledger + fee endpoints.

**Blocking notes (not NO-GO for design, blocking for public live):**

1. Real matching + liquidity for public (lab MM seed is not production MM)
2. Production fee split ledgering (ops/insurance vs optional burn) — lab convert + fee wallet DONE
3. Custody / withdraw limits (security, not rate math)

**NO-GO** only if product tries to merge spot fees with fuzz 20/80 or PoH order escrow, or ships “live” trading on oracle mid without a book.

---

## Code map

| Path | Role |
|------|------|
| `src/fees.ts` | VIP tiers, `calcFee`, roles, sanitize |
| `src/types.ts` | `DEFAULT_FEE_CONFIG` |
| `src/market.ts` | Oracle mid, spread |
| `src/book.ts` | Synthetic book / market match |
| `src/execution.ts` | Fill + fee apply |
| `src/account.ts` | Fee schedule UI |
| `src/adapters/settlement.ts` | Demo vs future settle boundary |
| `docs/INTEGRATION.md` | Topology + deploy |
| `docs/SECURITY.md` | Custody principles |
