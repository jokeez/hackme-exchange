# Matching GO checklist (public desk)

**Status:** HOLD until every gate below is checked and an explicit product **GO** is recorded.  
**Scope:** turn public desk from auth-only (`/desk-api`) into live book/orders — **not** deposit/withdraw yet (those are later GOs).

Hub VPS (`132…`) must **never** run the exchange edge. Paper SPA stays on `89.150.41.40`.

---

## 0. Preconditions (already shipped)

- [x] Paper SPA on `https://exchange.hackme.tech`
- [x] Same-origin `/desk-api` proxy + Strict cookies
- [x] Desk Connect (browser ephemeral `HMC-…`) — matching still HOLD
- [x] `GET /health` → `matching: disabled`, deposit/withdraw `enabled: false`
- [x] `GET /book` → `503` while HOLD
- [x] Lab fixture Ed25519 seed **absent** from paper `dist-d0`
- [x] Hub embed (`?embed=hub`) paper-only — CSP `frame-ancestors`

---

## 1. Security gates (blockers)

| # | Gate | Pass criteria | Rollback if fail |
|---|------|---------------|------------------|
| 1.1 | CSRF | Mutating routes require memory CSRF + cookie; no CSRF in `sessionStorage` / bundle | Flip matching OFF |
| 1.2 | CORS / Origin | Only `exchange.hackme.tech` (+ lab loopback) | Deny all non-allowlist |
| 1.3 | Cookie flags | `HttpOnly; Secure; SameSite=Strict` on desk session | Rotate session secret |
| 1.4 | Rate limits | Challenge / verify / place / cancel / book poll capped per IP + per address | Tighten limits / WAF |
| 1.5 | Authz | Orders only for session address; no cross-account fill leak | Disable matching |
| 1.6 | Admin tokens | Never in SPA / `VITE_*` | Redeploy paper build |
| 1.7 | Input bounds | Price band, min notional, qty clamps server-side | Reject 4xx + metrics |
| 1.8 | Abuse | Self-trade / wash guards; cancel spam | Pause matching |

SPA smoke (HOLD): `npm run smoke:desk` · live: `npm run smoke:live`  
Security subset: see `scripts/full_audit.sh` · `npm run smoke:matching-sec`  
Lab acceptance (authz + band + place/cancel): `npm run smoke:matching-go`

---

## 2. Matching feature flags

| Flag / health field | HOLD today | GO target |
|---------------------|------------|-----------|
| `matching` | `disabled` | `ok` |
| `deposit.enabled` | `false` | stays **false** until Deposit GO |
| `withdraw.enabled` | `false` | stays **false** until Withdraw GO |
| SPA `useLabMatching()` | loopback CSRF only | **stays false** on public desk |
| SPA `useDeskMatching()` | false while HOLD | true when health `ok` + desk CSRF |
| SPA `useServerMatching()` | lab only today | lab **or** desk live |

Public desk Connect must **not** flip `useLabMatching()` — live book uses `useDeskMatching` / `useServerMatching` after Matching GO.

---

## 3. Book / orders acceptance tests

Run against **staging first**, then public desk after GO:

1. `GET /health` → `matching: ok`, deposit/withdraw still off  
2. Desk Connect challenge → verify → CSRF  
3. `GET /book?pair=HMC/USDT` → `200` with bids/asks (not 503)  
4. Place limit → appears in open orders  
5. Cancel → removed  
6. Unauthorized address / bad CSRF → `401/403`  
7. Over band / under min notional → structured reject  
8. Rate-limit trip → `429` with backoff (`EX_MATCHING_GO_RATE=1`)  
9. After logout → balances/orders unauthorized  
10. Cross-account cancel → denied  

Automate: `npm run smoke:matching-go` (lab/staging). `scripts/desk-connect-smoke.ts` behind `EX_MATCHING_GO=1` for book 200 after GO.

**HOLD security probe (run anytime against public desk):**

```bash
npm run smoke:matching-sec
# or: npx tsx scripts/matching_go_security_probe.ts
```

Asserts: health HOLD, book 503 + `trading_disabled`, place 503, CSRF on logout, cookie HttpOnly/Secure/SameSite=Strict, no evil CORS ACAO, admin closed, metrics/openapi closed, post-logout unauthorized.

API sibling: `hackme-exchange-api/scripts/matching_go_hold_probe.sh` · `ops_drill_matching_rollback.sh`.  
Ops flip plan: `hackme-exchange-ops/docs/RUNBOOK_MATCHING_GO.md`.

---

## 4. Caps & economics

- [x] Per-address open order count — `EXCHANGE_MAX_OPEN_ORDERS` (lab 100 / public edge **20**)
- [x] Soft-launch rate caps — auth 20 / book 60 / trade 30 per IP/min on PUBLIC_EDGE defaults
- [x] Fee schedule matches SPA (`fees.ts` ↔ API) — `src/fees.parity.test.ts`
- [x] HMC fee-pay only if health advertises it (existing SPA guards)
- [x] Paper oracle mids **do not** override live book mid when matching live — SPA `useServerMatching()`
- [x] Soft-launch caps on public slim `/health` (`min_notional`, `price_band_bps`, `max_open_orders`) + SPA Account/Settings chrome

