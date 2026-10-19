// The site takes its design tokens and brand icons from the app, so nothing is copied by hand.
// Runs before `dev` and `build`. Fails loudly if the app's stylesheet changes shape.
//
// src/styles.css holds five token blocks (UI-SPEC 3.1): 1 constants, 2 Cover Light, 3 Cover
// Lamplight, 4 Marked Light, 5 Marked Lamplight. They are copied verbatim, followed by the
// Increase Contrast and reduced-transparency rules and a no-JavaScript fallback that follows
// the device's appearance.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(site, "..");

const SELECTORS = {
  constants: ":root",
  coverLight: ':root:not([data-look="marked"])',
  coverLamplight: ':root:not([data-look="marked"])[data-mode="lamplight"]',
  markedLight: ':root[data-look="marked"]',
  markedLamplight: ':root[data-look="marked"][data-mode="lamplight"]',
};
const FONT_TOKENS = ["--font-ui", "--font-scripture"];

/** The first rule that starts with `selector {`, as written, and its tokens (blocks hold no nested braces). */
function blockIn(css, selector) {
  const start = css.indexOf(selector + " {");
  if (start < 0)
    throw new Error(`sync-shared: "${selector}" not found in src/styles.css`);
  const end = css.indexOf("}", start);
  const text = css.slice(start, end + 1);
  const tokens = [...text.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map(
    ([, name, value]) => [name, value.trim()],
  );
  if (!tokens.length)
    throw new Error(`sync-shared: no tokens inside "${selector}"`);
  return { text, tokens };
}

/** A whole at-rule (`@media ... { ... }`), with its nested rules, as written. */
function atRuleIn(css, header) {
  const start = css.indexOf(header);
  if (start < 0)
    throw new Error(`sync-shared: "${header}" not found in src/styles.css`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`sync-shared: "${header}" is not closed in src/styles.css`);
}

const css = readFileSync(join(app, "src", "styles.css"), "utf8").replace(/\r\n/g, "\n");
const blocks = Object.fromEntries(
  Object.entries(SELECTORS).map(([key, selector]) => [key, blockIn(css, selector)]),
);

// Blocks 2 to 5 define the same colour tokens in the same order; fonts only in blocks 2 and 4.
const isFont = ([name]) => FONT_TOKENS.includes(name);
const colours = Object.fromEntries(
  ["coverLight", "coverLamplight", "markedLight", "markedLamplight"].map((key) => [
    key,
    blocks[key].tokens.filter((token) => !isFont(token)),
  ]),
);
const names = (list) => list.map(([name]) => name).join(",");
for (const key of ["coverLamplight", "markedLight", "markedLamplight"])
  if (names(colours.coverLight) !== names(colours[key]))
    throw new Error(`sync-shared: Cover Light and ${key} define different tokens`);
for (const key of ["coverLight", "markedLight"])
  if (names(blocks[key].tokens.filter(isFont)) !== FONT_TOKENS.join(","))
    throw new Error(`sync-shared: ${key} must define ${FONT_TOKENS.join(" and ")}`);
for (const key of ["coverLamplight", "markedLamplight"])
  if (blocks[key].tokens.some(isFont))
    throw new Error(`sync-shared: ${key} must inherit the font tokens, not define them`);

const lines = (list, indent) =>
  list.map(([name, value]) => `${indent}${name}: ${value};`).join("\n");
const fallback = (selector, list) =>
  `  ${selector} {\n    color-scheme: dark;\n${lines(list, "    ")}\n  }`;

const out = `/* Generated from ../src/styles.css by scripts/sync-shared.mjs. Do not edit. */
${blocks.constants.text}
${blocks.coverLight.text}
${blocks.coverLamplight.text}
${blocks.markedLight.text}
${blocks.markedLamplight.text}
${atRuleIn(css, "@media (prefers-contrast: more)")}
${atRuleIn(css, "@media (prefers-reduced-transparency: reduce)")}
/* Without JavaScript nothing sets data-mode: follow the device's appearance. */
@media (prefers-color-scheme: dark) {
${fallback(':root:not([data-look="marked"]):not([data-mode="light"])', colours.coverLamplight)}
${fallback(':root[data-look="marked"]:not([data-mode="light"])', colours.markedLamplight)}
}
`;

const styles = join(site, "src", "styles");
mkdirSync(styles, { recursive: true });
writeFileSync(join(styles, "tokens.generated.css"), out);
writeFileSync(
  join(styles, "tokens.generated.json"),
  JSON.stringify(
    colours.coverLight.map(([name, value], i) => ({
      name,
      coverLight: value,
      coverLamplight: colours.coverLamplight[i][1],
      markedLight: colours.markedLight[i][1],
      markedLamplight: colours.markedLamplight[i][1],
    })),
    null,
    2,
  ) + "\n",
);

mkdirSync(join(site, "public"), { recursive: true });
for (const icon of ["icon.svg", "apple-touch-icon.png"])
  copyFileSync(join(app, "public", icon), join(site, "public", icon));

console.log(
  `sync-shared: ${colours.coverLight.length} colour tokens in 4 blocks, ${blocks.constants.tokens.length} constants and 2 icons from the app`,
);
