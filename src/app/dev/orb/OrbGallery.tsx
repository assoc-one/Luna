"use client";

import { useState } from "react";

import { LunaOrb } from "@/components/LunaOrb";
import { orbSize, orbSizes, orbStates, type OrbState } from "@config/orb";

/**
 * The orb bench (APP-64) — every state, every size, and a switcher, on one page.
 *
 * It is a development surface, not a product screen: it exists so the orb can be
 * looked at and driven without a flow around it, and so `scripts/verify-orb.mjs`
 * has a stable place to measure. The `data-orb-*` attributes are that stable
 * place — the check finds tiles by them, so renaming one breaks the check
 * loudly rather than quietly measuring the wrong element.
 */

/** One line per state, so the bench says what it is claiming to show. */
const DESCRIPTION: Record<OrbState, string> = {
  idle: "Breathing. Slow and shallow — the core and the glow, nothing else.",
  listening: "Attending. A ring sweeps inward and brightens as it closes.",
  thinking: "Working. An arc sweeps the rim; the core shimmers in place.",
  speaking: "Talking. Fast and irregular — the ring rides the amplitude.",
  celebrating: "Celebrating. The core expands, the glow swells, the ring flies out.",
};

export function OrbGallery() {
  const [benchState, setBenchState] = useState<OrbState>("idle");

  return (
    <main className="flex flex-1 flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="font-display text-xs font-medium uppercase tracking-widest text-accent">
          Dev
        </p>
        <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground">
          Luna orb
        </h1>
        <p className="text-sm leading-relaxed text-muted text-pretty">
          Five states, three sizes. Every state is a set of numbers in{" "}
          <code className="text-foreground">config/orb.ts</code> fed into one
          continuous animation, so a change of state blends rather than cuts.
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      <section className="flex flex-col gap-5" aria-labelledby="states-heading">
        <h2
          id="states-heading"
          className="font-display text-xs font-medium uppercase tracking-widest text-muted"
        >
          States
        </h2>

        <ul className="flex flex-col gap-6">
          {orbStates.map((state) => (
            <li
              key={state}
              data-orb-demo="state"
              data-orb-demo-state={state}
              className="flex items-center gap-5"
            >
              <LunaOrb state={state} size="md" />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-display text-base font-medium text-foreground">
                  {state}
                </p>
                <p className="text-sm leading-normal text-muted text-pretty">
                  {DESCRIPTION[state]}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="flex flex-col gap-5" aria-labelledby="sizes-heading">
        <h2
          id="sizes-heading"
          className="font-display text-xs font-medium uppercase tracking-widest text-muted"
        >
          Sizes
        </h2>

        <ul className="flex flex-wrap items-end gap-6">
          {orbSizes.map((size) => (
            <li
              key={size}
              data-orb-demo="size"
              data-orb-demo-size={size}
              className="flex flex-col items-center gap-2"
            >
              <LunaOrb state="idle" size={size} />
              <p className="text-xs text-muted">
                {size} · {orbSize[size]}px
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="flex flex-col gap-5" aria-labelledby="bench-heading">
        <h2
          id="bench-heading"
          className="font-display text-xs font-medium uppercase tracking-widest text-muted"
        >
          Transitions
        </h2>

        <div className="flex flex-col items-center gap-5">
          <div data-orb-demo="bench" data-orb-demo-state={benchState}>
            <LunaOrb state={benchState} size="lg" label={`Luna is ${benchState}`} />
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {orbStates.map((state) => (
              <button
                key={state}
                type="button"
                data-orb-set-state={state}
                aria-pressed={state === benchState}
                onClick={() => setBenchState(state)}
                className={
                  state === benchState
                    ? "rounded-full border border-accent bg-accent px-4 py-2 text-sm font-medium text-accent-contrast"
                    : "rounded-full border border-border bg-elevated px-4 py-2 text-sm text-muted"
                }
              >
                {state}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <p className="border-t border-border pt-5 text-sm leading-normal text-muted text-pretty">
        With <code className="text-foreground">prefers-reduced-motion: reduce</code>{" "}
        set, every orb above resolves to the same static glow and no animation
        frame is scheduled at all — the driver is removed from the tree rather
        than slowed down.
      </p>
    </main>
  );
}

export default OrbGallery;
