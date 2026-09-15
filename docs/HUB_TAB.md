# Hub Exchange tab

Thin integration: HackMe node dashboard (`#exchange`) embeds this SPA in an iframe with `?embed=hub`.

## Layout

```
Hub (hackme.tech or :8080)  --tab Exchange-->  iframe  exchange.hackme.tech/?embed=hub
```

- SPA code lives in **this repository** (not inside the HackMe git tree).
- Hub tab is **Exchange**, not Market (`#orders` = useful-PoW/fuzz market; HMS Market = storage).
- Node Wallet remains `#wallet` (hub chrome + SPA System → Hub wallet via `postMessage`).
- **D0 default:** static paper SPA on `https://exchange.hackme.tech` — no public matching API.

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

1. Static paper build on `https://exchange.hackme.tech` (see `scripts/prepare_d0_static.sh`)
2. Hub node ([hackme](https://github.com/jokeez/hackme)) with `dashboard.html` + CSP `frame-src https://exchange.hackme.tech`
3. **Optional private lab:** loopback override (below) + API on `127.0.0.1:18443`

## CSP

Paper build `frame-ancestors`:

`frame-ancestors 'self' https://hackme.tech http://127.0.0.1:8080 http://localhost:8080`

## Override SPA origin (private lab dev)

```js
localStorage.setItem('hackme.exchange.origin', 'http://127.0.0.1:5199')
```

Allowed overrides: `https://exchange.hackme.tech`, `http://127.0.0.1:5199`, `http://localhost:5199`.

## Verdict

**GO** for hub paper embed. **HOLD** for public matching API / real custody.
