# Contributing — HackMe Exchange (SPA)

## Setup

```bash
npm install
npm test
npm run build
```

Copy `.env.example` → `.env` for local overrides. Never commit `.env`.

## Ecosystem

- Hub: [github.com/jokeez/hackme](https://github.com/jokeez/hackme)  
- API: [github.com/jokeez/hackme-exchange-api](https://github.com/jokeez/hackme-exchange-api)  
- This SPA: [github.com/jokeez/hackme-exchange](https://github.com/jokeez/hackme-exchange)

## Pull requests

- Keep changes focused (UI, docs, or lab wiring — not mixed with public-edge work).
- Soft **D0** ships static paper UI only — do not enable a public matching API in the same change set.
- Author identity should match the project’s existing GitHub account.
- Do not commit dry-run dumps, tarballs, or `docs/.local/`.

## Secrets

- Do not put admin tokens in `VITE_*` (inlined into the browser bundle).
- Lab fixture seeds are for localhost only.
