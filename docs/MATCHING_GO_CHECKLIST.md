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
Security subset: see `scripts/full_audit.sh`

---

## 2. Matching feature flags

| Flag / health field | HOLD today | GO target |
|---------------------|------------|-----------|
| `matching` | `disabled` | `ok` |
| `deposit.enabled` | `false` | stays **false** until Deposit GO |
| `withdraw.enabled` | `false` | stays **false** until Withdraw GO |
| SPA `useLabMatching()` | loopback CSRF only | **must stay false** on public desk until explicit live mode design |

Public desk Connect must **not** flip `useLabMatching()` — Spot stays paper-mids until a separate live-book client path is reviewed.

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
8. Rate-limit trip → `429` with backoff  
9. After logout → balances/orders unauthorized  

Automate: extend `scripts/desk-connect-smoke.ts` behind `EX_MATCHING_GO=1` (default still asserts HOLD).

---

## 4. Caps & economics

- [ ] Per-address open order count / notional cap  
- [ ] Global notional / rate caps for soft launch  
- [ ] Fee schedule matches SPA (`fees.ts` ↔ API)  
- [ ] HMC fee-pay only if health advertises it  
- [ ] Paper oracle mids **do not** override live book mid when matching live  

---

## 5. Observability & rollback

| Item | Ready? |
|------|--------|
| Matching enable/disable is a **single ops flag** (no redeploy SPA required) | [ ] |
| Metrics: place/cancel latency, 4xx/5xx, 429s, book depth | [ ] |
| Alerts on matching error rate | [ ] |
| Rollback: set `matching=disabled` → SPA pills show HOLD → book 503 | [ ] |
| Cutover marker / changelog entry | [ ] |
| Hub embed still paper-safe if matching OFF | [ ] |

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
| Ops | | | Flag flip plan |
| Security | | | Gates 1.x |
| Product | | | Soft-launch caps |

**GO command (ops only):** enable matching on desk API → verify §3 → announce.  
**ABORT:** disable matching flag immediately; leave deposit/withdraw off.
