/**
 * The Luna orb's runtime check (APP-64).
 *
 *   npm run build
 *   npm run verify:orb            # add --shots <dir> for a screenshot per state
 *
 * `check:design` reads the source and `tsc` reads the types. Neither can see the
 * orb, because everything the orb is judged on is a property of what a browser
 * paints over time: whether the five states actually look different, whether a
 * change of state is smooth or a cut, whether the three sizes come out at the
 * sizes they declare, and whether `prefers-reduced-motion` really stops the
 * motion rather than merely shortening it. This drives the **built** app in a
 * real browser and measures those four things.
 *
 * It is the same shape as `scripts/verify-shell.mjs` — read that first if this
 * is unfamiliar; the port guard, the spawn of the real Next binary, and the
 * single `RESULT pass=<n> fail=<n>` line on stdout are all the same, and for the
 * same reasons.
 *
 * ## What it measures, and why in this form
 *
 * Every orb layer carries `data-orb-layer`, and the bench page `/dev/orb`
 * carries `data-orb-demo`. The check samples the **computed** transform and
 * opacity of each layer on every animation frame for a few seconds, which gives
 * a time series per layer per state. From that:
 *
 * - **distinct** is a feature comparison, not a screenshot diff. Two states can
 *   share an instant and still be obviously different to watch, so a single
 *   frame proves nothing either way; the features below (how far each layer
 *   swings, how bright it sits, how fast it moves, how far the arc travels) are
 *   what "visibly distinct" actually means for something that never holds still.
 *   Every pair has to be separated by at least one of them, and the check names
 *   which — so a failure says *how* two states collapsed together.
 *
 * - **smooth** is a rate of change, in units per second, normalised by the frame
 *   gap so a dropped frame cannot masquerade as a jump. A blend moves at roughly
 *   the speed of the faster of the two states; a cut moves the whole difference
 *   inside one frame, which is an order of magnitude more. The budget is derived
 *   from the measured steady rates of the two states involved rather than being
 *   a constant, so it cannot quietly stop discriminating when the design changes.
 *
 * Neither of those is a judgement about beauty. A human still has to look at the
 * orb and like it; this is only here to catch the ways it can stop working
 * without anything else noticing.
 *
 * ## No browser is a dependency of this repo, and none should be added
 *
 * Playwright is in neither `dependencies` nor `devDependencies`. This reaches the
 * image's global install by absolute path, because a bare `import "playwright"`
 * resolves against this repo's `node_modules` — the exact dependency being
 * avoided. Both paths are properties of the image and move when it does, so set
 * the variables rather than editing this file:
 *
 *   PLAYWRIGHT_MODULE_PATH      default /opt/node22/lib/node_modules/playwright
 *   PLAYWRIGHT_EXECUTABLE_PATH  default /opt/pw-browsers/chromium-1194/chrome-linux/chrome
 *
 * That is also why this is **not** in CI: the CI runner has no browser, and a
 * gate that cannot run is worse than one that is run deliberately.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { palette } from "../config/tokens.ts";
import { orbMotion, orbSize, orbSizes, orbStates } from "../config/orb.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const PORT = Number(process.env.VERIFY_ORB_PORT ?? 3401);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const BENCH_URL = `${BASE_URL}/dev/orb`;

const shotsFlag = process.argv.indexOf("--shots");
const shotsDir = shotsFlag === -1 ? null : process.argv[shotsFlag + 1];

const MODULE_PATH =
  process.env.PLAYWRIGHT_MODULE_PATH ?? "/opt/node22/lib/node_modules/playwright";
const EXECUTABLE_PATH =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** How long each state is watched for. Long enough for the slowest state's cycle. */
const SAMPLE_MS = 4000;
/** How long a state is left to settle before it is measured. */
const SETTLE_MS = 900;

