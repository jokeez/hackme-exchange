# Hub Exchange tab

Thin integration: HackMe node dashboard (`#exchange`) embeds this SPA in an iframe with `?embed=hub`.

## Layout

```
Hub (hackme.tech or :8080)  --tab Exchange-->  iframe  exchange.hackme.tech/?embed=hub
```

- SPA code lives in **this repository** (not inside the HackMe git tree).
- Hub tab is **Exchange**, not Market (`#orders` = useful-PoW/fuzz market; HMS Market = storage).
- Node Wallet remains `#wallet` (hub chrome + SPA System → Hub wallet via `postMessage`).
- **Soft-launch GO:** public SPA on `https://exchange.hackme.tech` with same-origin `/desk-api` when `VITE_PUBLIC_DESK_CONNECT=1`. Matching / deposit / withdraw **ON** (ops-gated withdraw + TOTP). Hub (`132…`) must not host the exchange edge.
- **USDT real custody:** still HOLD until partner bridge; paper/lab mint for testing only.

## Embed chrome

With `?embed=hub` (or nested iframe):

- Flat hub background, denser header, no announce / tour / mining strip
- Brand shortens by mode: **Exchange · hub embed · paper** (legacy D0), **· desk** when `VITE_PUBLIC_DESK_CONNECT=1`, **· lab** only on loopback lab builds — never hard-code “lab” on public paper
- Desktop desk forced (Book | Chart+Orders | Markets+Activity) even if iframe &lt; 1024px
- Chart `min-height: 0` + ResizeObserver so canvas scales (no fold / overlap onto Buy/Sell)
- Order zone capped (`max-height: min(28vh, 250px)`, `min-height: 0`) so the chart keeps a usable floor for crosshair in short iframes; **no bottom strip** — Orders / Fills / Tape / Alerts live under Markets (`#activity-body`)
- Account opens with **Deposit & Withdraw** first; Balances / Lab / Activity below
- Hub hides mining status / coin-context / quick-actions so the desk fills the viewport
- System menu drops Mine / Official pool links; keeps Sync + Hub wallet

## Parent postMessage (wallet + route)

SPA → parent (only when `?embed=hub` and referrer/origin allowlisted):

```json
{ "type": "hackme-exchange", "action": "goto-tab", "tab": "wallet" }
```

```json
{ "type": "hackme-exchange", "action": "route", "hash": "#spot/HMC_SUP/1m" }
```

Hub must listen for `message` events, verify `event.origin` is the exchange origin (`https://exchange.hackme.tech` or loopback lab), then:

- `goto-tab` — switch hub chrome tab
- `route` — persist hash in `localStorage.hackme.exchange.hash`, update **Pop out** to `origin/#spot/…`, restore the same hash on iframe reload (`/?embed=hub#spot/…`)

Empty `document.referrer` on production hostname falls back to `https://hackme.tech` as the postMessage target.
## Requirements

1. Static paper build on `https://exchange.hackme.tech` (see `scripts/prepare_d0_static.sh`)
2. Hub node ([hackme](https://github.com/jokeez/hackme)) with `dashboard.html` + CSP `frame-src https://exchange.hackme.tech`
3. **Optional private lab:** loopback override (below) + API on `127.0.0.1:18443`

## CSP

Paper build ships `frame-ancestors` in HTML meta **and** origin must send the same
policy as an **HTTP** `Content-Security-Policy` header. Live origin is **Caddy** on
`89.150.41.40` — see HackMe [`scripts/ops/caddy/exchange.Caddyfile`](https://github.com/jokeez/hackme/blob/main/scripts/ops/caddy/exchange.Caddyfile)
(legacy nginx sketch: `scripts/ops/nginx/hackme-exchange-domain.tls.conf`).
Browsers ignore `frame-ancestors` in `<meta http-equiv>` — header is the real gate.

**Framing check:** `curl -sI https://exchange.hackme.tech/` must show CSP with
`frame-ancestors` including `hackme.tech` and must **not** send `X-Frame-Options: SAMEORIGIN`.
If edge regresses, see [HackMe `docs/EXCHANGE_CF_CSP.md`](https://github.com/jokeez/hackme/blob/main/docs/EXCHANGE_CF_CSP.md).
`npm run smoke:live` asserts HTTP CSP + no `XFO: SAMEORIGIN`.

`frame-ancestors 'self' https://hackme.tech http://127.0.0.1:8080 http://localhost:8080`

## Override SPA origin (private lab dev)

```js
localStorage.setItem('hackme.exchange.origin', 'http://127.0.0.1:5199')
```

Allowed overrides: `https://exchange.hackme.tech`, `http://127.0.0.1:5199`, `http://localhost:5199`.

## Session cookies (hub iframe)

Desk Connect sets `exchange_session` on `exchange.hackme.tech` (same-origin `/desk-api`).
When the SPA is framed by hub (`http://127.0.0.1:8080` or `hackme.tech`), that cookie is
**third-party** relative to the top-level site. Public edge issues
`SameSite=None; Secure; Partitioned` (CHIPS) so the embed partition keeps the session.

If Connect succeeds but balances show **session required** / zeros: use **Pop out**
(standalone desk — first-party cookies) or hard-reload the hub tab after an API redeploy
that includes Partitioned cookies.

## Verdict

**GO** for hub embed + public matching/deposit/withdraw (soft-launch). **HOLD** for real USDT/custody bridge until partner rail.

See also: [`STATUS.md`](../STATUS.md), [`MATCHING_GO_CHECKLIST.md`](MATCHING_GO_CHECKLIST.md). Hub must not host the exchange API edge.
