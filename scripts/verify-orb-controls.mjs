/**
 * Negative controls for `scripts/verify-orb.mjs` (APP-64).
 *
 *   npm run build
 *   node scripts/verify-orb-controls.mjs
 *
 * A check that has never been seen to fail is not evidence. This applies one
 * deliberate break at a time, rebuilds, runs `verify:orb`, and asserts that the
 * checks which *should* go red do, and that the rest stay green — then restores
 * the file and moves on. It ends with a **positive** control: an unmodified
 * baseline, which has to come back clean. A matrix of red rows without a green
 * baseline cannot tell a working check from one that fails on everything.
 *
 * It exists as a script rather than as a paragraph in a pull request because the
 * next person to touch the harness needs to re-run it, not read about it. Each
 * break is an exact `find` → `replace` on a real source file, so the recipe is
 * the code.
 *
 * ## It refuses to run on a dirty tree, and that is the point
 *
 * Every control ends in a restore. A restore cannot tell a deliberate break from
 * someone's uncommitted work, and the files a control targets are exactly the
 * files that implement the criteria — so a control run over unstaged edits
 * reverts the change under review, silently, in the flattering direction. The
 * clean-tree assertion is what makes "restore" mean "back to the committed
 * state" and nothing else.
 *
 * Reporting matches the rest of the repo: every row, pass and fail, to stdout,
 * ending in one `RESULT pass=<n> fail=<n>` line.
 */

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const ORB = "src/components/LunaOrb.tsx";

/**
 * One break each, aimed at one check each.
 *
 * `expectRed` names the checks the break must redden. Naming them — rather than
 * counting them — is what makes a miscount visible without re-running anything,
 * and what stops a break that reddens the *wrong* check reading as a success.
 */
const CONTROLS = [
  {
    name: "every state becomes idle",
    file: ORB,
    find: "    to.current = orbParams[state];",
    replace: "    to.current = orbParams.idle;",
    expectRed: ["states-visibly-distinct"],
  },
  {
    name: "the state blend completes instantly (a cut, not a blend)",
    file: ORB,
    find: "    const controls = animate(blend, 1, orbMotion.stateTransition);",
    replace:
      "    blend.set(1);\n    const controls = animate(blend, 1, orbMotion.stateTransition);",
    expectRed: ["state-transitions-smooth"],
  },
  {
    name: "reduced motion is ignored",
    file: ORB,
    find: "      {reduced ? null : <OrbDriver state={state} channels={channels} />}",
    replace: "      <OrbDriver state={state} channels={channels} />",
    expectRed: ["reduced-motion-is-static"],
  },
  {
    name: "every size renders at md",
    file: ORB,
    find: "  const box = orbSize[size];",
    replace: "  const box = orbSize.md;",
    expectRed: ["sizes-render-at-declared-px"],
  },
  {
    name: "the core is drawn in currentColor, not the accent",
    file: ORB,
    find: '<stop offset="0%" style={{ stopColor: "var(--color-accent)", stopOpacity: 1 }} />',
    replace: '<stop offset="0%" style={{ stopColor: "currentColor", stopOpacity: 1 }} />',
    expectRed: ["accent-reaches-the-orb"],
  },
  {
    name: "the clock stops (phase never advances)",
    file: ORB,
    find: "    const dt = Math.min(delta, orbMotion.maxFrameMs) / 1000;",
    replace: "    const dt = 0;",
    expectRed: ["every-state-animates", "states-visibly-distinct"],
  },
];

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

async function assertCleanTree() {
  const { stdout } = await run("git", ["status", "--porcelain"], { cwd: repoRoot });
  if (stdout.trim() !== "") {
    throw new Error(
      "The working tree is not clean. Every control here ends in a restore, and a " +
        "restore cannot tell a deliberate break from your uncommitted work — it would " +
        "silently revert it. Commit or stash first.\n\n" +
        stdout,
    );
  }
}

/** Build, then run the orb check. Returns the set of check names that went red. */
async function buildAndCheck() {
  await run("npm", ["run", "build"], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 });
  try {
    const { stdout } = await run("npm", ["run", "verify:orb"], {
      cwd: repoRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    return parse(stdout);
  } catch (err) {
    // A non-zero exit is the expected outcome of a control, not an error.
    if (typeof err.stdout === "string" && err.stdout.includes("RESULT ")) {
      return parse(err.stdout);
    }
    throw err;
  }
}

function parse(stdout) {
  const red = new Set();
  const green = new Set();
  for (const line of stdout.split("\n")) {
    const fail = /^ {2}FAIL {2}(\S+)/.exec(line);
    if (fail) red.add(fail[1]);
    const ok = /^ {2}ok {4}(\S+)/.exec(line);
    if (ok) green.add(ok[1]);
  }
  const summary = /RESULT pass=(\d+) fail=(\d+)/.exec(stdout);
  if (!summary) throw new Error(`verify:orb printed no RESULT line:\n${stdout}`);
  return { red, green, pass: Number(summary[1]), fail: Number(summary[2]) };
}

// ---------------------------------------------------------------------------

await assertCleanTree();

for (const control of CONTROLS) {
  const path = join(repoRoot, control.file);
  const original = await readFile(path, "utf8");

  const occurrences = original.split(control.find).length - 1;
  if (occurrences !== 1) {
    record(
      control.name,
      false,
      `anchor matched ${occurrences} times in ${control.file}; it must match exactly once`,
    );
    continue;
  }

  await writeFile(path, original.replace(control.find, control.replace));
  try {
    const { red, pass, fail } = await buildAndCheck();
    const missing = control.expectRed.filter((name) => !red.has(name));
    const surprising = [...red].filter((name) => !control.expectRed.includes(name));
    record(
      control.name,
      missing.length === 0 && surprising.length === 0,
      `red: [${[...red].join(", ") || "none"}] (pass=${pass} fail=${fail})` +
        (missing.length ? `  MISSING: ${missing.join(", ")}` : "") +
        (surprising.length ? `  UNEXPECTED: ${surprising.join(", ")}` : ""),
    );
  } catch (err) {
    record(control.name, false, `control could not be run: ${err.message}`);
  } finally {
    await writeFile(path, original);
  }
}

// The positive control. Without it, every row above is equally consistent with a
// harness that fails on anything at all.
try {
  const { red, pass, fail } = await buildAndCheck();
  record(
    "positive control — unmodified baseline is green",
    fail === 0,
    `pass=${pass} fail=${fail}` + (fail ? ` red: [${[...red].join(", ")}]` : ""),
  );
} catch (err) {
  record("positive control — unmodified baseline is green", false, err.message);
}

let pass = 0;
let fail = 0;
console.log("");
for (const { name, ok, detail } of results) {
  if (ok) {
    pass += 1;
    console.log(`  ok    ${name}\n          ${detail}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}\n          ${detail}`);
  }
}
console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