/**
 * The smoothness budget, in units per second:
 *
 *   (max(steady rate of either state, the cross bound) + mean shift) × FACTOR + FLOOR
 *
 * The **cross bound** is the part that is easy to get wrong. Mid-blend the orb
 * is running one state's amplitude at the other's frequency, and rate goes as
 * amplitude × frequency — so a blend can legitimately move faster than either
 * state ever does on its own. Budgeting from the two steady rates alone
 * therefore red-flags a perfectly smooth transition between a wide slow state
 * and a narrow fast one. `π × max(range) × max(frequency)` is the bound on that
 * product, measured from the states themselves rather than assumed.
 *
 * The **mean shift** covers the other half: the resting value moves too, across
 * the transition's own duration.
 *
 * `FACTOR` is then mostly aliasing headroom. The sampler and Framer Motion's
 * frame loop are both on `requestAnimationFrame` and their order is not fixed,
 * so a sample occasionally straddles two driver updates and reads about twice
 * the true rate. A cut is an order of magnitude out, not a factor of three, so
 * the headroom costs nothing that matters.
 */
const SMOOTH_FACTOR = 3;
const SMOOTH_FLOOR = 0.15;

/**
 * The channels smoothness is judged on: the two that are painted in every state,
 * so there is always something to be continuous *in*. The ring and the arc are
 * deliberately absent from some states, and a channel that is legitimately at
 * zero cannot say anything about whether a transition cut.
 */
const SMOOTH_CHANNELS = [
  ["core", "scale"],
  ["halo", "opacity"],
];

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

function report() {
  let pass = 0;
  let fail = 0;
  console.log("");
  for (const { name, ok, detail } of results) {
    if (ok) {
      pass += 1;
      console.log(`  ok    ${name}  —  ${detail}`);
    } else {
      fail += 1;
      console.log(`  FAIL  ${name}  —  ${detail}`);
    }
  }
  console.log(`RESULT pass=${pass} fail=${fail}`);
  return fail;
}

/** Refuse to run against a port something else already holds. */
function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (err) =>
      reject(
        new Error(
          `Port ${port} is already in use (${err.code}). Something — very likely an ` +
            `orphaned server from an earlier run — would answer these requests instead ` +
            `of the build under test. Free it, or set VERIFY_ORB_PORT. Note that Next ` +
            `renames its process, so the orphan shows up in \`ps\` as \`next-server\`.`,
        ),
      ),
    );
    probe.once("listening", () => probe.close(() => resolve()));
    probe.listen(port, "127.0.0.1");
  });
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not answer on ${url} within ${timeoutMs}ms.`);
}

/** `#rrggbb` → `rgb(r, g, b)`, the form getComputedStyle returns. */
function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

// ---------------------------------------------------------------------------
// In-page sampler. Serialised to the browser, so it may only use globals.
// ---------------------------------------------------------------------------

/**
 * Watch one orb's layers for `ms`, one reading per animation frame.
 *
 * `switchTo` optionally clicks a bench button partway through, which is how the
 * transition is measured from inside the same uninterrupted frame loop rather
 * than from a click raced against it from Node.
 */
const SAMPLER = (args) => {
  const { selector, ms, switchAtMs, switchTo } = args;
  const root = document.querySelector(selector);
  if (!root) return Promise.resolve({ error: `no element matched ${selector}` });

  const LAYERS = ["halo", "ring", "core", "shimmer"];
  const els = {};
  for (const layer of LAYERS) {
    els[layer] = root.querySelector(`[data-orb-layer="${layer}"]`);
    if (!els[layer]) return Promise.resolve({ error: `no [data-orb-layer="${layer}"]` });
  }

  return new Promise((resolve) => {
    const samples = [];
    let start = null;
    let switched = false;

    function frame(now) {
      if (start === null) start = now;
      const t = now - start;

      if (!switched && switchTo && t >= switchAtMs) {
        switched = true;
        document.querySelector(`[data-orb-set-state="${switchTo}"]`)?.click();
      }

      const reading = { t };
      for (const layer of LAYERS) {
        const cs = getComputedStyle(els[layer]);
        const m = new DOMMatrixReadOnly(cs.transform === "none" ? "" : cs.transform);
        reading[layer] = {
          opacity: Number(cs.opacity),
          scale: Math.hypot(m.a, m.b),
          rotate: (Math.atan2(m.b, m.a) * 180) / Math.PI,
        };
      }
      samples.push(reading);

      if (t < ms) requestAnimationFrame(frame);
      else resolve({ samples });
    }

    requestAnimationFrame(frame);
  });
};

