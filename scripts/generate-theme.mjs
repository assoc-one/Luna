/**
 * Writes `src/app/tokens.css` from `config/tokens.ts`.
 *
 *   npm run tokens
 *
 * Run it after any change to the tokens and commit both files. `npm run
 * check:design` (and therefore CI) fails while the two are out of step.
 */

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { tokens } from "../config/tokens.ts";
import { GENERATED_PATH, renderTheme } from "./theme.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(repoRoot, GENERATED_PATH);

await writeFile(target, renderTheme(tokens), "utf8");

console.log(`[tokens] wrote ${GENERATED_PATH}`);
