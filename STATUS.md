<div align="center">

# HackMe Exchange — Status

**Updated:** 2026-09-15 · **Source:** public · **Product:** paper SPA · **Matching / custody:** **HOLD**

[![Paper site](https://img.shields.io/badge/paper-exchange.hackme.tech-7fe7ff?style=for-the-badge)](https://exchange.hackme.tech)
[![Main HackMe](https://img.shields.io/badge/main_repo-jokeez%2Fhackme-00d1ff?style=for-the-badge&logo=github&logoColor=white)](https://github.com/jokeez/hackme)
[![Matching](https://img.shields.io/badge/matching_API-HOLD-ff6b9d?style=for-the-badge)](docs/SCOPE.md)

**[🏠 Main HackMe](https://github.com/jokeez/hackme)** · **[hackme.tech](https://hackme.tech)** · **[README](README.md)** · **[Docs](docs/README.md)**

</div>

---

## At a glance

| Layer | Status |
|-------|--------|
| **This repo (source)** | Open (AGPL) — paper Spot SPA |
| **Paper site** | [exchange.hackme.tech](https://exchange.hackme.tech) — static UI |
| **Public matching API** | **HOLD** |
| **Real custody / withdrawals** | **HOLD** (none in the browser) |
| **Live mode in SPA** | **Blocked** |

Balances are simulated (`localStorage`). Not financial advice. Not a licensed exchange.

## Ecosystem

| Project | Link |
|---------|------|
| **HackMe hub** | [github.com/jokeez/hackme](https://github.com/jokeez/hackme) · [hackme.tech](https://hackme.tech) |
| **Paper SPA** | [exchange.hackme.tech](https://exchange.hackme.tech) · this repo |
| **Matching API** | Private sibling lab — not on the public edge |

## Messaging

Own HMC market desk — **not** a third-party listing claim:

| Phase | What |
|-------|------|
| **Now (D0)** | Open-source paper UI + live static site |
| **Later** | Matching / custody only after explicit security gates |
| **Foreign CEX** | Not part of soft paper launch |

Pool: useful-PoW → [hackme.tech](https://hackme.tech/). No ROI promises.

## Modes

| Mode | Meaning |
|------|---------|
| **paper** (default) | localStorage · reference mids — **not** custody |
| **lab** | Loopback API for contributors — still not public |
| **live** | Blocked until an explicit product go-live |

## Pricing (paper)

| Asset | Reference | Notes |
|-------|-----------|-------|
| HMC/USDT | **0.05** | Mild drift; **not** scaled by pool GH |
| SUP/USDT | **0.01** | Same |
| HMC/SUP | **5.0** | Cross = HMC÷SUP |

See [`docs/ECONOMICS.md`](docs/ECONOMICS.md).

## What this is NOT

- Not a licensed exchange · not financial advice  
- Not real USDT/BTC custody in the browser  
- Not public matching / withdrawals on `exchange.hackme.tech`  
- Not a promise of foreign CEX listing  

## Roadmap (aspirational)

| Gate | Intent |
|------|--------|
| **D0 Paper** | Static SPA, PAPER only — **shipped** |
| **D1** | Real HMC/SUP rails after custody gates |
| **D2+** | Stables / further rails — TBD |

## Docs

- [`docs/README.md`](docs/README.md) — index  
- [`docs/SCOPE.md`](docs/SCOPE.md) · [`docs/ECONOMICS.md`](docs/ECONOMICS.md) · [`docs/SECURITY.md`](docs/SECURITY.md)  
- [`docs/D0_CHECKLIST.md`](docs/D0_CHECKLIST.md) — historical ship record  

No public withdrawal support until custody ships.
