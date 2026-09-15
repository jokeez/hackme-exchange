# Security — paper SPA

Threat checklist for this **open-source paper UI**. Matching API / custody are **HOLD** on the public edge.

## Paper demo — threat model

| Risk | Mitigation |
|------|------------|
| Fake balances | Labeled **PAPER**; localStorage only |
| Oracle manipulation | Read-only public stats; display-only pricing |
| XSS in SPA | `escapeHtml` on ledger / search / pool / object-tree / ctx menu / node hrefs |
| Chart color XSS | Sanitize on load + import; re-validate at render |
| Admin token in env | **Never** put tokens in `VITE_*` (Vite inlines into the bundle) |
| Import abuse | Size / shape clamps; drawing + chart sanitizers |
| localStorage pollution | `loadState` strip + clamps |
| Origin spoof | `sanitizeHttpUrl` — `http:` / `https:` only |

**Residual (accepted for paper):** no auth, synthetic book/tape, client-side balances, meta CSP with `'unsafe-inline'`.

**This is not a financial system.** Do not treat paper settlement as production custody.

---

## Before any public static host

- [x] Build with **no** `VITE_HACKME_ADMIN_TOKEN`
- [x] `VITE_INTEGRATION_MODE=paper` (live remains blocked)
- [x] Keep `VITE_NODE_ORIGIN` as loopback in public SPA
- [ ] Prefer HTTP CSP headers in addition to meta (hosting-side)
- [ ] Self-host fonts or add SRI when convenient

## Principles (when matching/custody land later)

1. Keys never in the browser  
2. Server-authoritative balances  
3. Session cookies httpOnly + CSRF + CORS allowlist  
4. Hot wallet on server / HSM — never SPA-signed privileged chain txs  

See also: [`SCOPE.md`](SCOPE.md) · [`STATUS.md`](../STATUS.md).
