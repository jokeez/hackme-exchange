# Integration — origins, proxies, architecture

> Paper SPA: [exchange.hackme.tech](https://exchange.hackme.tech/) · optional lab API on **loopback only**.  
> Hub embed: [`HUB_TAB.md`](HUB_TAB.md). Boundaries: [`SCOPE.md`](SCOPE.md).

## Architecture

```
exchange.hackme.tech (static SPA, paper default)
        │
        ├─► hackme.tech — pool oracle, hub iframe
        ├─► hackme-node :8080 — optional local HMC/SUP wallet read
        └─► exchange-api :18443 — lab only (127.0.0.1)
```

**Public edge:** no matching API, no custody.

## Paper static build

```bash
npm run d0:static   # → dist-d0/ + tarball (both gitignored)
```

Publish the static bundle with your own hosting pipeline. This repo does **not** include production deploy recipes.

### Build-time env

Copy `.env.example` → `.env`:

```env
VITE_INTEGRATION_MODE=paper
VITE_EXCHANGE_ORIGIN=https://exchange.hackme.tech
VITE_HUB_ORIGIN=https://hackme.tech
VITE_NODE_ORIGIN=http://127.0.0.1:8080
```

Never bake `VITE_HACKME_ADMIN_TOKEN` into a public bundle — Vite inlines `VITE_*` into the browser.

## Local wallet (`127.0.0.1:8080`)

Optional Sync against a local `hackme-node`:

1. `GET {VITE_NODE_ORIGIN}/api/wallet`
2. Maps HMC/SUP into the paper wallet (USDT/BTC stay paper)

Requires CORS or a same-origin Vite proxy in dev.

## Dev proxy (Vite)

| Prefix | Target | Purpose |
|--------|--------|---------|
| `/pool-proxy` | `hackme.tech/pool/coordinator` | Oracle |
| `/hub-proxy` | `hackme.tech` | Hub pages |
| `/exchange-api` | `127.0.0.1:18443` | Optional lab API |

## Paper execution

- Instant fill via `execution.ts` + `localStorage`
- Fees in `fees.ts` — see [`ECONOMICS.md`](ECONOMICS.md)

## Later (not D0)

Matching service, deposit watchers, hot/cold wallet policy, and enabling `live` mode are **out of scope** for the paper soft launch. See [`STATUS.md`](../STATUS.md).
