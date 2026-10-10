<div align="center">

# HackMe Exchange — Status

**Updated:** 2026-10-09 · **Source:** public · **Product:** soft-launch desk · **Matching / HMC·SUP custody:** **Full GO**

[![Paper site](https://img.shields.io/badge/paper-exchange.hackme.tech-7fe7ff?style=for-the-badge)](https://exchange.hackme.tech)
[![Main HackMe](https://img.shields.io/badge/main_repo-jokeez%2Fhackme-00d1ff?style=for-the-badge&logo=github&logoColor=white)](https://github.com/jokeez/hackme)
[![Matching](https://img.shields.io/badge/matching_API-soft--launch_GO-39ff14?style=for-the-badge)](docs/MATCHING_GO_CHECKLIST.md)
[![CI](https://img.shields.io/github/actions/workflow/status/jokeez/hackme-exchange/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/jokeez/hackme-exchange/actions)

**[🏠 Main HackMe](https://github.com/jokeez/hackme)** · **[hackme.tech](https://hackme.tech)** · **[README](README.md)** · **[Docs](docs/README.md)**

</div>

---

## At a glance

| Layer | Status |
|-------|--------|
| **This repo (source)** | Open (AGPL) — Spot SPA (paper + desk Connect) |
| **Paper / desk site** | [exchange.hackme.tech](https://exchange.hackme.tech) — static UI on **`89.150.41.40`** (Caddy) + same-origin `/desk-api` |
| **Desk matching** | **GO** — `matching: ok` · `max_open_orders=96` · `price_band_bps=1500` · `min_notional=1e6` · Soft-MM tape |
| **Desk deposit** | **GO** — HMC/SUP deposit addresses; Connect addr ≠ deposit; node-watch via ops-admin |
| **Desk withdraw** | **GO** — request + **per-user TOTP/recovery**; ops completes via loopback admin (`:18445`) |
| **USDT** | BSC BEP-20 **watch** + stub KYT **manual** (no Didit / no hot-send) |
| **BTC custody** | **HOLD** until dedicated cutover |
| **Live mode in SPA** | **Blocked** (no `VITE_INTEGRATION_MODE=live` on public) |
| **Desk Connect** | `VITE_PUBLIC_DESK_CONNECT=1` → `/desk-api` · seed export/import · 2FA enroll |

Hub iframe (`hackme` `#exchange`) embeds **Public** desk only (Local Vite embed removed).

Balances on paper Spot without Connect stay in `localStorage`. Desk balances are ledger-backed after Connect. Not financial advice. Not a licensed exchange.

## Ecosystem

| Project | Link |
|---------|------|
| **HackMe hub** | [github.com/jokeez/hackme](https://github.com/jokeez/hackme) · [hackme.tech](https://hackme.tech) |
| **Paper / desk SPA** | [exchange.hackme.tech](https://exchange.hackme.tech) · this repo (`jokeez/hackme-exchange`) |
| **Desk API** | Same-origin `/desk-api` on exchange origin (staging loopback behind Caddy) |

## Messaging

Own HMC market desk — **not** a third-party listing claim:

| Phase | What |
|-------|------|
| **Now** | Soft-launch: matching + HMC/SUP deposit/withdraw + TOTP |
| **Next** | Partner USDT/BTC bridge · raise soft-launch caps after soak |
| **Foreign CEX** | Not part of soft launch |

Pool: useful-PoW → [hackme.tech](https://hackme.tech/). No ROI promises.

## Modes

| Mode | Meaning |
|------|---------|
| **paper** (default build) | Desk Connect optional · reference mids when offline |
| **lab** | Loopback API for contributors |
| **live** | Blocked until an explicit product go-live |

## Pricing (reference)

| Asset | Reference | Notes |
|-------|-----------|-------|
| HMC/USDT | **~0.05** | Soft-launch mid; not pool-GH scaled |
| SUP/USDT | **~0.25** | Same |
| HMC/SUP | **~0.2** | Cross = HMC÷SUP |

See [`docs/ECONOMICS.md`](docs/ECONOMICS.md).

## What this is NOT

- Not a licensed exchange · not financial advice  
- Not real USDT/BTC on-chain custody yet  
- Not unlimited withdraw (soft-launch caps + ops complete)  
- Not a promise of foreign CEX listing  

## Roadmap

| Gate | Intent |
|------|--------|
| **D0 Paper** | Static SPA — **shipped** |
| **Soft-launch matching** | Caps + desk book/orders — **GO** |
| **HMC/SUP custody** | Deposit addr + withdraw+2FA + ops complete — **GO** |
| **USDT custody** | BSC watch + stub KYT **manual** (no Didit / no hot-send) |
| **BTC custody** | Partner rail — **HOLD** |
| **Full GO** | Raise/remove soft-launch caps after soak |

## Docs

- [`docs/README.md`](docs/README.md) — index  
- [`docs/MATCHING_GO_CHECKLIST.md`](docs/MATCHING_GO_CHECKLIST.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/SCOPE.md`](docs/SCOPE.md)  

Operator smokes: `npm run smoke:desk` · `smoke:matching-go` · `smoke:operator` · `smoke:lab` (with `EX_MATCHING_GO=1 EX_CUSTODY_GO=1` on public).