// ---------------------------------------------------------------------------
// Series maths, on the Node side.
// ---------------------------------------------------------------------------

const channel = (samples, layer, key) => samples.map((s) => s[layer][key]);
const min = (xs) => xs.reduce((a, b) => (b < a ? b : a), Infinity);
const max = (xs) => xs.reduce((a, b) => (b > a ? b : a), -Infinity);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const range = (xs) => max(xs) - min(xs);

/** Total degrees turned, unwrapped past the ±180 seam atan2 leaves behind. */
function travel(samples, layer) {
  const xs = channel(samples, layer, "rotate");
  let total = 0;
  for (let i = 1; i < xs.length; i += 1) {
    let d = xs[i] - xs[i - 1];
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    total += Math.abs(d);
  }
  return total;
}

/** Rough cycles per second, from sign changes of the mean-centred series. */
function frequency(samples, layer, key) {
  const xs = channel(samples, layer, key);
  const centre = mean(xs);
  const span = range(xs);
  if (span < 1e-3) return 0;
  let crossings = 0;
  for (let i = 1; i < xs.length; i += 1) {
    const a = xs[i - 1] - centre;
    const b = xs[i] - centre;
    if (a === 0 || b === 0) continue;
    if (a < 0 !== b < 0) crossings += 1;
  }
  const seconds = (samples.at(-1).t - samples[0].t) / 1000;
  return seconds > 0 ? crossings / 2 / seconds : 0;
}

/**
 * The fastest the value moved, in units per second.
 *
 * Normalised by the actual frame gap on purpose: a per-frame delta would report
 * a dropped frame as a jump, which is the failure mode that would make this
 * check flaky rather than useful.
 */
function maxRate(samples, layer, key, fromMs = -Infinity, toMs = Infinity) {
  const inWindow = samples.filter((s) => s.t >= fromMs && s.t <= toMs);
  let worst = 0;
  for (let i = 1; i < inWindow.length; i += 1) {
    const dt = (inWindow[i].t - inWindow[i - 1].t) / 1000;
    if (dt <= 0) continue;
    const d = Math.abs(inWindow[i][layer][key] - inWindow[i - 1][layer][key]);
    worst = Math.max(worst, d / dt);
  }
  return worst;
}

/**
 * The per-state feature vector, and how far apart two states have to be on a
 * feature for it to count as separating them. Thresholds are deliberately well
 * below the designed separations — see `config/orb.ts` — so this fails when a
 * state collapses into another, not when a value is nudged.
 */
const FEATURES = [
  { key: "coreScaleRange", gap: 0.02, of: (s) => range(channel(s, "core", "scale")) },
  { key: "coreOpacityRange", gap: 0.04, of: (s) => range(channel(s, "core", "opacity")) },
  { key: "haloOpacityMean", gap: 0.05, of: (s) => mean(channel(s, "halo", "opacity")) },
  { key: "haloOpacityRange", gap: 0.05, of: (s) => range(channel(s, "halo", "opacity")) },
  { key: "ringOpacityMean", gap: 0.08, of: (s) => mean(channel(s, "ring", "opacity")) },
  { key: "ringScaleMean", gap: 0.08, of: (s) => mean(channel(s, "ring", "scale")) },
  { key: "ringScaleRange", gap: 0.06, of: (s) => range(channel(s, "ring", "scale")) },
  { key: "shimmerOpacityMean", gap: 0.2, of: (s) => mean(channel(s, "shimmer", "opacity")) },
  { key: "shimmerTravelDeg", gap: 30, of: (s) => travel(s, "shimmer") },
  { key: "pulseHz", gap: 0.2, of: (s) => frequency(s, "core", "scale") },
];

const featuresOf = (samples) =>
  Object.fromEntries(FEATURES.map((f) => [f.key, f.of(samples)]));

const round = (n, dp = 3) => Number(n.toFixed(dp));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)(MODULE_PATH));
} catch (err) {
  console.error(
    `Could not load Playwright from ${MODULE_PATH}. Set PLAYWRIGHT_MODULE_PATH ` +
      `to the global install on this image. (${err.message})`,
  );
  process.exit(2);
}

