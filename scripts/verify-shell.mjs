/**
 * The design foundation's runtime check (APP-62).
 *
 *   npm run build
 *   node scripts/verify-shell.mjs
 *
 * `npm run check:design` is a static gate: it reads the source. This one drives
 * the **built** app in a real browser and measures what is actually painted —
 * the shell's geometry at a phone width and at a desktop width, which faces the
 * text is rendered in, and every colour that reaches a pixel. Those are the
 * things the design foundation is judged on, and none of them are visible to
 * `tsc`, `eslint`, or a diff.
 *
 * ## No browser is a dependency of this repo, and none should be added
 *
 * Playwright appears in neither `dependencies` nor `devDependencies`. This
 * script reaches the image's global install by absolute path instead, which is
 * why a bare `import "playwright"` will not do — that resolves against this
 * repo's `node_modules`, the exact dependency being avoided. Both paths are
 * overridable:
 *
 *   PLAYWRIGHT_MODULE_PATH      default /opt/node22/lib/node_modules/playwright
 *   PLAYWRIGHT_EXECUTABLE_PATH  default /opt/pw-browsers/chromium-1194/chrome-linux/chrome
 *
 * They are properties of the image, not of this repo, and they move when the
 * image does — so set the variables rather than editing this file. If neither
 * resolves, the script exits with the path it tried rather than failing
 * obscurely. That is also why this is **not** wired into CI: the CI runner has
 * no browser, and a gate that cannot run is worse than one that is run
 * deliberately.
 *
 * ## It boots its own server, and asserts the port was free first
 *
 * A stale server from an earlier run holding the port is the classic false
 * green — every request goes to the old build and a broken change reports
 * clean. So the port is asserted free before anything starts, and the server
 * this script starts is the one it measures.
 *
 * If that abort fires, note that Next renames its process: the orphan shows up
 * in `ps` as `next-server (v16.3.2)`, **not** as the `next start` command line
 * you spawned, so `pkill -f "next start"` misses it. Find it with `ps aux | grep
 * next-server`.
 *
 * ## Reporting
 *
 * Every check — pass and fail — goes to stdout, ending in a single
 * `RESULT pass=<n> fail=<n>` line. A checker that writes its failures to a
 * stream its caller is not reading reports every break as silence, which is
 * indistinguishable from a check that cannot fail.
 *
 * Pass `--shots <dir>` to also write a screenshot per viewport.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { palette, semantic } from "../config/tokens.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const PORT = Number(process.env.VERIFY_SHELL_PORT ?? 3400);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const shotsFlag = process.argv.indexOf("--shots");
const shotsDir = shotsFlag === -1 ? null : process.argv[shotsFlag + 1];

const MODULE_PATH =
  process.env.PLAYWRIGHT_MODULE_PATH ?? "/opt/node22/lib/node_modules/playwright";
const EXECUTABLE_PATH =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

function report(extra) {
  if (extra) console.log(extra);
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
            `of the build under test. Free it, or set VERIFY_SHELL_PORT.`,
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

// ---------------------------------------------------------------------------

let require_;
let chromium;
try {
  require_ = createRequire(import.meta.url);
  ({ chromium } = require_(MODULE_PATH));
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

// Spawn the real Next binary, not a wrapper: killing a wrapper leaves the
// server orphaned and holding the port for the next run. `detached` so the
// whole process group can be taken down.
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

/** Everything measurable from one viewport. */
async function probe(width, height, label) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const requests = [];
  page.on("request", (r) => requests.push(r.url()));

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const data = await page.evaluate(() => {
    const shell = document.querySelector(".app-shell");
    const backdrop = document.querySelector(".app-backdrop");
    const transition = document.querySelector(".page-enter");
    const h1 = document.querySelector("h1");
    const cs = (el) => getComputedStyle(el);
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, width: r.width };
    };

    return {
      shell: shell ? rect(shell) : null,
      shellStyle: shell
        ? {
            backgroundColor: cs(shell).backgroundColor,
            borderLeftWidth: cs(shell).borderLeftWidth,
            borderRightWidth: cs(shell).borderRightWidth,
            borderLeftColor: cs(shell).borderLeftColor,
            boxShadow: cs(shell).boxShadow,
          }
        : null,
      backdropStyle: backdrop
        ? {
            backgroundImage: cs(backdrop).backgroundImage,
            backgroundColor: cs(backdrop).backgroundColor,
          }
        : null,
      transitionStyle: transition
        ? {
            animationName: cs(transition).animationName,
            animationDuration: cs(transition).animationDuration,
            animationTimingFunction: cs(transition).animationTimingFunction,
          }
        : null,
      h1Font: h1 ? cs(h1).fontFamily : null,
      bodyFont: cs(document.body).fontFamily,
      docScrollWidth: document.documentElement.scrollWidth,
      fontsStatus: document.fonts.status,
      spaceGroteskLoaded: document.fonts.check('1rem "Space Grotesk"'),
      interLoaded: document.fonts.check('1rem "Inter"'),
      /** Every colour actually painted anywhere in the tree. */
      paintedColours: (() => {
        const set = new Set();
        for (const el of document.querySelectorAll("*")) {
          const s = getComputedStyle(el);
          for (const prop of [
            "color",
            "backgroundColor",
            "borderTopColor",
            "borderRightColor",
            "borderBottomColor",
            "borderLeftColor",
          ]) {
            const v = s[prop];
            if (v && v !== "rgba(0, 0, 0, 0)") set.add(v);
          }
        }
        return [...set].sort();
      })(),
    };
  });

  if (shotsDir) {
    await mkdir(shotsDir, { recursive: true });
    await page.screenshot({ path: join(shotsDir, `${label}.png`) });
  }

  await context.close();
  return {
    ...data,
    externalFontRequests: requests.filter((u) =>
      /fonts\.(googleapis|gstatic)\.com/.test(u),
    ),
  };
}

