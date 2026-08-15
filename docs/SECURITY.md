# Security Model — Exchange Demo → Production

> Canonical API threat model / hosting / lab ops:  
> [THREAT_MODEL](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/THREAT_MODEL.md) ·
> [HOSTING](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/HOSTING.md) ·
> [PRIVATE_LAB](https://github.com/jokeez/hackme-exchange-api/blob/main/docs/PRIVATE_LAB.md)  
> This file is the **demo SPA** checklist + production principles.

## Demo (current) — threat model

| Risk | Mitigation |
|------|------------|
| Fake balances | Clearly labeled **demo**; localStorage only |
| No auth | Acceptable for local UI prototype |
| Oracle manipulation | Read-only public stats; display-only pricing |
| XSS in SPA | `escapeHtml` on ledger / market search / pool / object-tree / ctx menu / node hrefs; canvas text not HTML |
| Chart color XSS | `sanitizeCssColor` / `sanitizeCandleStyle` / `sanitizeIndicatorConfig` on load + import; color inputs re-validated at render |
| Admin token in env | **Never read** `VITE_HACKME_ADMIN_TOKEN` in SPA source (Vite would inline it). CLI/node only |
| Import abuse | `parseDemoImport` rejects bad shape, clamps NaN / sizes / 2MB; `sanitizeDrawings` + chart colors + `stripPollutionKeys` |
| localStorage pollution | `loadState` uses `stripPollutionKeys` + same clamps as import (`oracleAnchor`, ledger enums, chart settings, ids) |
| Origin spoof | `sanitizeHttpUrl` — only `http:` / `https:` for hub/pool/node; `openInNewTab` same |
| Chart text XSS | Labels truncated; Object Tree escapes `text` / `id` |

**Residual (accepted for demo):** no auth, synthetic book/tape, client-side paper balances, CSP is meta-only with `'unsafe-inline'` (preview servers may omit headers), Google Fonts without SRI, no rate limits (no backend yet), measure/drawings are client-local only.

**Demo is not a financial system.** Do not deploy demo settlement to production without backend.

---

## Phase-2 security checklist

### Must before any public static host

- [ ] Build with **no** `VITE_HACKME_ADMIN_TOKEN` (prod strip is belt-and-suspenders — still omit from CI secrets)
- [ ] Keep `VITE_NODE_ORIGIN` as loopback in public SPA (Sync / Node wallet links stay local)
- [ ] Confirm `VITE_INTEGRATION_MODE` is `demo` or `paper` (never rely on `live` until exchange-api)
- [ ] Serve with HTTP CSP headers (not only the meta tag) — drop `'unsafe-inline'` for scripts when theme boot can move to nonce/hash
- [ ] Self-host fonts or add SRI to Google Fonts stylesheet
- [ ] Wipe / ignore demo `localStorage` keys before any live-mode cutover

### Auth / session (when exchange-api lands)

- [ ] No admin token in browser; session JWT in httpOnly + Secure + SameSite cookie
- [ ] CSRF protection + CORS allowlist (`exchange.hackme.tech` only)
- [ ] Server-authoritative balances; reject client balance overrides
- [ ] Never call `POST /api/tx/send` from the SPA with privileged credentials

### P1 backlog (documented, not blocking local Phase-2 demo)

| ID | Item | Notes |
|----|------|-------|
| P1-1 | Tighten CSP | Meta CSP still allows `'unsafe-inline'` for theme boot + inline styles |
| P1-2 | Font SRI / self-host | Google Fonts CDN has no integrity attribute (HackMe FC-02 pattern, lower severity here — no sessionStorage admin token) |
| P1-3 | Header CSP on preview/nginx | Meta-only CSP is bypassable if HTML is injected earlier |
| P1-4 | Color/`style=` allowlists | Pair colors are static registry; keep that way |
| P1-5 | Dependency watch | `npm audit` clean as of 2026-07-23; re-run before release |
| P1-6 | Live-mode gate | `isLiveMode()` always false until API exists — keep tests asserting this |

---

## Production — principles

### 1. Keys never in the browser

- User **seed / admin token** only on loopback node or HSM
- Exchange hot wallet keys on server, encrypted at rest
- Browser gets session JWT only (httpOnly cookie)

### 2. Separation of duties

| Layer | Trust |
|-------|-------|
| Static SPA (`exchange.hackme.tech`) | Untrusted client |
| Exchange API | Authoritative ledger |
| hackme-node | Chain truth for HMC/SUP |
| Coordinator | Work/accrual, not user balances |

### 3. Transfers

- **Never** call `POST /api/tx/send` from browser with embedded admin token in prod
- Withdrawals: user auth → API validates 2FA → server signs → audit log
- Min fee enforcement (1000 Kapa) server-side

### 4. API hardening (future exchange-api)

- TLS 1.2+ only
- Rate limit per IP + per account
- Idempotency keys on withdraw/deposit
- CSRF on cookie auth; CORS allowlist (`exchange.hackme.tech` only)
- Input validation: amounts as integer Kapa, addresses `HMC-[16 hex]`

### 5. nginx (reference from main site)

- Public: GET oracle endpoints only
- Mutating node routes: localhost or admin token
- Block generic `POST /api/` on public hub where possible

### 6. Deposit watching

- Confirmations policy documented with exchange listing memo
- No credit until N confirmations (agree with CEX integrators)
- Reorg policy: follow `consensus_policy` from `GET /api/status`

### 7. USDT/BTC/XMR custodial

- Separate vault accounts per asset
- Proof-of-reserves process (optional)
- XMR: extra care for view-key privacy vs audit

---

## localStorage migration warning

When switching `VITE_INTEGRATION_MODE=live`:

- Disable or wipe demo keys (`hackme-exchange-demo-v*` in `theme.ts` STORAGE_KEY)
- Force server-side session; reject client-side balance overrides

---

## Incident response (production)

1. Pause withdrawals (feature flag)
2. Rotate hot wallet if compromised
3. Publish status on `hackme.tech` news feed
4. Preserve audit logs (trades, tx hashes)

---

## Files to review before audit

| HackMe main repo | Purpose |
|------------------|---------|
| `docs/EXCHANGE_LISTING_WALLET_PREP.md` | HMC wire format |
| `docs/API.md` | Transfer API |
| `spec/CHAIN_SPEC.md` | `transfer_v1` signing |
| `admin_auth.go` | Token auth |
| `scripts/ops/nginx/hackme-site-domain.tls.conf` | Public surface |

| Demo repo | Purpose |
|-----------|---------|
| `src/adapters/settlement.ts` | Settlement boundary |
| `src/config/integration.ts` | Mode switch |
| `src/adapters/nodeWallet.ts` | Read-only node client |
| `src/chartDraw.ts` | Drawing / import sanitizers |
| `src/demoIo.ts` | Export/import gate |