try {
  await assertPortFree(PORT);
} catch (err) {
  // Even a refused start is reported in the machine-readable shape, so a caller
  // parsing RESULT cannot read "never started" as "nothing failed".
  console.error(err.message);
  record("port-free", false, err.message);
  report();
  process.exit(2);
}

const server = spawn(
  process.execPath,
  [join(repoRoot, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)],
  { cwd: repoRoot, detached: true, stdio: ["ignore", "pipe", "pipe"] },
);
const serverLog = [];
server.stdout.on("data", (d) => serverLog.push(String(d)));
server.stderr.on("data", (d) => serverLog.push(String(d)));

function stopServer() {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

let browser;
try {
  await waitForServer(BASE_URL);
  browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });
} catch (err) {
  console.error(err.message);
  console.error(serverLog.join(""));
  stopServer();
  process.exit(2);
}

/** The bench is mobile-first; measure it at the shell width. */
const VIEWPORT = { width: 390, height: 900 };

async function openBench(reducedMotion) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    reducedMotion,
  });
  const page = await context.newPage();
  await page.goto(BENCH_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(SETTLE_MS);
  return { context, page };
}

const stateSamples = {};
const stateFeatures = {};
const stateRates = {};
const transitions = [];
let structure = null;
let gradient = null;
let sizes = null;
let reducedSamples = {};

