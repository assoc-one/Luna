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
npm run dev            # dev server
npm run build          # production build
npm run lint           # eslint
npm run type-check     # tsc --noEmit
npm run tokens         # regenerate src/app/tokens.css from config/tokens.ts
npm run check:design   # the design-token gate — see below
```

CI runs lint → check:design → type-check → build on every PR to `main`
(`.github/workflows/ci.yml`). Run all of them locally before opening a PR.

## Design tokens — `config/tokens.ts` is the source, `src/app/tokens.css` is generated

Tailwind v4 is CSS-first: its theme lives in an `@theme` block, not a JS config
object, so it cannot import a TypeScript module. The tokens are TypeScript because
the app and the build scripts both need them. Those two facts would normally mean
two sources of truth, so **`src/app/tokens.css` is generated** —

```sh
npm run tokens         # config/tokens.ts  →  src/app/tokens.css
npm run check:design   # fails if they have drifted (CI runs this)
```

Edit the tokens, regenerate, commit both. A hand-edit to `src/app/tokens.css` is
reverted by the next `npm run tokens` and rejected by CI in the meantime.

`npm run check:design` (`scripts/check-design.mjs`) runs three checks and reports
every one of them — pass and fail — to **stdout**, ending in a single
`RESULT pass=<n> fail=<n>` line:

- **theme-in-sync** — the generated file matches what the tokens render to.
- **palette-only** — nothing under `src/` introduces a colour outside the palette.
  Greyscale plus one warm orange is a locked MVP decision (project decision log,
  2026-05-21), so a second hue should be a decision, not a diff. The generated
  theme also clears Tailwind's default colour palette (`--color-*: initial`), so
  `bg-sky-500` and friends do not exist as utilities at all — the check is the
  loud half of a constraint that is already structural.
- **font-variables** — `src/app/layout.tsx` still declares the CSS custom
  properties named in `type.fontVariable`. `next/font` is a build-time transform
  and only accepts literals, so those names cannot be imported and have to be
  repeated; this is what keeps the repetition honest. If it ever diverged, the
  theme would point at an undefined variable and silently fall back to system-ui.

## The Shell

`src/components/Shell.tsx` is mounted once in the root layout, so **every route
renders inside it** by construction rather than by convention. It is a 390px
column (`--container-shell`) that is the whole viewport on a phone and a centred
column on a gradient backdrop above `--breakpoint-frame`; both are tokens.

It is a Client Component solely for `usePathname`, which keys the transition
wrapper so a route change replays the enter animation. `children` is
server-rendered output passed straight through — no functions cross the boundary.
`prefers-reduced-motion` is honoured in `globals.css`, at the point of use.

## Current state

**Phase 0 — Foundation.** The scaffold stands, the design tokens and the Shell are
in place (APP-62), and the home route is still a placeholder. Nothing of the actual
experience is built: no voice, no Luna orb, no sections, no task flow, no plan
generation. The home route exists to prove the app builds and renders, and is
expected to be replaced — but it should be replaced *inside* the Shell and using
the tokens.

The presentational tickets (design tokens, the Luna orb, progress ring, input
components, task-screen templates, section content) are unblocked by this scaffold
and need no credentials. The voice and AI tickets additionally need APP-1034.
