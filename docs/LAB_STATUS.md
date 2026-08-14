# Lab status (demo)

See **[PHASE2_VERDICT.md](./PHASE2_VERDICT.md)** and API [`PHASE2_VERDICT.md`](../../hackme-exchange-api/docs/PHASE2_VERDICT.md).

**TL;DR:** Paper default. Lab opt-in → `liveSettlement` on loopback `:18443`. Lab MM + fee wallet + CLI sweep + **server convert** + **HMC fee-pay** are live. Paper convert remains as fallback. `isLiveMode()` false. Public **NO**.

SPA detects `fees.hmc_fee_discount_pct` / `fees.pay_fee_in_hmc` / `fees.hmc_fee_pay` and `fees.convert_fee: "taker"`.
