# Security — paper SPA + soft-launch desk

Threat checklist for this **open-source SPA**. Soft-launch matching / HMC·SUP custody are **GO** on the public edge; USDT/BTC real custody remains **HOLD**.

## Paper demo — threat model

| Risk | Mitigation |
|------|------------|
| Fake balances | Labeled **PAPER**; localStorage only (offline) |
| Oracle manipulation | Read-only public stats; display-only pricing |
| XSS in SPA | `escapeHtml` on ledger / search / pool / object-tree / ctx menu / node hrefs |
| Chart color XSS | Sanitize on load + import; re-validate at render |
| Admin token in env | **Never** put tokens in `VITE_*` (Vite inlines into the bundle) |
| Import abuse | Size / shape clamps; drawing + chart sanitizers |
| localStorage pollution | `loadState` strip + clamps |
| Origin spoof | `sanitizeHttpUrl` — `http:` / `https:` only |

**Residual (accepted for paper offline):** synthetic book/tape, client-side paper balances, meta CSP with `'unsafe-inline'`.

**Desk Connect (soft-launch):** browser-local ephemeral Ed25519 seed in `sessionStorage` (never lab fixture, never in paper dist); optional user-initiated seed export/import JSON for multi-device; cookie session + memory-only CSRF against same-origin `/desk-api`. Matching / deposit / withdraw follow server health; withdraw requires per-user TOTP.

**Residual (accepted for desk):** XSS in the SPA origin that can read `sessionStorage` can exfiltrate the desk seed and sign Connect challenges as that `HMC-…` address. Mitigations: `escapeHtml` / import clamps, HTTP CSP, no durable seed in `localStorage`, user-confirm on export, never embed fixture seeds in paper builds. Treat exported backup JSON as a private key. Soft-launch caps + ops withdraw complete limit blast radius.

**This is not a licensed financial system.** Soft-launch caps apply; USDT/BTC custody is not live.

---

## Before any public static host

- [x] Build with **no** `VITE_HACKME_ADMIN_TOKEN`
- [x] `VITE_INTEGRATION_MODE=paper` (live remains blocked)
- [x] Keep `VITE_NODE_ORIGIN` as loopback in public SPA
- [x] HTTP CSP + security headers on paper origin (Caddy on `89.150.41.40`)
- [ ] Self-host fonts or add SRI when convenient

## Soft-launch principles

1. Keys never leave the browser except user-initiated export  
2. Server-authoritative balances after Connect  
3. Session cookies httpOnly + CSRF + CORS allowlist  
4. Withdraw: TOTP + ops complete; no blind auto-payout  
5. Soft-launch caps: max open orders / price band / min notional  
6. Hot wallet on server / HSM — never SPA-signed privileged chain txs  

Before enabling or rolling back public book/orders, complete [`MATCHING_GO_CHECKLIST.md`](MATCHING_GO_CHECKLIST.md).

See also: [`SCOPE.md`](SCOPE.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`STATUS.md`](../STATUS.md).
