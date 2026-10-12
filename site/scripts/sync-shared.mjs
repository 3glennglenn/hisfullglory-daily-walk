// The site takes its design tokens and brand icons from the app, so nothing is copied by hand.
// Runs before `dev` and `build`. Fails loudly if the app's stylesheet changes shape.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(site, "..");

function tokensIn(css, selector) {
  const start = css.indexOf(selector + " {");
  if (start < 0)
    throw new Error(`sync-shared: "${selector}" not found in src/styles.css`);
  const block = css.slice(start, css.indexOf("}", start));
  const found = [...block.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map(
    ([, name, value]) => [name, value.trim()],
  );
  if (!found.length)
    throw new Error(`sync-shared: no tokens inside "${selector}"`);
  return found;
}

const css = readFileSync(join(app, "src", "styles.css"), "utf8");
const light = tokensIn(css, ":root");
const dark = tokensIn(css, ':root[data-theme="dark"]');
const names = (list) => list.map(([name]) => name).join(",");
if (names(light) !== names(dark))
  throw new Error("sync-shared: Light and Dark define different tokens");

const lines = (list, indent) =>
  list.map(([name, value]) => `${indent}${name}: ${value};`).join("\n");
const out = `/* Generated from ../src/styles.css by scripts/sync-shared.mjs. Do not edit. */
:root {
  color-scheme: light;
${lines(light, "  ")}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${lines(dark, "    ")}
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
${lines(dark, "  ")}
}
`;

const styles = join(site, "src", "styles");
mkdirSync(styles, { recursive: true });
writeFileSync(join(styles, "tokens.generated.css"), out);
writeFileSync(
  join(styles, "tokens.generated.json"),
  JSON.stringify(
    light.map(([name, value], i) => ({ name, light: value, dark: dark[i][1] })),
    null,
    2,
  ) + "\n",
);

mkdirSync(join(site, "public"), { recursive: true });
for (const icon of ["icon.svg", "apple-touch-icon.png"])
  copyFileSync(join(app, "public", icon), join(site, "public", icon));

console.log(`sync-shared: ${light.length} tokens and 2 icons from the app`);