Global notional soft-launch: rely on min notional + open-order cap + trade rate; product may lower `EXCHANGE_MAX_OPEN_ORDERS` further before GO.

---

## 5. Observability & rollback

| Item | Ready? |
|------|--------|
| Matching enable/disable is a **single ops flag** (no redeploy SPA required) | [x] `EXCHANGE_TRADING_ENABLED` — unit rollback drill in API |
| Metrics: place/cancel latency, 4xx/5xx, 429s, book depth | [x] Lab `/metrics` latency + open_orders + book depth; public edge metrics stay dark |
| Alerts on matching error rate | [x] Ops `monitor.sh` → `logs/alerts.jsonl` on `matching_left_hold` / deposit / withdraw flip |
| Rollback: set `matching=disabled` → SPA pills show HOLD → book 503 | [x] Unit + `ops_drill_matching_rollback.sh` + **2026-10-01** `matching_go_staging_drill.sh` live→rollback (re-confirmed same day) |
| Cutover marker / changelog entry | [ ] At GO time |
| Hub embed still paper-safe if matching OFF | [x] `useLabMatching` loopback-only + `useDeskMatching` health-gated + hold probes |
| GO flag-flip runbook | [x] `hackme-exchange-ops/docs/RUNBOOK_MATCHING_GO.md` |
| Staging live→rollback drill | [x] `scripts/matching_go_staging_drill.sh` (**2026-10-01** re-run green — live window + HOLD restored) |
| Public slim health soft-launch caps | [x] Redeployed edge — `max_open_orders=20` while matching HOLD |

**Rollback drill (required before GO):** enable matching on staging → place/cancel → disable → confirm 503 + SPA HOLD badges within one health poll.

---

## 6. Explicit non-goals of Matching GO

- Deposit addresses / bridge credits  
- Withdraw + TOTP  
- Multi-device seed sync  
- Foreign CEX listing claims  
- Browser custody of hot keys for chain withdrawals  

---

## 7. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Ops | kapa | 2026-10-01 | Flag flip per RUNBOOK_MATCHING_GO · soft-launch caps 20/30/±1500 |
| Security | kapa | 2026-10-01 | Gates 1.x green · smoke:matching-sec + hold probe + staging drill |
| Product | kapa (chat GO) | 2026-10-01 | Soft-launch · deposit/withdraw remain OFF |

**GO command (ops only):** enable matching on desk API → verify §3 → announce.  
**ABORT:** disable matching flag immediately; leave deposit/withdraw off.

**Status 2026-10-01:** §7 recorded — public `EXCHANGE_TRADING_ENABLED=1` authorized. Deposit/Withdraw GO **not** authorized (PRE_PUBLIC P0-9 / P0-14).

---

## Prep evidence (HOLD — not a GO)

| Area | Status | Notes |
|------|--------|-------|
| Caps & economics | Green | Soft-launch on edge + health fields + SPA chrome · **public redeployed** |
| Observability & rollback | Green | Monitor alerts + hold probe + GO runbook + **staging drill 2026-10-01** |
| SPA live-book client | Green (gated) | `useDeskMatching` / `useServerMatching`; public stays paper until health `ok` |
| `npm run smoke:matching-go` | Lab | §3 + authz + price band (during drill) |
| `matching_go_staging_drill.sh` | Automated | Live window + rollback HOLD · **re-run 2026-10-01 evening** |
| `npm run smoke:desk` | Automated | book 503 + place 503 + CSRF logout · **PASS 2026-10-01** |
| `npm run smoke:matching-sec` | Automated | CSRF/CORS/cookies/admin/metrics + caps · **PASS 2026-10-01** |
| API `go test` match/httpapi | Automated | HOLD + rollback + self-trade + PathValue cancel |
| API `matching_go_hold_probe.sh` | Automated | Public desk HOLD · **PASS 2026-10-01** |
| Spot live UI smoke | Manual+`smoke:live` | pan/xh · HMC icons hex · Account no circle clip · oracle poll 4s + microtick 700ms · **PASS 2026-10-01** |

**Matching GO §7 signed 2026-10-01** — public `EXCHANGE_TRADING_ENABLED=1` with deposit/withdraw off. Re-run post-GO smokes after flag flip.

### Round3 audit closeout (2026-10-01)

P0/High from `AUDIT_EXCHANGE3_FINAL_RU.md` closed in API+SPA (PathValue cancel, Fired orphan reconcile, convert VIP wash, sslmode omit, trigger cap, tour/Connect/icons/Focus/Deposit HOLD, hub Public preference). Evidence: `~/Desktop/tessssst/AUDIT_EXCHANGE3_CLOSEOUT_20261001.md`. Pool bare `/pool/coordinator` nginx redirect is in repo (hub deploy pending).
