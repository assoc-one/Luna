"use client";

import { animate, motion, useAnimationFrame, useMotionValue, useReducedMotion } from "framer-motion";
import type { MotionValue } from "framer-motion";
import { useEffect, useId, useRef } from "react";

import {
  orbMotion,
  orbParams,
  orbSize,
  orbStatic,
  type OrbParams,
  type OrbSize,
  type OrbState,
} from "@config/orb";

/**
 * The Luna orb (APP-64) — the visual heart of the product, and the one thing on
 * screen in every state of the conversation.
 *
 * ```tsx
 * <LunaOrb state="listening" size="lg" label="Luna is listening" />
 * ```
 *
 * ## Why this is parametric rather than five animations
 *
 * The obvious build is a variant per state, each a keyframe loop. It fails the
 * brief's second acceptance criterion. Animating **to** a keyframe array starts
 * at that array's first frame, so a state change snaps the core's scale (and the
 * halo's opacity, and the ring's) from wherever the previous loop had got to
 * onto the new loop's opening value — a visible cut, in the one place the brief
 * asks for a smooth transition. Threading `null` as the opening keyframe fixes
 * the cut and breaks the loop instead: the resolved first frame no longer equals
 * the last, so every repeat gets the discontinuity that used to be at the switch.
 *
 * So the orb has **one** animation, and a state is a set of numbers fed into it:
 *
 * - a phase that only ever advances (`phase += dt × pulseHz`), so changing
 *   frequency changes how fast the wave moves and never where it is;
 * - a wave — a sine, plus a third harmonic when a state wants an irregular one;
 * - per-layer amplitudes and offsets, in `config/orb.ts`.
 *
 * A state change animates the **parameters** from wherever they currently are to
 * the new state's, over `orbMotion.stateTransition`. Every painted value is a
 * continuous function of a continuous phase and continuously moving parameters,
 * so smoothness is a property of the construction rather than a behaviour to
 * check for — which is also why the check in `scripts/verify-orb.mjs` measures
 * the rate of change across a switch and can state a number.
 *
 * Framer Motion still does the work: `animate()` runs the parameter blend,
 * `MotionValue`s carry the per-frame results to the DOM without re-rendering,
 * `useAnimationFrame` is the clock, and `useReducedMotion` decides whether any
 * of it runs at all.
 *
 * ## Reduced motion
 *
 * `prefers-reduced-motion: reduce` does not slow the orb down or shorten it — it
 * removes the driver from the tree entirely. The motion values keep the resting
 * pose they were created with (`orbStatic`), so what remains is a static glow:
 * the core and the halo, no ring, no arc, and no animation frame scheduled. The
 * initial render is that same resting pose whatever the preference, so the
 * server and client markup agree and hydration is quiet.
 */
export type LunaOrbProps = {
  /** Which of the five states to show. */
  state?: OrbState;
  /** One of the three declared sizes — see `orbSize` in `config/orb.ts`. */
  size?: OrbSize;
  /**
   * An accessible name. Supply it where the orb is the thing communicating
   * (a voice turn, a result); omit it where it is decoration beside text that
   * already says the same, and it is hidden from assistive tech instead.
   */
  label?: string;
  className?: string;
};

/** The SVG user space. Everything is laid out in it and scaled by the box size. */
const VIEW = 120;
const CENTRE = VIEW / 2;
const CORE_R = 30;
const RING_R = 40;
const HALO_R = 58;
const ARC_R = 46;

/**
 * The shimmer arc: a 100° sweep at `ARC_R`, from -120° to -20°.
 * Written out rather than computed so the path is greppable and stable.
 */
const ARC_PATH = `M 37 20.16 A ${ARC_R} ${ARC_R} 0 0 1 103.23 44.27`;

const TAU = Math.PI * 2;

/** Every animated channel, as motion values the driver writes and the SVG reads. */
type OrbChannels = {
  coreScale: MotionValue<number>;
  coreOpacity: MotionValue<number>;
  haloScale: MotionValue<number>;
  haloOpacity: MotionValue<number>;
  ringScale: MotionValue<number>;
  ringOpacity: MotionValue<number>;
  shimmerOpacity: MotionValue<number>;
  shimmerRotate: MotionValue<number>;
};

