# Luna — Retirement Navigator

A voice-first, adaptive retirement planning MVP guided by **Luna**, a conversational
AI companion. Mobile-first responsive web app, built to demonstrate how personalised
onboarding can reshape a financial planning product around the customer's mindset
rather than forcing them through a one-size-fits-all funnel.

> **Status: Phase 0 — foundation.** The application scaffold is in place. None of the
> experience is built yet.

## Getting started

```sh
npm install
cp .env.example .env.local   # gitignored; names only in the example
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

No credentials are required to run, build, lint or type-check the app as it stands.
`.env.local` is only needed once the voice and AI features are built.

## Scripts

| Script | What it does |
| -- | -- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm run type-check` | `tsc --noEmit` |

CI runs lint, type-check and build on every pull request to `main`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind 4 · deployed on Vercel.

Contributor and agent guidance — including the environment-variable contract and why
this repo builds without credentials — is in [`CLAUDE.md`](./CLAUDE.md).
