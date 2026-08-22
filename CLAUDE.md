@AGENTS.md

# Luna — Retirement Navigator

A voice-first, adaptive retirement planning MVP guided by **Luna**, a conversational
AI companion. Mobile-first responsive web app for stakeholder demos.

Tracked in Linear: team **Apps**, project **Luna MVP — Retirement Navigator**.
A bet inside the Apps accelerator (`operator-apps`), not a standalone vertical.

## Stack

Pinned exactly — every version below is the one actually installed, so the major
this repo is on is readable from `package.json` alone without resolving a range.

| | |
| -- | -- |
| Next.js | **16.3.2** (App Router, `src/` directory) |
| React | 19.2.8 |
| TypeScript | 5.9.3 |
| Tailwind | 4.3.3, via `@tailwindcss/postcss` |
| ESLint | 9.39.5 with `eslint-config-next` 16.3.2 (flat config) |
| Node (CI) | 22 |

**Read `node_modules/next/dist/docs/` before writing code**, per `AGENTS.md` above.
This Next major has breaking changes against most training data — `LayoutProps<"/">`
in `layout.tsx` and the flat-config-only ESLint setup are both current-major shapes,
not legacy ones. Do not "modernise" them from memory.

**`type-check` runs `next typegen` first, and must.** Next 16 generates the global
route types — `LayoutProps<"/">`, `PageProps<...>` — into `.next/types/`, which
`tsconfig.json` pulls in via its `include`. A bare `tsc --noEmit` on a **clean**
checkout therefore fails with `TS2304: Cannot find name 'LayoutProps'`, because
nothing has generated them yet. Locally this hides: once you have run a build, the
types are on disk and `tsc` passes, so the failure appears only in CI or after
`rm -rf .next` — a false green on your machine. `next typegen` generates them
without a full build, which is why it is chained into the script rather than the CI
job being reordered to build first. Do not "simplify" it back to a bare `tsc`.

**The build runs on Turbopack** (the Next 16 default) and that is deliberate here.
`convention-vercel` requires `next build --webpack` for repos running **Sanity** or
other bundler-sensitive libraries, because Turbopack's module resolution breaks
Sanity's schema registry with a runtime-only `SchemaError`. Luna runs no Sanity, so
the exception does not apply. If Sanity is ever added, switch the build script and
record it here.

## The APP-59 / APP-1034 split — why this repo builds without credentials

APP-59 (this scaffold) and **APP-1034** (Vercel project, domain, API keys) are
deliberately separate tickets. The original single ticket mixed ordinary build work
with credential-gated setup, so the whole thing blocked on the half only the Owner
can do, and Luna's Phase 0 sat at 13% for months.

The property that keeps them separate is enforced in code:

- **`src/lib/env.ts` reads `process.env` lazily, inside functions — never at module
  scope.** A missing key therefore cannot fail a build; it fails the request that
  actually needs it, with the variable named in the error.
- **CI sets no secrets at all**, so the tokenless path is exercised on every PR
  rather than assumed.

If you add an environment variable, add an accessor in `src/lib/env.ts` and a
name-only entry in `.env.example`. Do not read `process.env` at a call site, and do
not read it at module scope — that reintroduces the build-time dependency on
secrets this split exists to remove.

## Environment variables

`.env.example` is committed and carries **names only, never values**
(`convention-secrets`). `.env*` is gitignored with an explicit `!.env.example`
negation, so a real `.env.local` cannot be committed by accident.

```sh
cp .env.example .env.local   # gitignored
```

None of these are needed to run `npm run build`, `npm run lint`, or
`npm run type-check`. They are needed for the voice and AI features
(APP-63, APP-66, APP-67, APP-68, APP-70), which are not built yet.

## Scripts

```sh
npm run dev          # dev server
npm run build        # production build
npm run lint         # eslint
npm run type-check   # tsc --noEmit
```

CI runs lint → type-check → build on every PR to `main` (`.github/workflows/ci.yml`).
Run all three locally before opening a PR.

## Current state

**Phase 0 — Foundation.** The scaffold stands and renders a placeholder home route.
Nothing of the actual experience is built: no voice, no Luna orb, no sections, no
task flow, no plan generation. The home route exists to prove the app builds and
renders, and is expected to be replaced.

The presentational tickets (design tokens, the Luna orb, progress ring, input
components, task-screen templates, section content) are unblocked by this scaffold
and need no credentials. The voice and AI tickets additionally need APP-1034.
