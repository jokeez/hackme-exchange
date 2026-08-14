# Contributing

## Setup

```bash
npm install
npm test
npm run build
```

Copy `.env.example` → `.env` for local overrides. Never commit `.env`.

## Pull requests

- Keep changes focused (UI, docs, or lab wiring — not mixed with public-edge work).
- Soft **D0** ships static paper UI only — do not enable a public matching API in the same change set.
- Author identity should match the project’s existing GitHub account.

## Secrets

- Do not put admin tokens in `VITE_*` variables (they are inlined into the browser bundle).
- Lab fixture seeds are for localhost only.
