# Withdrawals (lab custody stub)

> **NOT production custody.** No HSM, no browser-side hot wallet, no admin tokens in the SPA.

## Flow

```
User (session+CSRF [+ TOTP if enabled])
  POST /withdraw { asset, amount, destination, totp_code? }
       → reserve ledger → status=pending
Operator (X-Admin-Token, never in SPA)
  POST /admin/withdraw/complete { id, tx_id }
       → burn reserved → status=completed
  or
  POST /admin/withdraw/fail { id, fail_reason }
       → release reserved → status=failed
```

SPA Account → **Lab custody · Deposit & withdraw** can request + list status. Admin complete remains CLI/API only.

Optional dry-run: admin supplies any `tx_id` (e.g. `lab-dry-run-1`) without calling a node. Real HMC send (if any) must be done by an operator process using `EXCHANGE_NODE_ORIGIN` + signing keys **outside** the browser.

## 2FA (lab TOTP)

| Env | Default | Meaning |
|-----|---------|---------|
| `EXCHANGE_WITHDRAW_REQUIRE_2FA` | `0` | When `1`, require valid TOTP |
| `EXCHANGE_TOTP_LAB_SEED` | unset | Base32 seed (≥10 bytes decoded); required if 2FA=1 |

Client: header `X-2FA-Code` **or** body `totp_code`. Algorithm: RFC 6238 HMAC-SHA1, 30s, 6 digits, ±1 window. Lab shared seed — not per-user enrollment (future work).

## Guards

| Guard | Default / env |
|-------|----------------|
| Session + CSRF | Required (logout also denylists JWT jti) |
| Rate limit | Trade limiter (`EXCHANGE_TRADE_RATE_PER_MIN`) |
| Min amount | `EXCHANGE_WITHDRAW_MIN` (default 1e6 minor = 0.01) |
| Daily cap | `EXCHANGE_WITHDRAW_DAILY_CAP` (pending+completed, UTC day) |
| Destination | HMC: valid `HMC-`+16hex; not self; not own deposit addr. USDT/BTC/SUP: stub dest (≥8 chars, not HMC-/labdep) |
| 2FA | Off unless `EXCHANGE_WITHDRAW_REQUIRE_2FA=1` |
| Disable | `EXCHANGE_WITHDRAW_ENABLED=0` |
| Admin complete/fail | Token ≥32 chars; rate-limited; disabled if token empty |

## Demo curl

```bash
# After lab login cookies+csrf:
# POST /withdraw {"asset":"HMC","amount":5000000,"destination":"HMC-ffffffffffffffff"}
# With 2FA: -H "X-2FA-Code: $(oathtool --totp -b $EXCHANGE_TOTP_LAB_SEED)"
# POST /admin/withdraw/complete -H "X-Admin-Token: …" {"id":"…","tx_id":"lab-dry-run-1"}
# GET /withdrawals
```
