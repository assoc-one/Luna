/**
 * Renders `config/tokens.ts` into the Tailwind v4 `@theme` block that becomes
 * `src/app/tokens.css`.
 *
 * Kept separate from the two entry points so the generator (`generate-theme.mjs`,
 * which writes) and the gate (`check-design.mjs`, which compares) render from
 * exactly the same function — a second implementation is a second source of
 * truth, which is the thing this whole arrangement exists to avoid.
 *
 * Output is deterministic: same tokens in, byte-identical CSS out. That is what
 * lets the gate be a plain string compare.
 */

export const GENERATED_PATH = "src/app/tokens.css";
export const TOKENS_PATH = "config/tokens.ts";

const BANNER = `/* ------------------------------------------------------------------------- *
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source:      ${TOKENS_PATH}
 * Regenerate:  npm run tokens
 * Gate:        npm run check:design   (CI fails if this file has drifted)
 *
 * Edit the tokens, not this file. A hand-edit here is reverted by the next
 * \`npm run tokens\` and rejected by CI in the meantime.
 * ------------------------------------------------------------------------- */`;

/** `  --name: value;`, or a section comment when `value` is undefined. */
function decl(name, value) {
  return `  --${name}: ${value};`;
}

function section(title) {
  return `\n  /* ${title} */`;
}

/**
 * @param {import("../config/tokens.ts").tokens} t
 * @returns {string} the full contents of {@link GENERATED_PATH}
 */
export function renderTheme(t) {
  const lines = [];

  // --- colour -------------------------------------------------------------
  //
  // `--color-*: initial` clears Tailwind's entire default palette before ours
  // is declared. This is what makes "greyscale plus one accent" a property of
  // the build rather than a rule people remember: `bg-sky-500` and friends stop
  // existing as utilities altogether. The keyword colours are re-declared
  // immediately below because they are not hues and code legitimately needs
  // them.
  lines.push(section("colour — Tailwind's default palette is cleared first"));
  lines.push(decl("color-*", "initial"));
  lines.push(decl("color-transparent", "transparent"));
  lines.push(decl("color-current", "currentColor"));
  lines.push(decl("color-inherit", "inherit"));

  lines.push(section("colour — palette"));
  const seen = new Set();
  for (const [key, value] of Object.entries(t.palette)) {
    seen.add(key);
    lines.push(decl(`color-${key}`, value));
  }

  lines.push(section("colour — semantic aliases"));
  for (const [key, value] of Object.entries(t.semantic)) {
    if (seen.has(key)) {
      throw new Error(
        `Token collision: "${key}" is declared in both \`palette\` and \`semantic\` ` +
          `in ${TOKENS_PATH}. Both are emitted as --color-${key}; rename one.`,
      );
    }
    seen.add(key);
    lines.push(decl(`color-${key}`, value));
  }

  // --- type ---------------------------------------------------------------
  lines.push(section("type — families"));
  lines.push(decl("font-display", t.type.fontFamily.display));
  lines.push(decl("font-body", t.type.fontFamily.body));
  // Tailwind's `font-sans` and unstyled text both resolve through this.
  lines.push(decl("font-sans", "var(--font-body)"));

  lines.push(section("type — size"));
  for (const [key, value] of Object.entries(t.type.size)) {
    lines.push(decl(`text-${key}`, value));
  }

  lines.push(section("type — weight"));
  for (const [key, value] of Object.entries(t.type.weight)) {
    lines.push(decl(`font-weight-${key}`, value));
  }

  lines.push(section("type — leading"));
  for (const [key, value] of Object.entries(t.type.leading)) {
    lines.push(decl(`leading-${key}`, value));
  }

  lines.push(section("type — tracking"));
  for (const [key, value] of Object.entries(t.type.tracking)) {
    lines.push(decl(`tracking-${key}`, value));
  }

  // --- spacing ------------------------------------------------------------
  //
  // One variable, not a ladder: Tailwind v4 derives every step from the base,
  // so `p-6` is `calc(var(--spacing) * 6)`.
  lines.push(section("spacing — base step; every utility derives from it"));
  lines.push(decl("spacing", t.spacing.base));

  // --- motion -------------------------------------------------------------
  lines.push(section("motion — duration"));
  for (const [key, value] of Object.entries(t.motion.duration)) {
    lines.push(decl(`duration-${key}`, value));
  }

  lines.push(section("motion — easing"));
  for (const [key, value] of Object.entries(t.motion.easing)) {
    lines.push(decl(`ease-${key}`, value));
  }

  lines.push(section("motion — page transition"));
  lines.push(decl("page-enter-offset", t.motion.pageEnterOffset));

  // --- elevation ----------------------------------------------------------
  lines.push(section("elevation"));
  for (const [key, value] of Object.entries(t.elevation)) {
    lines.push(decl(`shadow-${key}`, value));
  }

  // --- layout -------------------------------------------------------------
  lines.push(section("layout"));
  // `--container-*` backs `max-w-shell`; `--breakpoint-*` backs the `frame:` variant.
  lines.push(decl("container-shell", t.layout.shellWidth));
  lines.push(decl("breakpoint-frame", t.layout.frameBreakpoint));

  return `${BANNER}\n\n@theme {${lines.join("\n")}\n}\n`;
}
