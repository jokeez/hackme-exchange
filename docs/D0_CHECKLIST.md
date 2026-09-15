# D0 Paper — ship record

**Soft launch:** 2026-09-15 — static SPA on [exchange.hackme.tech](https://exchange.hackme.tech), **PAPER only** (no public matching API).

Related: [STATUS.md](../STATUS.md) · [HackMe hub](https://github.com/jokeez/hackme)

## Decisions

| Topic | Decision |
|-------|----------|
| Public edge | Static paper SPA — **no** matching API / custody |
| Live mode | Remains **blocked** in SPA |
| Repos | Split: SPA (this repo) + private lab API |
| Hub embed | iframe to `exchange.hackme.tech` |

## Gates (historical — green at ship)

| Gate | How |
|------|-----|
| Unit / UI suite | `npm test` |
| UI smoke | `npm run test:ui-smoke` |
| Production / paper build | `npm run build` · `npm run d0:static` |
| XSS / redteam | vitest security subset |
| STATUS + PAPER badges | in-app + root STATUS |
| Live mode blocked | `isLiveMode()` false |
| Visual (G10) | `npm run test:e2e` |
| Reference mids | HMC **0.05** · SUP **0.01** |
| Hub embed postMessage | `embed.ts` allowlist |

## Explicitly NOT in D0

- Public matching API / custody / withdraw  
- Real USDT/BTC rails · foreign CEX outreach  

## Contributor commands

```bash
npm test && npm run test:ui-smoke && npm run build
npm run d0:static   # optional paper dist gate (gitignored output)
```