/** A sine, with an optional third harmonic mixed in. Range ≈ -1…1, zero at 0. */
function wave(phase: number, harmonic: number): number {
  return (1 - harmonic) * Math.sin(phase) + harmonic * Math.sin(3 * phase);
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Linear mix of two parameter sets. Every field is a number, so this is total. */
function mixParams(from: OrbParams, to: OrbParams, t: number): OrbParams {
  const out = {} as OrbParams;
  for (const key of Object.keys(orbStatic) as (keyof OrbParams)[]) {
    out[key] = from[key] + (to[key] - from[key]) * t;
  }
  return out;
}

/**
 * The clock. Rendered only when motion is allowed, so under reduced motion there
 * is no animation frame loop at all — not a loop that does nothing.
 *
 * It paints no DOM of its own: it writes motion values, which Framer applies
 * directly to the rendered elements without a React render per frame.
 */
function OrbDriver({ state, channels }: { state: OrbState; channels: OrbChannels }) {
  const blend = useMotionValue(1);
  /** Where the parameters were when the current blend started. */
  const from = useRef<OrbParams>(orbStatic);
  /** Where they are heading. */
  const to = useRef<OrbParams>(orbParams[state]);
  /** Where they are right now — the start point of the *next* blend. */
  const current = useRef<OrbParams>(orbStatic);

  const phase = useRef(0);
  const spin = useRef(0);

  useEffect(() => {
    // Blending from `current` rather than from the previous state's declared
    // parameters is what makes an interrupted transition continuous too: switch
    // state twice in quick succession and the second blend starts from the
    // half-mixed values on screen, not from a set that was never painted.
    from.current = current.current;
    to.current = orbParams[state];
    blend.set(0);
    const controls = animate(blend, 1, orbMotion.stateTransition);
    return () => controls.stop();
  }, [state, blend]);

  useAnimationFrame((_, delta) => {
    const dt = Math.min(delta, orbMotion.maxFrameMs) / 1000;
    const p = mixParams(from.current, to.current, blend.get());
    current.current = p;

    phase.current = (phase.current + dt * p.pulseHz * TAU) % TAU;
    spin.current = (spin.current + dt * p.shimmerSpin) % 360;

    const w = wave(phase.current, p.harmonic);
    const wRingScale = wave(phase.current + p.ringPhase, p.harmonic);
    const wRingOpacity = wave(phase.current + p.ringPhase + Math.PI / 2, p.harmonic);

    channels.coreScale.set(1 + p.coreScaleAmp * w);
    channels.coreOpacity.set(clamp01(p.coreOpacity + p.coreOpacityAmp * w));
    channels.haloScale.set(1 + p.haloScaleAmp * w);
    channels.haloOpacity.set(clamp01(p.haloOpacity + p.haloOpacityAmp * w));
    channels.ringScale.set(p.ringScaleBase + p.ringScaleAmp * wRingScale);
    channels.ringOpacity.set(clamp01(p.ringOpacity + p.ringOpacityAmp * wRingOpacity));
    channels.shimmerOpacity.set(clamp01(p.shimmerOpacity));
    channels.shimmerRotate.set(spin.current);
  });

  return null;
}

export function LunaOrb({
  state = "idle",
  size = "md",
  label,
  className,
}: LunaOrbProps) {
  const reduced = useReducedMotion();
  const box = orbSize[size];

  // `useId()` is not guaranteed to be free of characters that need escaping in a
  // `url(#…)` reference, so it is reduced to word characters before use. Several
  // orbs share a page in the demo, and two gradients with one id is a silent
  // cross-wire rather than an error.
  const uid = useId().replace(/[^\w-]/g, "");
  const coreGradient = `${uid}-core`;
  const haloGradient = `${uid}-halo`;
  const arcGradient = `${uid}-arc`;

  const channels: OrbChannels = {
    coreScale: useMotionValue(1),
    coreOpacity: useMotionValue(orbStatic.coreOpacity),
    haloScale: useMotionValue(1),
    haloOpacity: useMotionValue(orbStatic.haloOpacity),
    ringScale: useMotionValue(orbStatic.ringScaleBase),
    ringOpacity: useMotionValue(orbStatic.ringOpacity),
    shimmerOpacity: useMotionValue(orbStatic.shimmerOpacity),
    shimmerRotate: useMotionValue(0),
  };

  // Transform origin is given in user space: every layer is concentric on the
  // viewBox centre, and the shimmer arc is not — its own bounding box is off to
  // one side, so a `fill-box` origin would swing it round its own middle.
  const origin = { transformOrigin: `${CENTRE}px ${CENTRE}px` } as const;

  return (
    <span
      className={className}
      data-orb=""
      data-orb-state={state}
      data-orb-size={size}
      style={{ display: "inline-block", inlineSize: box, blockSize: box }}
    >
      {reduced ? null : <OrbDriver state={state} channels={channels} />}

      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        width={box}
        height={box}
        role={label ? "img" : "presentation"}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          {/* Orange at the centre, falling away to a softer edge. */}
          <radialGradient id={coreGradient}>
            <stop offset="0%" style={{ stopColor: "var(--color-accent)", stopOpacity: 1 }} />
            <stop offset="55%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.92 }} />
            <stop offset="100%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.38 }} />
          </radialGradient>

          {/* The halo. Reaches zero before the edge so the box never shows a seam. */}
          <radialGradient id={haloGradient}>
            <stop offset="38%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.5 }} />
            <stop offset="70%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.18 }} />
            <stop offset="100%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0 }} />
          </radialGradient>

          {/* The rotating arc fades out along its length, so it reads as a sweep. */}
          <linearGradient id={arcGradient} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0 }} />
            <stop offset="100%" style={{ stopColor: "var(--color-accent)", stopOpacity: 1 }} />
          </linearGradient>
        </defs>

        <motion.circle
          data-orb-layer="halo"
          cx={CENTRE}
          cy={CENTRE}
          r={HALO_R}
          fill={`url(#${haloGradient})`}
          style={{ ...origin, scale: channels.haloScale, opacity: channels.haloOpacity }}
        />

        <motion.circle
          data-orb-layer="ring"
          cx={CENTRE}
          cy={CENTRE}
          r={RING_R}
          fill="none"
          strokeWidth={2}
          style={{
            ...origin,
            stroke: "var(--color-accent)",
            scale: channels.ringScale,
            opacity: channels.ringOpacity,
          }}
        />

        <motion.g
          data-orb-layer="shimmer"
          style={{ ...origin, rotate: channels.shimmerRotate, opacity: channels.shimmerOpacity }}
        >
          <path
            d={ARC_PATH}
            fill="none"
            stroke={`url(#${arcGradient})`}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </motion.g>

        <motion.circle
          data-orb-layer="core"
          cx={CENTRE}
          cy={CENTRE}
          r={CORE_R}
          fill={`url(#${coreGradient})`}
          style={{ ...origin, scale: channels.coreScale, opacity: channels.coreOpacity }}
        />
      </svg>
    </span>
  );
}

export default LunaOrb;