try {
  // --- pass 1: motion allowed -------------------------------------------
  {
    const { context, page } = await openBench(null);

    structure = await page.evaluate(() => ({
      states: [...document.querySelectorAll('[data-orb-demo="state"]')].map((el) =>
        el.getAttribute("data-orb-demo-state"),
      ),
      sizes: [...document.querySelectorAll('[data-orb-demo="size"]')].map((el) =>
        el.getAttribute("data-orb-demo-size"),
      ),
      benches: document.querySelectorAll('[data-orb-demo="bench"]').length,
      buttons: [...document.querySelectorAll("[data-orb-set-state]")].map((el) =>
        el.getAttribute("data-orb-set-state"),
      ),
      layersPerOrb: document.querySelectorAll('[data-orb-demo="bench"] [data-orb-layer]')
        .length,
    }));

    gradient = await page.evaluate(() => {
      const stop = document.querySelector('[data-orb-demo="bench"] radialGradient stop');
      return stop ? getComputedStyle(stop).stopColor : null;
    });

    sizes = await page.evaluate(() =>
      [...document.querySelectorAll('[data-orb-demo="size"]')].map((el) => {
        const svg = el.querySelector("svg");
        const r = svg.getBoundingClientRect();
        return {
          size: el.getAttribute("data-orb-demo-size"),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      }),
    );

    for (const state of orbStates) {
      const out = await page.evaluate(SAMPLER, {
        selector: `[data-orb-demo="state"][data-orb-demo-state="${state}"]`,
        ms: SAMPLE_MS,
        switchAtMs: 0,
        switchTo: null,
      });
      if (out.error) throw new Error(`sampling ${state}: ${out.error}`);
      stateSamples[state] = out.samples;
      stateFeatures[state] = featuresOf(out.samples);
      stateRates[state] = Object.fromEntries(
        SMOOTH_CHANNELS.map(([layer, key]) => [
          `${layer}.${key}`,
          {
            rate: maxRate(out.samples, layer, key),
            range: range(channel(out.samples, layer, key)),
            freq: frequency(out.samples, layer, key),
            mean: mean(channel(out.samples, layer, key)),
          },
        ]),
      );
    }

    if (shotsDir) {
      await mkdir(shotsDir, { recursive: true });
      for (const state of orbStates) {
        const tile = page.locator(
          `[data-orb-demo="state"][data-orb-demo-state="${state}"] [data-orb]`,
        );
        await tile.screenshot({ path: join(shotsDir, `orb-${state}.png`) });
      }
      await page.screenshot({ path: join(shotsDir, "orb-bench.png"), fullPage: true });
    }

    // --- transitions, in a ring so every state is both left and entered ---
    const cycle = [...orbStates, orbStates[0]];
    for (let i = 0; i < cycle.length - 1; i += 1) {
      const from = cycle[i];
      const to = cycle[i + 1];

      await page.click(`[data-orb-set-state="${from}"]`);
      await page.waitForTimeout(SETTLE_MS);

      const switchAtMs = 500;
      const out = await page.evaluate(SAMPLER, {
        selector: '[data-orb-demo="bench"]',
        ms: 2200,
        switchAtMs,
        switchTo: to,
      });
      if (out.error) throw new Error(`sampling ${from}→${to}: ${out.error}`);

      const blendEndsMs = switchAtMs + orbMotion.stateTransition.duration * 1000;

      // Budgeted per channel, not across both. A state whose halo flickers fast
      // would otherwise licence a cut in the core's scale — the two channels
      // move at genuinely different speeds, so one shared budget is set by the
      // fastest and stops discriminating on the others.
      for (const [layer, key] of SMOOTH_CHANNELS) {
        const ck = `${layer}.${key}`;
        const a = stateRates[from][ck];
        const b = stateRates[to][ck];

        const observed = maxRate(out.samples, layer, key, switchAtMs - 40, blendEndsMs + 120);
        const cross = Math.PI * Math.max(a.range, b.range) * Math.max(a.freq, b.freq);
        const shift = Math.abs(a.mean - b.mean) / orbMotion.stateTransition.duration;
        const steady = Math.max(
          a.rate,
          b.rate,
          cross,
          maxRate(out.samples, layer, key, 0, switchAtMs - 60),
          maxRate(out.samples, layer, key, blendEndsMs + 300, Infinity),
        );

        transitions.push({
          from,
          to,
          channel: ck,
          observed,
          budget: (steady + shift) * SMOOTH_FACTOR + SMOOTH_FLOOR,
          steady,
        });
      }
    }

    await context.close();
  }

  // --- pass 2: prefers-reduced-motion: reduce ----------------------------
  {
    const { context, page } = await openBench("reduce");
    for (const state of orbStates) {
      const out = await page.evaluate(SAMPLER, {
        selector: `[data-orb-demo="state"][data-orb-demo-state="${state}"]`,
        ms: 1200,
        switchAtMs: 0,
        switchTo: null,
      });
      if (out.error) throw new Error(`sampling reduced ${state}: ${out.error}`);
      reducedSamples[state] = out.samples;
    }
    if (shotsDir) {
      await page.screenshot({
        path: join(shotsDir, "orb-bench-reduced-motion.png"),
        fullPage: true,
      });
    }
    await context.close();
  }
} catch (err) {
  console.error(err.stack ?? err.message);
  console.error(serverLog.join(""));
  record("measurement", false, err.message);
  await browser.close();
  stopServer();
  report();
  process.exit(2);
} finally {
  if (browser?.isConnected()) await browser.close();
  stopServer();
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

// --- the bench renders what it claims to ---
{
  const expectedStates = [...orbStates].join(",");
  const ok =
    structure.states.join(",") === expectedStates &&
    structure.sizes.join(",") === [...orbSizes].join(",") &&
    structure.benches === 1 &&
    structure.buttons.join(",") === expectedStates &&
    structure.layersPerOrb === 4;
  record(
    "bench-renders",
    ok,
    `states=[${structure.states}] sizes=[${structure.sizes}] benches=${structure.benches} ` +
      `buttons=[${structure.buttons}] layers/orb=${structure.layersPerOrb}`,
  );
}

// --- the accent, and only the accent, is what the orb is drawn in ---
{
  const expected = hexToRgb(palette.accent);
  record(
    "accent-reaches-the-orb",
    gradient === expected,
    `core gradient stop-color = ${gradient} (expected ${expected})`,
  );
}

// --- the three sizes come out at the sizes they declare ---
{
  const wrong = sizes.filter(
    (s) => s.width !== orbSize[s.size] || s.height !== orbSize[s.size],
  );
  record(
    "sizes-render-at-declared-px",
    sizes.length === orbSizes.length && wrong.length === 0,
    sizes.map((s) => `${s.size}=${s.width}×${s.height} (declared ${orbSize[s.size]})`).join(", "),
  );
}

// --- every state is actually moving ---
{
  const still = [];
  for (const state of orbStates) {
    const f = stateFeatures[state];
    const moving =
      f.coreScaleRange > 0.005 ||
      f.coreOpacityRange > 0.01 ||
      f.haloOpacityRange > 0.01 ||
      f.ringScaleRange > 0.01 ||
      f.shimmerTravelDeg > 30;
    if (!moving) still.push(state);
  }
  record(
    "every-state-animates",
    still.length === 0,
    still.length === 0
      ? orbStates
          .map((s) => `${s}: coreΔ${round(stateFeatures[s].coreScaleRange)} haloΔ${round(stateFeatures[s].haloOpacityRange)} arc${round(stateFeatures[s].shimmerTravelDeg, 0)}°`)
          .join(" | ")
      : `no measurable motion in: ${still.join(", ")}`,
  );
}

// --- and every pair is separable ---
{
  const collapsed = [];
  const separations = [];
  for (let i = 0; i < orbStates.length; i += 1) {
    for (let j = i + 1; j < orbStates.length; j += 1) {
      const a = orbStates[i];
      const b = orbStates[j];
      const ranked = FEATURES.map((f) => ({
        key: f.key,
        delta: Math.abs(stateFeatures[a][f.key] - stateFeatures[b][f.key]),
        gap: f.gap,
      }))
        .filter((f) => f.delta >= f.gap)
        .sort((x, y) => y.delta / y.gap - x.delta / x.gap);

      if (ranked.length === 0) collapsed.push(`${a}/${b}`);
      else
        separations.push(
          `${a}/${b} by ${ranked[0].key} Δ${round(ranked[0].delta)} (≥${ranked[0].gap})`,
        );
    }
  }
  record(
    "states-visibly-distinct",
    collapsed.length === 0,
    collapsed.length === 0
      ? `all 10 pairs separated — ${separations.join("; ")}`
      : `indistinguishable pair(s): ${collapsed.join(", ")}`,
  );
}

// --- a change of state blends, it does not cut ---
{
  const cuts = transitions.filter((t) => t.observed > t.budget);
  const expected = orbStates.length * SMOOTH_CHANNELS.length;
  record(
    "state-transitions-smooth",
    transitions.length === expected && cuts.length === 0,
    (cuts.length > 0 ? cuts : transitions)
      .map(
        (t) =>
          `${t.from}→${t.to} ${t.channel} ${round(t.observed, 2)}/s ` +
          `(budget ${round(t.budget, 2)}, steady ${round(t.steady, 2)})`,
      )
      .join(" | ") + (cuts.length > 0 ? `  ← ${cuts.length}/${expected} cut` : ""),
  );
}

// --- reduced motion stops the motion, rather than shortening it ---
{
  const moving = [];
  for (const state of orbStates) {
    const s = reducedSamples[state];
    for (const layer of ["halo", "ring", "core", "shimmer"]) {
      for (const key of ["opacity", "scale", "rotate"]) {
        if (range(channel(s, layer, key)) > 1e-6) {
          moving.push(`${state}.${layer}.${key} Δ${round(range(channel(s, layer, key)), 5)}`);
        }
      }
    }
  }
  record(
    "reduced-motion-is-static",
    moving.length === 0,
    moving.length === 0
      ? `all ${orbStates.length} states held still for 1200ms with prefers-reduced-motion: reduce`
      : `still moving: ${moving.join(", ")}`,
  );
}

// --- and what is left is a glow, not a blank ---
{
  const sample = reducedSamples[orbStates[0]][0];
  const glows =
    sample.core.opacity > 0.9 &&
    sample.halo.opacity > 0.2 &&
    sample.ring.opacity === 0 &&
    sample.shimmer.opacity === 0;
  record(
    "reduced-motion-still-glows",
    glows,
    `core ${sample.core.opacity}, halo ${sample.halo.opacity}, ring ${sample.ring.opacity}, arc ${sample.shimmer.opacity}`,
  );
}

process.exit(report() === 0 ? 0 : 1);
