/**
 * The Luna orb's shape and motion, as data (APP-64).
 *
 * This module is the **single source** for everything the orb is judged on: the
 * three rendered sizes, the five states, and the numbers each state animates
 * with. It is imported by the component (`src/components/LunaOrb.tsx`) *and* by
 * the runtime check (`scripts/verify-orb.mjs`), so the check measures the built
 * app against the same declaration the component renders from rather than
 * against a second copy of the numbers that can quietly drift.
 *
 * It sits beside `config/tokens.ts` rather than inside it because none of this
 * reaches the Tailwind theme: the tokens are generated into `src/app/tokens.css`
 * and gated by `npm run check:design`, and adding a group that renders to
 * nothing would put a second kind of thing in a file whose whole contract is
 * "everything here becomes a CSS variable". The one value the orb *does* take
 * from the tokens is the accent colour, and it takes it as `var(--color-accent)`
 * at the point of use — never as a literal.
 *
 * Plain numbers, no dependencies, so Node's TypeScript stripping can load it
 * directly from a build script.
 */

import { motion as motionTokens } from "./tokens.ts";

/* -------------------------------------------------------------------------- *
 * Sizes
 * -------------------------------------------------------------------------- */

/**
 * The rendered box, in CSS pixels. Square — the orb's SVG is a square viewBox.
 *
 * `lg` is sized against the shell: the app lives in a 390px column
 * (`layout.shellWidth`), so 200px is a little over half its width and still
 * clears a comfortable gutter at the default page padding.
 */
export const orbSize = {
  sm: 72,
  md: 128,
  lg: 200,
} as const;

export type OrbSize = keyof typeof orbSize;

export const orbSizes = ["sm", "md", "lg"] as const satisfies readonly OrbSize[];

/* -------------------------------------------------------------------------- *
 * States
 * -------------------------------------------------------------------------- */

export const orbStates = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "celebrating",
] as const;

export type OrbState = (typeof orbStates)[number];

/**
 * What every state is a set of values *for*.
 *
 * The orb is not animated with per-state keyframes. It is a small parametric
 * system: one continuously advancing phase drives a wave, and a state is a set
 * of amplitudes, offsets and frequencies applied to that wave. Switching state
 * interpolates the parameter set — see {@link orbMotion.stateTransition} and the
 * note on continuity in `src/components/LunaOrb.tsx`.
 *
 * Every field is a plain number so a state is a straight linear mix of two
 * others; anything non-numeric here would break that property.
 */
export type OrbParams = {
  /** How far the core's scale swings either side of 1. */
  coreScaleAmp: number;
  /** The core's resting opacity. */
  coreOpacity: number;
  /** How far the core's opacity swings either side of {@link coreOpacity}. */
  coreOpacityAmp: number;
  /** The halo's resting opacity — this is "the glow". */
  haloOpacity: number;
  haloOpacityAmp: number;
  /** How far the halo's scale swings either side of 1. */
  haloScaleAmp: number;
  /** The outer ring's resting opacity. 0 hides it. */
  ringOpacity: number;
  ringOpacityAmp: number;
  /** The ring's resting scale, as a multiple of its drawn radius. */
  ringScaleBase: number;
  ringScaleAmp: number;
  /** Radians the ring's wave leads the core's by. `PI` puts them in opposition. */
  ringPhase: number;
  /** The rotating arc's opacity. 0 hides it. */
  shimmerOpacity: number;
  /** Degrees per second the arc rotates. */
  shimmerSpin: number;
  /** Cycles per second of the driving wave. */
  pulseHz: number;
  /**
   * Weight of a third-harmonic term in the wave, 0–1. 0 is a pure sine (calm,
   * regular); higher values add a faster ripple on top, which is what makes
   * speech read as speech rather than as breathing.
   */
  harmonic: number;
};

/**
 * The resting pose — no motion at all, and the state the component mounts in.
 *
 * It is also what `prefers-reduced-motion: reduce` resolves to, which is the
 * whole of "reduces to a static glow": core and halo painted, ring and shimmer
 * (both of which only mean anything while moving) hidden, every amplitude zero.
 */
export const orbStatic: OrbParams = {
  coreScaleAmp: 0,
  coreOpacity: 1,
  coreOpacityAmp: 0,
  haloOpacity: 0.55,
  haloOpacityAmp: 0,
  haloScaleAmp: 0,
  ringOpacity: 0,
  ringOpacityAmp: 0,
  ringScaleBase: 1,
  ringScaleAmp: 0,
  ringPhase: 0,
  shimmerOpacity: 0,
  shimmerSpin: 0,
  pulseHz: 0,
  harmonic: 0,
};

/**
 * The five states.
 *
 * They are deliberately separated on more than one axis — which layers move,
 * how far, and how fast — so that "visibly distinct" is a property of the
 * numbers rather than a hope about perception. `scripts/verify-orb.mjs` measures
 * the painted result and fails if any pair stops being separable.
 */
