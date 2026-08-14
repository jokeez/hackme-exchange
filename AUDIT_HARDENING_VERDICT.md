# Audit Hardening Verdict — HackMe Exchange Demo

**Date:** 2026-07-20  
**Scope:** Local hardening only (no deploy, no exchange-api, no main HackMe repo changes)

## Must-haves implemented

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Paper/synthetic badges | ✅ | `PAPER · SYNTHETIC` on order book, tape, order panel, announce bar; tape shows `SYN` on synthetic rows |
| 2 | Block/mislabel live mode | ✅ | `VITE_INTEGRATION_MODE=live` downgrades to paper with console warning; `isLiveMode()` always false; header pill never shows misleading "● Live" |
| 3 | Import hardening | ✅ | Wallet capped at `1e12`/asset; trades capped at `1e6` quote; trades older than 30d stripped on import |
| 4 | Data status UI | ✅ | Markets panel shows oracle source, age, live/fallback/stale/offline indicator |
| 5 | executeFill atomicity | ✅ | Wallet snapshot rollback if fee application fails after trade |
| 6 | Balance reservation | ✅ | Open buy/sell limits reserve quote/base; `placeOrder`/`placeOco` reject overspend across multiple orders |

## Should-haves (partial)

| Item | Status |
|------|--------|
| Confirm before Market / MAX / Reset / Import | ✅ Market, MAX, Import, Reset (Reset existed) |
| a11y focus-visible + aria-label on trade buttons | ✅ |
| Honest oracle latency test | ✅ Reports fallback vs live; no fake SLA pass on CORS fail |
| Mobile panel switcher (Book/Chart/Trade/Markets) | ✅ ≤900px tab bar |
| Oracle retry control | ✅ ↻ in markets panel |
| feeConfig import sanitization | ✅ hmcDiscount 0–25%, bps capped |
| Vitest uses direct hackme.tech (no :3000 proxy noise) | ✅ |

## Files touched (high level)

- `src/balance.ts` — reservation + fund checks (new)
- `src/demoIo.ts`, `src/sanitize.ts`, `src/store.ts`, `src/fees.ts` — import/wallet/fee caps
- `src/execution.ts` — fee-failure rollback
- `src/orders.ts` — reservation-aware placement
- `src/config/integration.ts` — live mode block + vitest proxy fix
- `src/oracleStatus.ts` — oracle status UI module (new)
- `src/app.ts`, `src/orderPanel.ts`, `src/account.ts`, `src/styles.css` — UI badges, oracle status, mobile tabs, confirms, a11y
- Tests: `balance.test.ts`, `demoIo.test.ts`, `execution.test.ts`, `abuse_econ_latency.test.ts`, `oracleStatus.test.ts`, `hardening.ui.test.ts`, `orders.test.ts`, `fees.test.ts`

## Test & build results

```
npm test  → 35 files, 268 tests passed
npm run build → tsc + vite build OK
```

## Demo readiness estimate

| Stage | Before (audit) | After hardening | After polish pass |
|-------|----------------|-----------------|-------------------|
| **Local demo / workshop** | ~65% | **~82%** | **~88%** |
| **Soft launch (public)** | ~35% | **~45%** | **~48%** |

**Verdict:** Suitable for **local/trusted demo** and internal walkthroughs. **Not** ready for soft launch as a real exchange — by design; live mode remains blocked until exchange-api exists.

## Not in scope (unchanged)

- Real CEX matching engine
- exchange-api / on-chain settlement
- Economy/oracle formula changes
- Public deploy to exchange.hackme.tech
