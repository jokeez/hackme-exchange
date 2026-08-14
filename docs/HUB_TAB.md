# Hub Exchange tab (private lab)

Thin integration: HackMe node dashboard (`http://127.0.0.1:8080/#exchange`) embeds this SPA in an iframe with `?embed=hub`.

## Layout

```
Hub :8080  --tab Exchange-->  iframe  :5199/?embed=hub  -->  API :18443
```

- SPA code stays in `hackme-exchange-demo` (not inside the HackMe git tree).
- Hub tab is **Exchange**, not Market (`#orders` = useful-PoW/fuzz market; HMS Market = storage).
- Node Wallet remains `#wallet` (hub chrome + SPA System → Hub wallet via `postMessage`).

## Embed chrome

With `?embed=hub` (or nested iframe):

- Flat hub background, denser header, no announce / tour / mining strip
- Brand shortens to **Exchange · hub embed · lab**
- Desktop desk forced (Book | Chart+Orders | Markets+Activity) even if iframe &lt; 1024px
- Chart `min-height: 0` + ResizeObserver so canvas scales (no fold / overlap onto Buy/Sell)
- Order form taller hub (~300–380px) so Buy/Sell fit without cramped scroll; **no bottom strip** — Orders / Fills / Tape / Alerts live in the right column under Markets (`#activity-body`)
- Account opens with **Deposit & Withdraw** first; Balances / Lab / Activity below
- Hub hides mining status / coin-context / quick-actions so the desk fills the viewport

## Requirements

1. `hackme-exchange-demo` on `127.0.0.1:5199`
2. `hackme-exchange-api` on `127.0.0.1:18443`
3. Hub node with rebuilt `dashboard.html` on `:8080`

## CSP

`frame-ancestors 'self' http://127.0.0.1:8080 http://localhost:8080`

## Override SPA origin

```js
localStorage.setItem('hackme.exchange.origin', 'http://127.0.0.1:5199')
```

## Verdict

**GO** for private lab (loopback). **HOLD** for public bind / real USDT custody.
