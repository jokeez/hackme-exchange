# Stop / OCO design (Phase-2 lab)

> **STALE mirror.** Canonical status: API [`STOP_OCO_DESIGN.md`](../../hackme-exchange-api/docs/STOP_OCO_DESIGN.md) — `stop_limit` / `stop_market` / `oco` / `trailing_stop` are **live** in lab.  
> Loopback lab only — no public deploy.

## Goals

1. Mirror demo SPA advanced orders (stop-limit, trailing stop, OCO) on the server with correct reserves.
2. Keep price-time matching pure: triggers **arm** resting limit/market children; they do not invent fill prices.
3. Survive API restart (orders + trigger state in SQLite alongside the persisted book).

## Order types (API)

| `type` | Status | Notes |
|--------|--------|-------|
| `limit` | **Live** | Resting book; already persisted |
| `market` | **Live** | Immediate; buy needs price ceiling |
| `stop_limit` | Designed | Trigger → place limit |
| `stop_market` | Designed | Trigger → place market (buy needs ceiling stored at arm) |
| `trailing_stop` | Designed | Dynamic stop vs mark; then market/limit child |
| `oco` | Designed | One-cancels-other pair (limit + stop_limit) |

Unsupported types today return **HTTP 501** with `code: unsupported_type` (see `POST /orders`).

### Proposed place body extensions

```json
{
  "pair": "HMC/USDT",
  "side": "sell",
  "type": "stop_limit",
  "qty": 100000000,
  "price": 40000,
  "stop_price": 39000,
  "trigger": "last"
}
```

OCO:

```json
{
  "pair": "HMC/USDT",
  "side": "sell",
  "type": "oco",
  "qty": 100000000,
  "price": 45000,
  "stop_price": 39000,
  "stop_limit_price": 38500
}
```

## Trigger vs matching

```
mark / last / book mid
        │
        ▼
┌───────────────────┐
│  Trigger watcher  │  (poll or on-fill hook; not inside match lock)
│  armed stop/OCO   │
└─────────┬─────────┘
          │ fires once
          ▼
┌───────────────────┐
│  Child Place()    │  limit/market into existing Engine
│  same account     │
└───────────────────┘
```

- Matching engine stays **limit/market only**.
- Trigger service holds `armed` rows; on fire, calls `Engine.Place` (or cancels sibling for OCO).
- Self-trade prevention unchanged.

## Reserve rules

| Type | Reserve at arm | On trigger | On cancel |
|------|----------------|------------|-----------|
| `stop_limit` sell | Base qty | Release arm reserve → reserve for child limit | Release |
| `stop_limit` buy | Quote for limit price + taker fee buffer | Same → child limit | Release |
| `stop_market` sell | Base qty | → market sell | Release |
| `stop_market` buy | Quote for stored ceiling + fee | → market buy | Release |
| `trailing_stop` | Same as stop_market (or stop_limit if limit child) | Recalc stop vs peak; then child | Release |
| `oco` | Max(limit reserve, stop reserve) **or** sum with note — **prefer max** for sell base (same qty); for buy quote use **max** of the two notional+fee buffers | Winning leg Place; cancel sibling + release unused | Release all |

**Invariant:** reserved ledger ≥ sum of armed + resting child reserves; never double-spend.

## Persistence (planned tables)

```sql
-- armed triggers (not yet on book)
CREATE TABLE trigger_orders (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  pair TEXT NOT NULL,
  side TEXT NOT NULL,
  type TEXT NOT NULL,           -- stop_limit | stop_market | trailing_stop | oco
  qty INTEGER NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,       -- limit / stop-limit price
  stop_price INTEGER NOT NULL,
  trail_bps INTEGER NOT NULL DEFAULT 0,
  trigger_ref TEXT NOT NULL DEFAULT 'last', -- last | mark | index
  oco_group TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,          -- armed | fired | canceled
  reserved_asset TEXT NOT NULL,
  reserved_amt INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Open book orders remain in `open_orders` (already shipped).

## SPA mapping (`hackme-exchange-demo`)

| UI control | Today | After server Stop/OCO |
|------------|-------|------------------------|
| Limit / market | Lab → `POST /orders` | unchanged |
| Stop-limit / trailing / OCO | **Paper-local** (`source: paper`) | Lab → `POST /orders` with new types; keep paper if API unset |
| Open list | Merge server + paper advanced | Prefer server; drop local dupes |
| Cancel | Server id vs paper id | Cancel trigger id via `DELETE /orders/{id}` (armed) or book id |

`isLiveMode()` stays **false**; lab uses `liveSettlement` / `isLabApiEnabled()` only.

## Minimal ship (this pass)

1. Document this design.
2. Reject `stop`, `stop_limit`, `trailing`, `oco`, etc. with **501** + clear message.
3. Persist limit/market book (separate milestone — done in parallel).

## Next implementation slices

1. `trigger_orders` table + `POST /orders` accept `stop_limit` (armed only, no fire yet) + cancel.
2. On each fill / periodic mark tick: fire armed stops → child Place.
3. OCO group cancel-sibling.
4. Trailing peak tracking.
5. Demo: route advanced panel to API when lab session present.

## Test plan (when implementing)

- Arm stop_limit sell; mark never hits → still armed after restart.
- Mark crosses stop → child resting/fills; reserve math exact.
- OCO: limit fills → stop canceled; stop fires → limit canceled.
- Reject unknown type still 400; unsupported documented types 501 until enabled.
- Auth + CSRF + rate limits on place/cancel unchanged.
