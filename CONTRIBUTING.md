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
| **This repo** | Open-source paper Spot SPA |
| Matching API | Private sibling (optional loopback lab) |

## Pull requests

- Keep changes focused (UI, docs, or lab wiring).
- Do not enable a public matching API or custody path in the SPA without an explicit product decision.
- Do **not** commit `.env`, tarballs (`hackme-exchange-d0-*.tar.gz`), `dist/`, `dist-d0/`, `.cache/`, or `docs/.local/`.

## QA before merge

```bash
npm test
npm run build
# optional
npm run d0:static
npm run test:e2e   # needs Vite on :5199
```

See [scripts/README.md](scripts/README.md) for maintainer extras.

## Secrets

- Do not put admin tokens in `VITE_*` (inlined into the browser bundle).
- Lab fixture seeds are for localhost only.
- Prefer CLI admin headers against loopback — never embed in SPA source.

## License

Contributions are under **[AGPL-3.0](LICENSE)** (same as [HackMe](https://github.com/jokeez/hackme)).

## Reference mids

Paper defaults: **0.05** USDT/HMC · **0.01** USDT/SUP. Do not reintroduce GH-based mid multipliers without a product decision.
