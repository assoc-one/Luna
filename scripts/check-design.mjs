/**
 * The design-token gate.
 *
 *   npm run check:design
 *
 * Three checks, all of them things that are true today and would otherwise go
 * quietly false later:
 *
 *   1. **theme-in-sync** — `src/app/tokens.css` is exactly what `config/tokens.ts`
 *      renders to. Tailwind v4's theme is CSS, the tokens are TypeScript, and
 *      generated output that nothing verifies is just a second source of truth
 *      with a comment on top.
 *
 *   2. **palette-only** — nothing under `src/` introduces a colour outside the
 *      token palette. "Greyscale plus one warm orange" is a locked MVP decision
 *      (project decision log, 2026-05-21); this is what makes breaking it fail
 *      loudly rather than just look slightly wrong. It catches the three ways a
 *      colour actually gets in: a hex literal, a CSS colour function, and a
 *      Tailwind default-palette utility class. It is a lint, not a proof — a
 *      colour smuggled in via a runtime-computed string would pass — but the
 *      generated theme also clears Tailwind's default palette outright, so the
 *      utility-class route is closed by construction as well as flagged here.
 *
 *   3. **font-variables** — `src/app/layout.tsx` still declares the CSS custom
 *      properties named in `type.fontVariable`. `next/font` is a build-time
 *      transform and will only accept literals, so those names cannot be
 *      imported from the tokens and have to be repeated. Repeating them is
 *      fine; repeating them *unchecked* is how the theme ends up pointing at a
 *      variable nothing defines, which degrades silently to the fallback stack.
 *
 * Reporting: every result — pass and fail — goes to stdout, and the run ends
 * with a single `RESULT pass=<n> fail=<n>` line. A checker that writes its
 * failures somewhere its caller is not reading reports every break as silence,
 * which is indistinguishable from "this check cannot fail".
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { tokens } from "../config/tokens.ts";
import { GENERATED_PATH, TOKENS_PATH, renderTheme } from "./theme.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {{ name: string, ok: boolean, detail: string[] }[]} */
const results = [];

function record(name, ok, detail = []) {
  results.push({ name, ok, detail });
}

// ---------------------------------------------------------------------------
// 1. theme-in-sync
// ---------------------------------------------------------------------------

{
  const expected = renderTheme(tokens);
  let actual;
  try {
    actual = await readFile(join(repoRoot, GENERATED_PATH), "utf8");
  } catch {
    actual = null;
  }

  if (actual === null) {
    record("theme-in-sync", false, [
      `${GENERATED_PATH} does not exist. Run \`npm run tokens\`.`,
    ]);
  } else if (actual !== expected) {
    const expectedLines = expected.split("\n");
    const actualLines = actual.split("\n");
    const detail = [
      `${GENERATED_PATH} is out of step with ${TOKENS_PATH}. Run \`npm run tokens\` and commit the result.`,
    ];
    const max = Math.max(expectedLines.length, actualLines.length);
    let shown = 0;
    for (let i = 0; i < max && shown < 5; i += 1) {
      if (expectedLines[i] !== actualLines[i]) {
        detail.push(
          `  line ${i + 1}: expected ${JSON.stringify(expectedLines[i] ?? null)}, found ${JSON.stringify(actualLines[i] ?? null)}`,
        );
        shown += 1;
      }
    }
    record("theme-in-sync", false, detail);
  } else {
    record("theme-in-sync", true);
  }
}

// ---------------------------------------------------------------------------
// 2. palette-only
// ---------------------------------------------------------------------------

/** Tailwind's default colour families — the ones the generated theme clears. */
const TAILWIND_COLOUR_FAMILIES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
].join("|");

const COLOUR_UTILITY_PREFIXES = [
  "text",
  "bg",
  "border",
  "ring",
  "outline",
  "fill",
  "stroke",
  "shadow",
  "accent",
  "caret",
  "decoration",
  "divide",
  "placeholder",
  "from",
  "via",
  "to",
].join("|");

const PATTERNS = [
  {
    label: "hex colour literal",
    re: /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g,
  },
  {
    label: "CSS colour function",
    re: /\b(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab|color-mix)\s*\(/g,
  },
  {
    label: "Tailwind default-palette utility",
    re: new RegExp(
      `\\b(?:${COLOUR_UTILITY_PREFIXES})-(?:${TAILWIND_COLOUR_FAMILIES})-\\d{2,3}\\b`,
      "g",
    ),
  },
];

/** Files exempt from check 2, with the reason. */
const PALETTE_EXEMPT = new Map([
  [GENERATED_PATH, "generated from the tokens — it is where the palette is declared"],
]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

{
  const offences = [];
  const scanned = [];

  for await (const full of walk(join(repoRoot, "src"))) {
    if (!/\.(?:ts|tsx|css)$/.test(full)) continue;
    const rel = relative(repoRoot, full).split("\\").join("/");
    if (PALETTE_EXEMPT.has(rel)) continue;
    scanned.push(rel);

    const source = await readFile(full, "utf8");
    const lines = source.split("\n");
    for (const { label, re } of PATTERNS) {
      lines.forEach((line, i) => {
        for (const match of line.matchAll(re)) {
          offences.push(`  ${rel}:${i + 1}  ${label}: ${match[0]}`);
        }
      });
    }
  }

  if (scanned.length === 0) {
    record("palette-only", false, [
      "scanned no files under src/ — the walk is broken, not the palette",
    ]);
  } else if (offences.length > 0) {
    record("palette-only", false, [
      `${offences.length} off-palette colour reference(s) under src/. Use a token: see ${TOKENS_PATH}.`,
      ...offences,
    ]);
  } else {
    record("palette-only", true, [`${scanned.length} file(s) scanned`]);
  }
}

// ---------------------------------------------------------------------------
// 3. font-variables
// ---------------------------------------------------------------------------

{
  const layoutPath = "src/app/layout.tsx";
  const source = await readFile(join(repoRoot, layoutPath), "utf8");
  const missing = Object.entries(tokens.type.fontVariable)
    .filter(([, variable]) => !source.includes(`"${variable}"`))
    .map(
      ([role, variable]) =>
        `  ${layoutPath} does not declare ${variable} (the ${role} face). ` +
        `The theme's --font-${role} points at it.`,
    );

  if (missing.length > 0) {
    record("font-variables", false, missing);
  } else {
    record("font-variables", true);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;

for (const { name, ok, detail } of results) {
  if (ok) {
    pass += 1;
    console.log(`  ok    ${name}${detail.length ? `  (${detail.join("; ")})` : ""}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}`);
    for (const line of detail) console.log(line);
  }
}

console.log(`RESULT pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
