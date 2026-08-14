# Phase 2 lab verdict — exchange-api + demo

> **Loopback only.** No VPS, no public DNS, no production custody.  
> Date: 2026-07-23 (security/abuse lab pass + convert/HMC fee-pay alignment).

## Verdict: **GO private lab / HOLD public**

Ready locally: auth, session revoke, ledger, SQLite matching, L2 book, stops/OCO/trailing, VIP fees, **server HMC fee-pay (−25%)**, **`POST /convert` (mid + VIP taker)**, HMC deposits, paper USDT/BTC bridge, withdraw stub, lab MM, min notional, price bands, fee wallet + CLI sweep, SPA health flag alignment.  
**Not GO** for public deploy, production hot-wallet custody, real USDT/BTC chains, production MM/RFQ, or production per-user 2FA.

---

## DONE (Phase 2 lab)

| Area | Status |
|------|--------|
| Auth + CSRF + session revoke | DONE |
| Ledger + VIP fill fees | DONE |
| Matching + persisted book + L2 | DONE |
| stop_limit / stop_market / OCO / trailing | DONE |
| Lab MM seed + auto top-up | DONE |
| Min notional + price bands | DONE |
| Fee wallet + CLI sweep | DONE |
| HMC deposit + paper USDT/BTC bridge | DONE (stubs) |
| Withdraw request → admin complete | DONE (CLI token) |
| Server HMC fee-pay on fills | DONE (`pay_fee_in_hmc`; health `hmc_fee_pay` + `hmc_fee_discount_pct`) |
| Server convert | DONE (`POST /convert`; health `convert_fee: "taker"`) |
| SPA health detection + `pay_fee_in_hmc` on orders/convert | DONE |

## OPEN (post Phase-2 lab / public prep)

| Item | Owner |
|------|--------|
| On-chain send after fee sweep | Ops/manual |
| Real USDT/BTC custody bridges | Future |
| Public bind / TLS / HSM | OUT OF SCOPE until checklist |

## OUT OF SCOPE (public / production)

- Public bind, DNS, TLS, separate exchange VPS  
- Production MM / signed RFQ  
- Real USDT/BTC custody bridges  
- HSM / production hot-wallet withdraw signer  
- Per-user TOTP enrollment  

---

## Lab security checklist (2026-07-23)

| Check | Result |
|-------|--------|
| Admin token never in SPA | OK (CLI hints only; prod bundle has no secret) |
| Non-loopback API origin rejected | OK (SPA + API bind gate) |
| Session/CSRF on mutating routes | OK |
| Self-trade prevention | OK (`firstNonSelf`) |
| Min notional / price bands | OK (live health: 1e8 / 1500 bps) |
| Withdraw complete + fee sweep admin-only | OK |
| XSS account/trades | OK (`escapeHtml` + enum/numeric history) |

**P0/P1 this pass:** none found. No code fixes required.

## Test counts

| Suite | Count |
|-------|-------|
| **API** | **113** PASS (`go test ./... -count=1`) |
| **Demo** | **319** PASS / 40 files (`npm test -- --run`) |

## How to demo

```bash
curl -sS http://127.0.0.1:18443/health | jq .fees
# expect: hmc_fee_pay, hmc_fee_discount_pct, convert_fee: "taker", pay_fee_in_hmc hint

# Convert tab with DEMO/LAB session → uses POST /convert (not paper)
```

## GO / notes

**GO** private Phase-2 lab on loopback (`127.0.0.1:18443` + demo `:5199`).  
**HOLD** public: never set `EXCHANGE_ALLOW_PUBLIC_BIND=1` until PRE_PUBLIC_CHECKLIST + real custody / TLS / per-user 2FA.
