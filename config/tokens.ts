/**
 * Luna design tokens — the single source of truth for colour, type, spacing,
 * motion and layout (APP-62).
 *
 * **This file is the source; `src/app/tokens.css` is generated from it.**
 * Tailwind v4 is CSS-first: its theme lives in an `@theme` block rather than in
 * a JS config object, so there is no way for it to `import` this module. The
 * two are kept in step by generation plus a gate, not by discipline:
 *
 * ```sh
 * npm run tokens         # regenerate src/app/tokens.css from this file
 * npm run check:design   # fails if the generated file has drifted (CI runs this)
 * ```
 *
 * So: edit this file, run `npm run tokens`, commit both. Never hand-edit
 * `src/app/tokens.css` — the gate will reject it.
 *
 * Design constraints this file encodes, both locked for the MVP in the project
 * decision log (2026-05-21):
 *
 * - **Greyscale plus a single warm-orange accent.** No other hue exists in the
 *   palette below, Tailwind's default colour palette is cleared in the
 *   generated theme (`--color-*: initial`), and `npm run check:design` fails on
 *   a colour literal or an off-palette utility class anywhere under `src/`.
 *   Introducing a second hue is a decision, not an implementation detail.
 * - **Mobile-first.** The shell is a 390px column; everything wider is surround.
 *
 * Values are plain strings so this module stays dependency-free and importable
 * from both the app (`@config/tokens`) and the Node build scripts.
 */

/**
 * The raw palette: black, white, six greys, one accent.
 *
 * Keys are the CSS-variable suffix, so `grey-800` is emitted as
 * `--color-grey-800` and is reachable as `bg-grey-800` / `text-grey-800` /
 * `border-grey-800`. The greys are hue-free (r = g = b) on purpose — a tinted
 * neutral would quietly be a second hue.
 */
export const palette = {
  black: "#000000",
  white: "#ffffff",
  "grey-950": "#0a0a0a",
  "grey-900": "#171717",
  "grey-800": "#262626",
  "grey-600": "#525252",
  "grey-400": "#a3a3a3",
  "grey-200": "#e5e5e5",
  /** Luna's warm orange. The only hue in the product. 7.6:1 on `grey-950`. */
  accent: "#ff7a18",
} as const;

/**
 * Semantic aliases. Components use these, not the raw scale, so a palette
 * change lands in one place.
 *
 * Keys must not collide with {@link palette} keys — both are emitted into the
 * same `--color-*` namespace, and the generator rejects a duplicate.
 */
export const semantic = {
  /** The shell surface — the 390px column the app lives in. */
  background: palette["grey-950"],
  /** The surround behind the shell on a wide viewport. */
  backdrop: palette.black,
  /** Default body text. */
  foreground: palette["grey-200"],
  /** Secondary text — captions, supporting copy. 7.9:1 on `background`. */
  muted: palette["grey-400"],
  /** Non-text detail: hairlines, dividers, the shell's edge. */
  border: palette["grey-800"],
  /** A surface lifted off `background` — cards, wells. */
  elevated: palette["grey-900"],
  /** Text/icon colour on an accent fill. 8.0:1 on `accent`. */
  "accent-contrast": palette.black,
} as const;

/**
 * Typography. Space Grotesk carries display, Inter carries body.
 *
 * `fontVariable` names the CSS custom properties that `next/font` writes. They
 * are declared **here** and consumed in `src/app/layout.tsx`, which has to pass
 * them as string literals — `next/font` is a build-time transform and rejects
 * a non-literal option. That duplication is checked rather than trusted:
 * `npm run check:design` fails if `layout.tsx` stops using these exact names.
 */
export const type = {
  fontVariable: {
    display: "--font-space-grotesk",
    body: "--font-inter",
  },
  /**
   * The stacks the `font-display` / `font-body` utilities resolve to. Each ends
   * in a system fallback so a page still renders if a face fails to load.
   */
  fontFamily: {
    display: "var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif",
    body: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  },
  size: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
  },
  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  leading: {
    tight: "1.15",
    snug: "1.3",
    normal: "1.5",
    relaxed: "1.65",
  },
  tracking: {
    tight: "-0.02em",
    normal: "0em",
    wide: "0.04em",
    widest: "0.18em",
  },
} as const;

/**
 * Spacing — a 4px scale.
 *
 * Only `base` reaches the theme (`--spacing`), because Tailwind v4 derives
 * every step from it dynamically: `p-4` is `calc(var(--spacing) * 4)`. `scale`
 * exists for the JS/inline-style side and for motion offsets, and is the same
 * ladder spelled out.
 */
export const spacing = {
  base: "0.25rem",
  scale: {
    0: "0rem",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
    16: "4rem",
    20: "5rem",
    24: "6rem",
  },
} as const;

/**
 * Motion. Durations and easings for transitions and page changes.
 *
 * Anything that animates reads from here, so the whole product can be slowed
 * down or calmed in one edit. Reduced-motion is handled at the point of use
 * (`src/app/globals.css`), not by zeroing these.
 */
export const motion = {
  duration: {
    instant: "0ms",
    fast: "120ms",
    base: "200ms",
    slow: "320ms",
    slower: "500ms",
  },
  easing: {
    /** General-purpose. Decelerates into rest. */
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    /** Entering the screen — fast out of the gate, soft landing. */
    entrance: "cubic-bezier(0.05, 0.7, 0.1, 1)",
    /** Leaving the screen — eases in, then goes quickly. */
    exit: "cubic-bezier(0.3, 0, 0.8, 0.15)",
  },
  /** How far a page slides on enter. Deliberately small — this is a nudge. */
  pageEnterOffset: spacing.scale[2],
} as const;

/**
 * Elevation.
 *
 * One shadow, used once: to lift the shell off the backdrop on a wide viewport.
 * Expressed with a token colour so the palette gate has nothing to object to,
 * and kept here rather than inline so "the shell floats awkwardly" is a value
 * to tune rather than a string to find.
 */
export const elevation = {
  shell: "0 32px 90px -32px #000000",
} as const;

/**
 * Layout.
 *
 * `shellWidth` is the mobile canvas — an iPhone 14/15 logical width, so the
 * design target and the demo device agree. `frameBreakpoint` is where the shell
 * stops being the whole viewport and starts being a centred column on a
 * backdrop; it is comfortably above `shellWidth` so that at exactly 390px the
 * app is full-bleed with no stray chrome.
 */
export const layout = {
  shellWidth: "390px",
  frameBreakpoint: "30rem",
} as const;

/** Every token group, for consumers that want the whole set. */
export const tokens = {
  palette,
  semantic,
  type,
  spacing,
  motion,
  elevation,
  layout,
} as const;

export default tokens;