export const orbParams: Record<OrbState, OrbParams> = {
  /** Breathing. Slow, shallow, nothing but the core and the glow. */
  idle: {
    ...orbStatic,
    coreScaleAmp: 0.035,
    haloOpacity: 0.5,
    haloOpacityAmp: 0.1,
    haloScaleAmp: 0.025,
    pulseHz: 0.3,
  },

  /**
   * Attending. The core all but stops; a ring sweeps inward and brightens as it
   * closes (its wave leads the core's by a quarter turn, so scale and opacity
   * trace a circle rather than pulsing together).
   */
  listening: {
    ...orbStatic,
    coreScaleAmp: 0.012,
    haloOpacity: 0.44,
    haloOpacityAmp: 0.05,
    ringOpacity: 0.42,
    ringOpacityAmp: 0.36,
    ringScaleBase: 1.14,
    ringScaleAmp: 0.2,
    ringPhase: Math.PI / 2,
    pulseHz: 0.62,
  },

  /** Working. A slow arc sweeps the rim; the core shimmers rather than moves. */
  thinking: {
    ...orbStatic,
    coreScaleAmp: 0.008,
    coreOpacityAmp: 0.09,
    haloOpacity: 0.42,
    haloOpacityAmp: 0.07,
    shimmerOpacity: 0.9,
    shimmerSpin: 55,
    pulseHz: 0.16,
  },

  /**
   * Talking. Fast, and the only state with a strong harmonic — the outer ring
   * and the core move together on an irregular wave, which is the "amplitude"
   * the brief asks for, faked from a sum of sines rather than from real audio.
   */
  speaking: {
    ...orbStatic,
    coreScaleAmp: 0.07,
    haloOpacity: 0.55,
    haloOpacityAmp: 0.2,
    ringOpacity: 0.5,
    ringOpacityAmp: 0.3,
    ringScaleBase: 1.16,
    ringScaleAmp: 0.14,
    pulseHz: 1.9,
    harmonic: 0.45,
  },

  /** Celebrating. The big one: the core expands, the glow swells, the ring flies out. */
  celebrating: {
    ...orbStatic,
    coreScaleAmp: 0.16,
    haloOpacity: 0.7,
    haloOpacityAmp: 0.28,
    haloScaleAmp: 0.08,
    ringOpacity: 0.36,
    ringOpacityAmp: 0.34,
    ringScaleBase: 1.38,
    ringScaleAmp: 0.3,
    pulseHz: 0.72,
    harmonic: 0.22,
  },
};

/* -------------------------------------------------------------------------- *
 * Transition between states
 * -------------------------------------------------------------------------- */

/**
 * `cubic-bezier(a, b, c, d)` → `[a, b, c, d]`.
 *
 * The easing lives in the motion tokens as a CSS string, because that is the
 * form CSS needs. Framer Motion wants the four control points. Parsing keeps one
 * source rather than a token and a hand-copied array that agree until they
 * don't — and it throws rather than guessing, so a token edit that changes the
 * shape fails loudly here instead of silently falling back to a default curve.
 */
function cubicBezierPoints(css: string): [number, number, number, number] {
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(css.trim());
  const points = match?.[1].split(",").map((n) => Number(n.trim()));
  if (!points || points.length !== 4 || points.some(Number.isNaN)) {
    throw new Error(
      `config/orb.ts: expected a cubic-bezier() easing token, got ${JSON.stringify(css)}.`,
    );
  }
  return points as [number, number, number, number];
}

/** `"320ms"` → `0.32`. Framer Motion counts durations in seconds. */
function seconds(css: string): number {
  const ms = Number(/^([\d.]+)ms$/.exec(css.trim())?.[1]);
  if (Number.isNaN(ms)) {
    throw new Error(
      `config/orb.ts: expected a millisecond duration token, got ${JSON.stringify(css)}.`,
    );
  }
  return ms / 1000;
}

export const orbMotion = {
  /**
   * How long a state change takes to blend, and on what curve. Both come from
   * the motion tokens — the orb is not allowed its own timing vocabulary.
   */
  stateTransition: {
    duration: seconds(motionTokens.duration.slower),
    ease: cubicBezierPoints(motionTokens.easing.standard),
  },
  /**
   * The longest frame gap the driver will integrate over, in milliseconds.
   *
   * A backgrounded tab delivers one enormous frame on return; without a clamp
   * the phase would jump by whatever the gap was and the orb would appear to
   * teleport on refocus.
   */
  maxFrameMs: 64,
} as const;

/** Every orb constant, for consumers that want the whole set. */
export const orb = {
  orbSize,
  orbSizes,
  orbStates,
  orbParams,
  orbStatic,
  orbMotion,
} as const;

export default orb;
