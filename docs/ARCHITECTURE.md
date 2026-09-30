# Architecture — paper SPA

Topology sketch for the **open-source paper desk**. Matching / custody stay off the public edge until an explicit GO.

```text
┌────────────────────────────┐     read-only oracle
│  hackme.tech (hub)         │◄────────────────────┐
│  pool · dashboard · #exchange iframe             │
└────────────┬───────────────┘                     │
             │ iframe / deep link                  │
             ▼                                     │
┌────────────────────────────┐                     │
│  exchange.hackme.tech      │  CF → 89.150.41.40  │
│  static paper SPA (Caddy)  │  no matching proxy  │
└────────────────────────────┘                     │
                                                   │
Private (SSH / loopback only) — HOLD               │
┌────────────────────────────┐                     │
│  89.150.41.40              │                     │
│  exchange-api staging      │  127.0.0.1:18444    │
│  TLS wrapper               │  127.0.0.1:8443     │
│  Postgres                  │  127.0.0.1:54330    │
└────────────────────────────┘                     │
                                                   │
┌────────────────────────────┐                     │
│  132.243… mining hub       │  pool / node only   │
│  hackme-node :18080        │  (not exchange edge)│
└────────────────────────────┘                     │
```

## Modes

| Mode | Where UI talks | Balances |
|------|----------------|----------|
| **paper** (default / public) | nowhere for matching | `localStorage` |
| **lab / staging** (contributor) | loopback API `:18443` or tunnel | server ledger |
| **live** | blocked in SPA | — |

## Related

| Doc | Role |
|-----|------|
| [SCOPE.md](SCOPE.md) | Boundaries vs hub |
| [LAB_API.md](LAB_API.md) | SPA ↔ loopback wiring |
| [SECURITY.md](SECURITY.md) | Paper threat checklist |
| [../STATUS.md](../STATUS.md) | Product HOLD board |