/** `#rrggbb` → `rgb(r, g, b)`, the form getComputedStyle returns. */
function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const SHELL_WIDTH = 390;
const DESKTOP_WIDTH = 1440;

let mobile;
let desktop;
try {
  mobile = await probe(SHELL_WIDTH, 844, "mobile-390");
  desktop = await probe(DESKTOP_WIDTH, 900, "desktop-1440");
} finally {
  await browser.close();
  stopServer();
}

// --- the palette is greyscale plus one accent, and nothing else is painted ---
{
  // Derived from the tokens, so a palette change does not need this edited —
  // and a colour that is not in the tokens at all cannot be waved through.
  const allowed = new Set(
    [...Object.values(palette), ...Object.values(semantic)].map(hexToRgb),
  );
  const painted = new Set([...mobile.paintedColours, ...desktop.paintedColours]);
  const stray = [...painted].filter((c) => !allowed.has(c));

  record(
    "palette-only-painted",
    stray.length === 0,
    stray.length === 0
      ? `${painted.size} colour(s), all from the tokens: ${[...painted].join(" | ")}`
      : `off-palette painted colour(s): ${stray.join(" | ")}`,
  );
  record(
    "accent-reaches-the-page",
    painted.has(hexToRgb(palette.accent)),
    `expected ${hexToRgb(palette.accent)} among ${[...painted].join(" | ")}`,
  );
}

// --- geometry: full-bleed at the shell width, centred above the breakpoint ---
{
  record(
    "mobile-full-bleed",
    mobile.shell !== null &&
      Math.round(mobile.shell.width) === SHELL_WIDTH &&
      Math.round(mobile.shell.x) === 0 &&
      mobile.shellStyle.borderLeftWidth === "0px",
    `shell x=${mobile.shell?.x} w=${mobile.shell?.width} border-left=${mobile.shellStyle?.borderLeftWidth}`,
  );
  record(
    "mobile-no-horizontal-scroll",
    mobile.docScrollWidth <= SHELL_WIDTH,
    `documentElement.scrollWidth=${mobile.docScrollWidth} (viewport ${SHELL_WIDTH})`,
  );

  const expectedX = (DESKTOP_WIDTH - SHELL_WIDTH) / 2;
  record(
    "desktop-centred",
    desktop.shell !== null &&
      Math.round(desktop.shell.width) === SHELL_WIDTH &&
      Math.abs(desktop.shell.x - expectedX) <= 1,
    `shell x=${desktop.shell?.x} (expected ~${expectedX}) w=${desktop.shell?.width}`,
  );
  record(
    "desktop-framed",
    desktop.shellStyle?.borderLeftWidth === "1px" &&
      desktop.shellStyle?.borderRightWidth === "1px" &&
      desktop.shellStyle?.boxShadow !== "none",
    `borders ${desktop.shellStyle?.borderLeftWidth}/${desktop.shellStyle?.borderRightWidth} @ ${desktop.shellStyle?.borderLeftColor}`,
  );
  record(
    "desktop-backdrop-gradient",
    /radial-gradient/.test(desktop.backdropStyle?.backgroundImage ?? ""),
    desktop.backdropStyle?.backgroundImage ?? "none",
  );
  record(
    "shell-reads-against-backdrop",
    desktop.shellStyle?.backgroundColor !== desktop.backdropStyle?.backgroundColor,
    `shell ${desktop.shellStyle?.backgroundColor} vs backdrop ${desktop.backdropStyle?.backgroundColor}`,
  );
}

// --- type: the real faces render, self-hosted, with metric-matched fallbacks ---
{
  record(
    "no-external-font-requests",
    mobile.externalFontRequests.length === 0 &&
      desktop.externalFontRequests.length === 0,
    `external font requests: ${
      [...mobile.externalFontRequests, ...desktop.externalFontRequests].join(", ") ||
      "none"
    }`,
  );
  record(
    "faces-loaded",
    mobile.fontsStatus === "loaded" &&
      mobile.spaceGroteskLoaded &&
      mobile.interLoaded,
    `document.fonts.status=${mobile.fontsStatus}, Space Grotesk=${mobile.spaceGroteskLoaded}, Inter=${mobile.interLoaded}`,
  );
  record(
    "display-face-applied",
    /Space Grotesk/.test(mobile.h1Font ?? ""),
    `h1 font-family = ${mobile.h1Font}`,
  );
  record(
    "body-face-applied",
    /Inter/.test(mobile.bodyFont ?? ""),
    `body font-family = ${mobile.bodyFont}`,
  );
  record(
    "metric-matched-fallbacks",
    /Space Grotesk Fallback/.test(mobile.h1Font ?? "") &&
      /Inter Fallback/.test(mobile.bodyFont ?? ""),
    "next/font's size-adjusted fallback faces are in both stacks, so a pre-swap render occupies the same space",
  );
}

// --- the shell wraps the route, and the transition is wired at shell level ---
{
  record(
    "shell-wraps-the-route",
    mobile.shell !== null && desktop.shell !== null,
    ".app-shell is present on the rendered route",
  );
  const t = mobile.transitionStyle;
  record(
    "page-transition-wired",
    t?.animationName === "page-enter" && /cubic-bezier/.test(t?.animationTimingFunction ?? ""),
    `animation ${t?.animationName} ${t?.animationDuration} ${t?.animationTimingFunction}`,
  );
}

process.exit(report() === 0 ? 0 : 1);
