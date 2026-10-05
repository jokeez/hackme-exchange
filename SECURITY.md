# Security policy — HackMe Spot (soft-launch desk)

## Supported

Current `main` / published desk at [exchange.hackme.tech](https://exchange.hackme.tech).

## Reporting

**Do not** open public GitHub issues for exploitable security bugs.

1. Contact: [https://hackme.tech/contacts.html](https://hackme.tech/contacts.html)
2. Include repro steps, impact, and browser/OS if relevant.

## Scope

In scope: XSS, auth/session issues in the SPA, desk seed handling, CSRF/cookie bugs,
supply-chain issues in dependencies, leaks of secrets via the client.

Out of scope: paper-trading P&L disputes, third-party wallet extensions, phishing
clones of the desk (report those to us + the host).

**Soft-launch:** public matching + HMC/SUP custody (deposit / TOTP withdraw) are live
behind soft caps. USDT/BTC real custody remains HOLD. Treat the browser desk seed as a
private key (durable in `localStorage` until Clear wallet / Logout).
