# Pre-public checklist (demo mirror) — full detail in hackme-exchange-api/docs/PRE_PUBLIC_CHECKLIST.md

> Loopback lab only until every P0 passes. Public = HOLD.

## Hard gates

| # | Check |
|---|--------|
| P0-1 | Loopback bind (no `ALLOW_PUBLIC_BIND` without ops plan) |
| P0-2 | Strong JWT secret, not in git |
| P0-3 | Empty `ADMIN_TOKEN` on `PUBLIC_EDGE` (hard refuse if set) |
| P0-4 | CSRF header on mutating routes |
| P0-5 | Exact CORS origins (no `:*` on edge) |
| P0-6 | Lab mint/MM **default OFF**; refuse with edge |
| P0-7 | `TRUSTED_PROXIES` + XFF rightmost-untrusted |
| P0-13 | Fresh DB — no repo-known MM/counterparty/fixture residue |
| P0-14 | Withdrawals default **off** on edge |
| P0-16 | `/metrics` + OpenAPI 404 on edge |

```bash
EXCHANGE_PUBLIC_EDGE=1
EXCHANGE_TRUSTED_PROXIES=127.0.0.1
EXCHANGE_ADMIN_TOKEN=
EXCHANGE_LAB_ENDPOINTS=0
EXCHANGE_LAB_MM=0
```

**Verdict:** Lab GO for localhost with `LAB_*=1`. Public HOLD until VPS + checklist.
