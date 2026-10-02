# Architecture — paper + soft-launch desk

Topology for the open-source SPA + public soft-launch matching. USDT/BTC real custody remains HOLD until partner bridge.

```text
┌────────────────────────────┐     read-only oracle
│  hackme.tech (hub)         │◄────────────────────┐
│  pool · dashboard · #exchange iframe             │
└────────────┬───────────────┘                     │
             │ iframe / deep link                  │
             ▼                                     │
┌────────────────────────────┐                     │
│  exchange.hackme.tech      │  CF → 89.150.41.40  │
│  static SPA (Caddy)        │  /desk-api → desk   │
│  Desk Connect + matching   │  (soft-launch GO)   │
└────────────────────────────┘                     │
                                                   │
Public desk soft-launch (matching ON)              │
┌────────────────────────────┐                     │
│  exchange-api.hackme.tech  │  CF → Caddy →       │
│  (api.exchange fallback)   │  127.0.0.1:18444    │
└────────────────────────────┘                     │
                                                   │
Private C2 (SSH / loopback) — same VPS             │
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

**Desk Connect (soft-launch GO):** `VITE_PUBLIC_DESK_CONNECT` + same-origin `/desk-api`. Matching / HMC·SUP deposit / withdraw ON (TOTP + ops). Hub VPS must not run the exchange edge.

## Modes

| Mode | Where UI talks | Balances |
|------|----------------|----------|
| **paper** (offline) | nowhere for matching | `localStorage` |
| **desk** (public soft-launch) | `/desk-api` when Connect + health `ok` | server ledger |
| **lab / staging** (contributor) | loopback API `:18443` or tunnel | server ledger |
| **live** | blocked in SPA | — |

## Related

| Doc | Role |
|-----|------|
| [SCOPE.md](SCOPE.md) | Boundaries vs hub |
| [LAB_API.md](LAB_API.md) | SPA ↔ loopback wiring |
| [SECURITY.md](SECURITY.md) | Threat checklist |
| [../STATUS.md](../STATUS.md) | Product GO/HOLD board |
