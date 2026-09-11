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
| `npm run tokens` | Regenerate `src/app/tokens.css` from `config/tokens.ts` |
| `npm run check:design` | The design-token gate (theme in sync, palette-only, font variables) |
| `npm run verify:shell` | Runtime design check — drives the built app in a browser |
| `npm run verify:orb` | Runtime check for the Luna orb — same, against `/dev/orb` |

CI runs lint, the design gate, type-check and build on every pull request to `main`.

## Design tokens

`config/tokens.ts` is the single source of truth for colour, type, spacing,
motion, elevation and layout. Tailwind v4 keeps its theme in CSS, so
`src/app/tokens.css` is **generated** from it — edit the tokens, run
`npm run tokens`, commit both. `npm run check:design` fails while the two are
out of step, so the generated file cannot quietly drift.

The palette is greyscale plus a single warm-orange accent (a locked MVP
decision). The generated theme clears Tailwind's default colour palette
outright, and the gate fails on a colour literal or an off-palette utility class
anywhere under `src/`.

Every route renders inside `src/components/Shell.tsx`, mounted once in the root
layout: a 390px column that is the whole viewport on a phone and a centred
column on a soft gradient backdrop above the `frame` breakpoint.

`npm run verify:shell` measures all of that in a real browser against a
production build. It is run deliberately rather than in CI, and adds no browser
dependency — see [`CLAUDE.md`](./CLAUDE.md) for how it resolves one.

## The Luna orb

`src/components/LunaOrb.tsx` is the orb: a warm-orange SVG with five states —
`idle`, `listening`, `thinking`, `speaking`, `celebrating` — at three sizes.

```tsx
<LunaOrb state="listening" size="lg" label="Luna is listening" />
```

It is one continuous animation whose parameters change with the state, not five
separate animations, which is what makes a change of state blend rather than cut.
Under `prefers-reduced-motion: reduce` it resolves to a static glow with no
animation frame scheduled at all. Every state, every size and a state switcher are
on the bench at [`/dev/orb`](http://localhost:3000/dev/orb); `npm run verify:orb`
measures the lot against a production build. See [`CLAUDE.md`](./CLAUDE.md) for why
it is built this way.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind 4 · deployed on Vercel.

Contributor and agent guidance — including the environment-variable contract and why
this repo builds without credentials — is in [`CLAUDE.md`](./CLAUDE.md).
