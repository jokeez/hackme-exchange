# Contributing — HackMe Exchange (SPA)

## Setup

```bash
npm install
npm test
npm run build
npm run dev   # http://127.0.0.1:5199
```

Copy `.env.example` → `.env` for local overrides. **Never commit `.env`.**

## Ecosystem

| Repo | Role |
|------|------|
| [hackme](https://github.com/jokeez/hackme) | Hub · pool · node |
| [hackme-exchange-api](https://github.com/jokeez/hackme-exchange-api) | Private lab matching |
| [hackme-exchange](https://github.com/jokeez/hackme-exchange) | This SPA |

## Pull requests

- Keep changes focused (UI, docs, or lab wiring — not mixed with public-edge work).
- Soft **D0** ships static paper UI only — do not enable a public matching API in the same change set.
- Author identity should match the project’s existing GitHub account.
- Do **not** commit dry-run dumps, tarballs (`hackme-exchange-d0-*.tar.gz`), `.cache/`, or `docs/.local/`.

## Secrets

- Do not put admin tokens in `VITE_*` (inlined into the browser bundle).
- Lab fixture seeds are for localhost only.
- Prefer `X-Admin-Token` via CLI against loopback — never embed in SPA source.

## License

Contributions are under **[AGPL-3.0](LICENSE)** (same as [HackMe](https://github.com/jokeez/hackme)).

## Reference mids

Paper / soft defaults: **0.05** USDT/HMC · **0.01** USDT/SUP. Do not reintroduce GH-based mid multipliers without an ops decision.
