// Contrast guard for the shared design tokens (UX-01, WCAG 2.2 AA; UI-SPEC 5.1 and 5.4).
// "Contrast" here means the WCAG 2.1 relative-luminance ratio computed from the sRGB hex values,
// not how a colour looks: text pairs need 4.5:1, large text, focus rings, control edges and
// meaningful graphics need 3:1. Every pair of the UI-SPEC table is proven in all four colour
// blocks of src/styles.css (Cover Light, Cover Lamplight, Marked Light, Marked Lamplight), and the
// Increase Contrast values are proven on top of them. The figures in the table are the figures
// asserted here, to two decimals.
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const appCss = readFileSync("src/styles.css", "utf8").replace(/\r\n/g, "\n");
const siteCss = readFileSync("site/src/styles/global.css", "utf8").replace(/\r\n/g, "\n");

type Key = "coverLight" | "coverLamplight" | "markedLight" | "markedLamplight";
const keys: Key[] = ["coverLight", "coverLamplight", "markedLight", "markedLamplight"];
const selectors: Record<Key, string> = {
  coverLight: ':root:not([data-look="marked"])',
  coverLamplight: ':root:not([data-look="marked"])[data-mode="lamplight"]',
  markedLight: ':root[data-look="marked"]',
  markedLamplight: ':root[data-look="marked"][data-mode="lamplight"]',
};
const labels: Record<Key, string> = {
  coverLight: "Cover Light",
  coverLamplight: "Cover Lamplight",
  markedLight: "Marked Light",
  markedLamplight: "Marked Lamplight",
};
const FONT_TOKENS = ["--font-ui", "--font-scripture"];

/** The text between `selector {` and its closing brace (token blocks hold no nested braces). */
function blockOf(css: string, selector: string): string {
  const start = css.indexOf(selector + " {");
  assert.ok(start >= 0, `${selector} block found in src/styles.css`);
  return css.slice(start, css.indexOf("}", start));
}

/** Ordered [name, value] pairs of the custom properties in a block. */
function tokensIn(block: string): [string, string][] {
  return [...block.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map(([, name, value]) => [name, value.trim()]);
}

const constants = new Map(tokensIn(blockOf(appCss, ":root")));
const own: Record<Key, [string, string][]> = {
  coverLight: tokensIn(blockOf(appCss, selectors.coverLight)),
  coverLamplight: tokensIn(blockOf(appCss, selectors.coverLamplight)),
  markedLight: tokensIn(blockOf(appCss, selectors.markedLight)),
  markedLamplight: tokensIn(blockOf(appCss, selectors.markedLamplight)),
};
const isFont = ([name]: [string, string]) => FONT_TOKENS.includes(name);
const colourList = (key: Key) => own[key].filter((token) => !isFont(token));
// A Lamplight block inherits the font tokens of the Light block of its look.
const blocks: Record<Key, Map<string, string>> = {
  coverLight: new Map(own.coverLight),
  coverLamplight: new Map([...own.coverLight.filter(isFont), ...own.coverLamplight]),
  markedLight: new Map(own.markedLight),
  markedLamplight: new Map([...own.markedLight.filter(isFont), ...own.markedLamplight]),
};

/** #rgb, #rrggbb or #rrggbbaa to [r, g, b, a], each 0..1. */
function rgba(hex: string): [number, number, number, number] {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  assert.match(h, /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i, `${hex} is an sRGB hex colour`);
  const channel = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return [channel(0), channel(2), channel(4), h.length === 8 ? channel(6) : 1];
}

/** Source-over: `top` (with its alpha) laid on the opaque `base`, as an opaque hex colour. */
function composite(top: string, base: string): string {
  const [tr, tg, tb, ta] = rgba(top);
  const [br, bg, bb, ba] = rgba(base);
  assert.equal(ba, 1, `${base} is opaque`);
  const out = [tr, tg, tb].map((c, i) => c * ta + [br, bg, bb][i] * (1 - ta));
  return "#" + out.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const [r, g, b, a] = rgba(hex);
  assert.equal(a, 1, `${hex} must be opaque for a contrast ratio`);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const two = (n: number) => Math.round(n * 100) / 100;

function token(map: Map<string, string>, name: string): string {
  const value = map.get(name);
  assert.ok(value, `${name} is defined`);
  return value;
}

/** A colour named by a token, or `--top/--base`: the translucent top token laid on the opaque base token. */
function colourOf(map: Map<string, string>, spec: string): string {
  if (!spec.includes("/")) return token(map, spec);
  const [top, base] = spec.split("/");
  return composite(token(map, top), token(map, base));
}

// Sanity check of the formula against the two extremes, a known mid value and the compositor.
test("the contrast formula returns 21:1 for black on white and 1:1 for equal colours", () => {
  assert.equal(two(ratio("#000000", "#ffffff")), 21);
  assert.equal(ratio("#777777", "#777777"), 1);
  assert.ok(Math.abs(ratio("#767676", "#ffffff") - 4.54) < 0.01, "#767676 on white is the known 4.54:1");
  assert.equal(composite("#FFFFFF80", "#000000"), "#808080");
  assert.equal(composite("#FF000000", "#00FF00"), "#00ff00");
});

test("the four colour blocks list the same tokens in the same order; only the Light blocks carry the fonts", () => {
  const names = (key: Key) => colourList(key).map(([name]) => name);
  for (const key of keys.slice(1)) assert.deepEqual(names(key), names("coverLight"), `${labels[key]} token list`);
  for (const key of ["coverLight", "markedLight"] as Key[])
    assert.deepEqual(own[key].filter(isFont).map(([name]) => name), FONT_TOKENS, `${labels[key]} defines both font tokens`);
  for (const key of ["coverLamplight", "markedLamplight"] as Key[])
    assert.equal(own[key].filter(isFont).length, 0, `${labels[key]} inherits the font tokens`);
  assert.doesNotMatch(selectors.coverLight, /data-mode/, "with no attributes at all the page renders Cover Light");
});

// UI-SPEC 5.1: [Cover Light, Cover Lamplight, Marked Light, Marked Lamplight] per token, in order.
const spec51: [string, string, string, string, string][] = [
  ["--bg", "#F3F1EE", "#1A120E", "#FFFDF9", "#1A120E"],
  ["--surface", "#FFFFFF", "#251914", "#F6F0E7", "#251914"],
  ["--surface-2", "#ECE7E1", "#33251E", "#F0E8DD", "#33251E"],
  ["--ink", "#251914", "#F6F0E7", "#251914", "#F6F0E7"],
  ["--muted", "#675A52", "#C2B0A2", "#6B5B52", "#C2B0A2"],
  ["--line", "#DCD4CC", "#3E2F27", "#E6DCCF", "#3E2F27"],
  ["--link", "#8D5C4B", "#E2AE96", "#8D5C4B", "#E2AE96"],
  ["--button", "#8D5C4B", "#B97862", "#251914", "#B97862"],
  ["--on-button", "#FFFFFF", "#1A120E", "#FFFDF9", "#1A120E"],
  ["--brand", "#B97862", "#B97862", "#B97862", "#B97862"],
  ["--focus", "#8D5C4B", "#E2AE96", "#8D5C4B", "#E2AE96"],
  ["--sig", "#603F33", "#5A3B2F", "#FFFDF9", "#1A120E"],
  ["--on-sig", "#F6F0E7", "#F6F0E7", "#251914", "#F6F0E7"],
  ["--sig-muted", "#D9C3B4", "#DCC7B9", "#6B5B52", "#C2B0A2"],
  ["--gilt", "#E3C08A", "#E8C892", "#B97862", "#B97862"],
  ["--sig-button", "#F6F0E7", "#F6F0E7", "#251914", "#B97862"],
  ["--on-sig-button", "#603F33", "#5A3B2F", "#FFFDF9", "#1A120E"],
  ["--sig-focus", "#E3C08A", "#E8C892", "#8D5C4B", "#E2AE96"],
  ["--ai", "#4B5D6E", "#A9B8C9", "#4B5D6E", "#A9B8C9"],
  ["--on-ai", "#FFFFFF", "#1A120E", "#FFFFFF", "#1A120E"],
  ["--community", "#4A6247", "#A9C4A0", "#4A6247", "#A9C4A0"],
  ["--danger", "#9B2C24", "#F2A59B", "#9B2C24", "#F2A59B"],
  ["--on-danger", "#FFFFFF", "#1A120E", "#FFFFFF", "#1A120E"],
  ["--success", "#456448", "#99C49B", "#456448", "#99C49B"],
  ["--highlight-gold", "#F1DFAC", "#534523", "#F1DFAC", "#534523"],
  ["--highlight-sage", "#D9E4D2", "#30452E", "#D9E4D2", "#30452E"],
  ["--highlight-rose", "#EFD2CA", "#55362F", "#EFD2CA", "#55362F"],
  ["--spine-1", "#603F33", "#5A3B2F", "#F6F0E7", "#33251E"],
  ["--spine-2", "#6A4538", "#6A4536", "#F0E8DD", "#3E2C23"],
  ["--spine-3", "#4E3329", "#4A3026", "#E6D8C6", "#2C1F19"],
  ["--spine-ink", "#E3C08A", "#E8C892", "#251914", "#F6F0E7"],
  // Marked Light is white here, not the printed #FFFDF9EB: see the thin-margins test.
  ["--bar", "#FFFFFFEB", "#251914EB", "#FFFFFFEB", "#251914EB"],
  ["--bar-solid", "#FFFFFF", "#251914", "#FFFDF9", "#251914"],
  ["--glow", "#F0C98700", "#F0C98729", "#F0C98700", "#F0C98729"],
  ["--overlay", "#25191466", "#000000A0", "#25191466", "#000000A0"],
  ["--shadow", "#2519141F", "#00000066", "#2519141F", "#00000066"],
  ["--theme-color", "#F3F1EE", "#1A120E", "#FFFDF9", "#1A120E"],
];

test("every colour token has the exact value of UI-SPEC 5.1 in each of the four blocks", () => {
  assert.deepEqual(
    colourList("coverLight").map(([name]) => name),
    spec51.map(([name]) => name),
    "token names and order",
  );
  for (const [name, ...values] of spec51)
    keys.forEach((key, i) =>
      assert.equal(token(blocks[key], name).toUpperCase(), values[i], `${name} in ${labels[key]}`),
    );
});

test("Lamplight blocks switch the browser to a dark colour scheme and Light blocks do not", () => {
  const scheme = (key: Key) => blockOf(appCss, selectors[key]).match(/color-scheme:\s*(\w+)/)?.[1];
  assert.deepEqual(keys.map(scheme), ["light", "dark", "light", "dark"]);
});

test("the constants block holds the type scale, spacing, radius, elevation and motion tokens", () => {
  assert.equal(constants.get("--text-body"), "1rem");
  assert.equal(constants.get("--text-numeral"), "calc(2rem + 44px)");
  for (const name of ["--text-large-title", "--text-display", "--text-title", "--text-scripture", "--text-footnote"])
    assert.ok(constants.has(name), name);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => constants.get(`--space-${n}`)),
    ["4px", "8px", "12px", "16px", "20px", "24px", "32px", "48px", "64px"],
  );
  for (const name of ["--radius-xs", "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl", "--radius-pill"])
    assert.ok(constants.has(name), name);
  assert.match(constants.get("--elev-float") ?? "", /var\(--shadow\)/);
  assert.match(constants.get("--elev-sheet") ?? "", /var\(--shadow\)/);
  assert.equal(constants.get("--dur-spine"), "360ms");
  // Nothing in the constants block is a colour: those belong to the four blocks.
  for (const [name, value] of constants) assert.doesNotMatch(value, /#[0-9a-f]{3,8}\b/i, `${name} holds no hex colour`);
});

test("the root is 17px at the default text size and follows the system text size on Apple WebKit", () => {
  assert.match(appCss, /html \{\n  font-size: 106\.25%;\n\}/, "106.25% of the browser's 16px is 17px");
  assert.match(appCss, /@supports \(font: -apple-system-body\) \{\n  html \{\n    font: -apple-system-body;/);
  const body = blockOf(appCss, "body");
  assert.match(body, /font-size: var\(--text-body\);/);
  assert.match(body, /font-family: var\(--font-ui\);/);
  assert.match(body, /color: var\(--ink\);/);
  assert.match(body, /background: var\(--bg\);/);
  assert.match(body, /font-synthesis: none;/);
});

// UI-SPEC 5.4. fg and bg name tokens; "--bar/--ink" is the translucent bar laid on ink-coloured
// content (worst case). `need` is the contrast the pair must reach; one number for all four blocks
// or one per block. `expected` is the figure printed in the spec, to two decimals. `shortfall`
// marks a pair the spec records as below 4.5 on purpose: the rule that avoids it is tested below.
interface Row {
  label: string;
  fg: string | [string, string, string, string];
  bg: string;
  need: number | [number, number, number, number];
  expected: [number, number, number, number];
  shortfall?: [boolean, boolean, boolean, boolean];
  /** How far the computed figure may be from the printed one; 0.01 unless the row says why not. */
  tolerance?: number;
}
const rows: Row[] = [
  { label: "ink / bg", fg: "--ink", bg: "--bg", need: 4.5, expected: [15.17, 16.3, 16.83, 16.3] },
  { label: "ink / surface", fg: "--ink", bg: "--surface", need: 4.5, expected: [17.1, 15.09, 15.09, 15.09] },
  { label: "ink / surface-2", fg: "--ink", bg: "--surface-2", need: 4.5, expected: [13.91, 13.01, 14.08, 13.01] },
  { label: "muted / bg", fg: "--muted", bg: "--bg", need: 4.5, expected: [5.89, 8.81, 6.37, 8.81] },
  { label: "muted / surface", fg: "--muted", bg: "--surface", need: 4.5, expected: [6.64, 8.16, 5.71, 8.16] },
  { label: "muted / surface-2", fg: "--muted", bg: "--surface-2", need: 4.5, expected: [5.4, 7.03, 5.33, 7.03] },
  { label: "link / bg", fg: "--link", bg: "--bg", need: 4.5, expected: [4.94, 9.43, 5.49, 9.43] },
  { label: "link / surface", fg: "--link", bg: "--surface", need: 4.5, expected: [5.57, 8.73, 4.92, 8.73] },
  { label: "link / surface-2", fg: "--link", bg: "--surface-2", need: 4.5, expected: [4.54, 7.53, 4.59, 7.53] },
  { label: "on-button / button", fg: "--on-button", bg: "--button", need: 4.5, expected: [5.57, 5.21, 16.83, 5.21] },
  { label: "button / bg (shape)", fg: "--button", bg: "--bg", need: 3, expected: [4.94, 5.21, 16.83, 5.21] },
  { label: "button / surface (shape)", fg: "--button", bg: "--surface", need: 3, expected: [5.57, 4.82, 15.09, 4.82] },
  { label: "brand / bg (graphics, 24px text)", fg: "--brand", bg: "--bg", need: 3, expected: [3.14, 5.21, 3.48, 5.21] },
  { label: "brand / surface (graphics)", fg: "--brand", bg: "--surface", need: 3, expected: [3.54, 4.82, 3.12, 4.82] },
  { label: "focus / bg", fg: "--focus", bg: "--bg", need: 3, expected: [4.94, 9.43, 5.49, 9.43] },
  { label: "focus / surface", fg: "--focus", bg: "--surface", need: 3, expected: [5.57, 8.73, 4.92, 8.73] },
  { label: "focus / surface-2", fg: "--focus", bg: "--surface-2", need: 3, expected: [4.54, 7.53, 4.59, 7.53] },
  { label: "control edge (muted) / surface", fg: "--muted", bg: "--surface", need: 3, expected: [6.64, 8.16, 5.71, 8.16] },
  { label: "control edge (muted) / bg", fg: "--muted", bg: "--bg", need: 3, expected: [5.89, 8.81, 6.37, 8.81] },
  { label: "on-sig / sig (hook)", fg: "--on-sig", bg: "--sig", need: 4.5, expected: [8.21, 8.82, 16.83, 16.3] },
  { label: "sig-muted / sig", fg: "--sig-muted", bg: "--sig", need: 4.5, expected: [5.5, 6.14, 6.37, 8.81] },
  // On the Marked page the gilt is the ribbon: a graphic, so 3:1.
  { label: "gilt / sig", fg: "--gilt", bg: "--sig", need: [4.5, 4.5, 3, 4.5], expected: [5.39, 6.23, 3.48, 5.21] },
  { label: "on-sig-button / sig-button", fg: "--on-sig-button", bg: "--sig-button", need: 4.5, expected: [8.21, 8.82, 16.83, 5.21] },
  { label: "sig-button / sig (shape)", fg: "--sig-button", bg: "--sig", need: 3, expected: [8.21, 8.82, 16.83, 5.21] },
  { label: "sig-focus / sig", fg: "--sig-focus", bg: "--sig", need: 3, expected: [5.39, 6.23, 5.49, 9.43] },
  { label: "ai / bg", fg: "--ai", bg: "--bg", need: 4.5, expected: [6.02, 9.13, 6.68, 9.13] },
  { label: "ai / surface", fg: "--ai", bg: "--surface", need: 4.5, expected: [6.79, 8.45, 5.99, 8.45] },
  { label: "ai / surface-2", fg: "--ai", bg: "--surface-2", need: 4.5, expected: [5.53, 7.29, 5.6, 7.29] },
  { label: "on-ai / ai (badge)", fg: "--on-ai", bg: "--ai", need: 4.5, expected: [6.79, 9.13, 6.79, 9.13] },
  { label: "ai dashed frame / surface", fg: "--ai", bg: "--surface", need: 3, expected: [6.79, 8.45, 5.99, 8.45] },
  { label: "community / bg", fg: "--community", bg: "--bg", need: 4.5, expected: [5.95, 9.75, 6.6, 9.75] },
  { label: "community / surface", fg: "--community", bg: "--surface", need: 4.5, expected: [6.71, 9.03, 5.92, 9.03] },
  { label: "danger / bg", fg: "--danger", bg: "--bg", need: 4.5, expected: [6.7, 9.35, 7.43, 9.35] },
  { label: "danger / surface", fg: "--danger", bg: "--surface", need: 4.5, expected: [7.55, 8.65, 6.66, 8.65] },
  { label: "on-danger / danger", fg: "--on-danger", bg: "--danger", need: 4.5, expected: [7.55, 9.35, 7.55, 9.35] },
  { label: "success / surface", fg: "--success", bg: "--surface", need: 4.5, expected: [6.62, 8.73, 5.84, 8.73] },
  { label: "community / surface-2 (sheet over sheet)", fg: "--community", bg: "--surface-2", need: 4.5, expected: [5.46, 7.79, 5.53, 7.79] },
  { label: "danger / surface-2 (sheet over sheet)", fg: "--danger", bg: "--surface-2", need: 4.5, expected: [6.15, 7.46, 6.22, 7.46] },
  { label: "success / surface-2 (sheet over sheet)", fg: "--success", bg: "--surface-2", need: 4.5, expected: [5.39, 7.53, 5.46, 7.53] },
  // The check icon on the signature block: gilt on the Cover's leather, success on the Marked page.
  { label: "check icon / sig", fg: ["--gilt", "--gilt", "--success", "--success"], bg: "--sig", need: 3, expected: [5.39, 6.23, 6.52, 9.43] },
  { label: "ink / highlight-gold", fg: "--ink", bg: "--highlight-gold", need: 4.5, expected: [12.94, 8.26, 12.94, 8.26] },
  { label: "ink / highlight-sage", fg: "--ink", bg: "--highlight-sage", need: 4.5, expected: [13.01, 9.19, 13.01, 9.19] },
  { label: "ink / highlight-rose", fg: "--ink", bg: "--highlight-rose", need: 4.5, expected: [12.0, 9.48, 12.0, 9.48] },
  // Verse numbers keep --link in Lamplight; in Light they fall short, so a highlighted verse uses --ink.
  { label: "link / highlight-gold", fg: "--link", bg: "--highlight-gold", need: 4.5, expected: [4.22, 4.78, 4.22, 4.78], shortfall: [true, false, true, false] },
  { label: "link / highlight-sage", fg: "--link", bg: "--highlight-sage", need: 4.5, expected: [4.24, 5.32, 4.24, 5.32], shortfall: [true, false, true, false] },
  { label: "link / highlight-rose", fg: "--link", bg: "--highlight-rose", need: 4.5, expected: [3.91, 5.48, 3.91, 5.48], shortfall: [true, false, true, false] },
  { label: "spine-ink / spine-1", fg: "--spine-ink", bg: "--spine-1", need: 4.5, expected: [5.39, 6.23, 15.09, 13.01] },
  { label: "spine-ink / spine-2", fg: "--spine-ink", bg: "--spine-2", need: 4.5, expected: [4.82, 5.2, 14.08, 11.66] },
  { label: "spine-ink / spine-3", fg: "--spine-ink", bg: "--spine-3", need: 4.5, expected: [6.65, 7.52, 12.21, 14.07] },
  { label: "ink / bar-solid", fg: "--ink", bg: "--bar-solid", need: 4.5, expected: [17.1, 15.09, 16.83, 15.09] },
  { label: "muted / bar-solid (tab labels)", fg: "--muted", bg: "--bar-solid", need: 4.5, expected: [6.64, 8.16, 6.37, 8.16] },
  { label: "link / bar-solid (selected tab label)", fg: "--link", bg: "--bar-solid", need: 4.5, expected: [5.57, 8.73, 5.49, 8.73] },
  // The printed figures use a nominal 92 %; the token's own alpha is EB = 92.16 %, which the test uses, so
  // the Lamplight figures come out up to 0.03 higher. Marked Light carries the white bar (5.54 and 4.77).
  { label: "muted / bar at 92 % over ink (worst case)", fg: "--muted", bg: "--bar/--ink", need: 4.5, expected: [5.68, 6.62, 5.54, 6.62], tolerance: 0.03 },
  { label: "link / bar at 92 % over ink (worst case)", fg: "--link", bg: "--bar/--ink", need: 4.5, expected: [4.77, 7.08, 4.77, 7.08], tolerance: 0.03 },
  { label: "brand (selected tab icon) / bar at 92 % over ink", fg: "--brand", bg: "--bar/--ink", need: 3, expected: [3.03, 3.91, 3.03, 3.91], tolerance: 0.03 },
];

for (const row of rows) {
  test(`UI-SPEC 5.4: ${row.label}`, () => {
    keys.forEach((key, i) => {
      const map = blocks[key];
      const fg = colourOf(map, Array.isArray(row.fg) ? row.fg[i] : row.fg);
      const bg = colourOf(map, row.bg);
      const value = ratio(fg, bg);
      const where = `${row.label} in ${labels[key]} is ${value.toFixed(2)}:1`;
      assert.ok(Math.abs(value - row.expected[i]) <= (row.tolerance ?? 0.01), `${where}, the spec says ${row.expected[i]}`);
      const need = Array.isArray(row.need) ? row.need[i] : row.need;
      if (row.shortfall?.[i]) assert.ok(value < need, `${where}: recorded as below ${need}:1, which is why the rule below exists`);
      else assert.ok(value >= need, `${where}, needs ${need}:1`);
    });
  });
}

test("the rejected pair stays rejected: success on the Cover's leather is below 3:1", () => {
  const value = ratio(token(blocks.coverLight, "--success"), token(blocks.coverLight, "--sig"));
  assert.ok(Math.abs(value - 1.4) <= 0.01 && value < 3, `success / sig on the Cover is ${value.toFixed(2)}:1`);
});

test("the two thin margins are pinned to two decimals so a later tweak cannot slip under the need", () => {
  // --link on --surface-2 in Cover Light (text, need 4.5) and the selected tab icon, --brand over
  // the 92 % bar on ink-coloured content (graphic, need 3), in both Light blocks. UI-SPEC 5.1 prints the
  // Marked Light bar as #FFFDF9EB, which gives 2.98:1 there, under the need; the bar is white instead,
  // which gives the 3.03:1 the table prints for it.
  assert.equal(ratio(token(blocks.coverLight, "--link"), token(blocks.coverLight, "--surface-2")).toFixed(2), "4.54");
  for (const key of ["coverLight", "markedLight"] as Key[]) {
    const bar = composite(token(blocks[key], "--bar"), token(blocks[key], "--ink"));
    assert.equal(ratio(token(blocks[key], "--brand"), bar).toFixed(2), "3.03", `selected tab icon in ${labels[key]}`);
  }
});

test("a label on a highlighted verse uses ink, because the link colour falls short on it in Light", () => {
  assert.match(
    appCss,
    /\.verse:is\(\.speaking, \.highlight-gold, \.highlight-sage, \.highlight-rose\) \.speaker \{\n  color: var\(--ink\);/,
  );
});

test("a verse number on a highlighted verse uses ink in Light only, because --link falls short on gold, sage and rose there (UI-SPEC 5.4)", () => {
  // The rule is scoped to data-mode="light" and names every highlight and the verse that is selected or being read.
  const rule = /:root\[data-mode="light"\] \.verse:is\(([^)]*)\) \.verse-num \{\n  color: var\(--ink\);\n\}/.exec(appCss);
  assert.ok(rule, "src/styles.css has the Light rule for verse numbers on highlighted verses");
  for (const state of [".highlight-gold", ".highlight-sage", ".highlight-rose", ".selected", ".speaking"])
    assert.ok(rule[1].split(",").map((s) => s.trim()).includes(state), `${state} is covered`);
  // Lamplight keeps --link (4.78, 5.32 and 5.48:1 on the three highlights): no Lamplight rule recolours the number.
  assert.doesNotMatch(appCss, /data-mode="lamplight"\][^{]*\.verse[^{]*\.verse-num/);
});

// --- Increase Contrast and reduced transparency --------------------------------------------------

/** The whole at-rule starting at `header`, with its nested rules. */
function atRule(css: string, header: string): string {
  const start = css.indexOf(header);
  assert.ok(start >= 0, `${header} found in src/styles.css`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`${header} is not closed`);
}
/** [selector list, declarations] of the rules inside an at-rule. */
function innerRules(rule: string): [string[], Map<string, string>][] {
  const inner = rule.slice(rule.indexOf("{") + 1, rule.lastIndexOf("}"));
  return [...inner.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => [
    sel.split(",").map((s) => s.trim()),
    new Map(tokensIn(body)),
  ]);
}
/** Selector specificity as far as these token selectors need it: pseudo-class :root plus attribute selectors. */
const specificity = (selector: string) => (selector.match(/:root/g) ?? []).length + (selector.match(/\[/g) ?? []).length;

const overrideSelectors: Record<Key, string> = {
  coverLight: ':root:not([data-look="marked"])',
  markedLight: ':root[data-look="marked"]',
  // Same specificity as blocks 3 and 5, parts in another order, so each block selector appears once.
  coverLamplight: ':root[data-mode="lamplight"]:not([data-look="marked"])',
  markedLamplight: ':root[data-mode="lamplight"][data-look="marked"]',
};
const contrastRule = atRule(appCss, "@media (prefers-contrast: more)");
const transparencyRule = atRule(appCss, "@media (prefers-reduced-transparency: reduce)");

/** A block's tokens with the Increase Contrast overrides applied, `var(--x)` values resolved. */
function withIncreasedContrast(key: Key): Map<string, string> {
  const map = new Map(blocks[key]);
  const rule = innerRules(contrastRule).find(([list]) => list.includes(overrideSelectors[key]));
  assert.ok(rule, `${labels[key]} has an Increase Contrast rule`);
  for (const [name, value] of rule[1]) map.set(name, value);
  for (const [name, value] of map) {
    const ref = value.match(/^var\((--[\w-]+)\)$/);
    if (ref) map.set(name, token(map, ref[1]));
  }
  return map;
}

test("Increase Contrast rules are at least as specific as the block they override and come after it", () => {
  for (const key of keys) {
    const selector = overrideSelectors[key];
    assert.ok(specificity(selector) >= specificity(selectors[key]), `${labels[key]} override specificity`);
    assert.ok(appCss.indexOf(contrastRule) > appCss.indexOf(selectors[key] + " {"), `${labels[key]} override comes later`);
  }
});

test("Increase Contrast: the Light blocks get darker muted and link text, the Lamplight blocks lighter muted text", () => {
  const cover = withIncreasedContrast("coverLight");
  const marked = withIncreasedContrast("markedLight");
  assert.equal(token(cover, "--muted").toUpperCase(), "#4E433D");
  assert.equal(token(cover, "--link").toUpperCase(), "#6E4536");
  assert.equal(token(marked, "--link").toUpperCase(), "#6E4536");
  assert.equal(two(ratio(token(cover, "--muted"), token(cover, "--bg"))), 8.49);
  assert.equal(two(ratio(token(marked, "--muted"), token(marked, "--bg"))), 9.42);
  assert.equal(two(ratio(token(cover, "--muted"), token(cover, "--surface-2"))), 7.79);
  assert.equal(two(ratio(token(cover, "--link"), token(cover, "--bg"))), 7.26);
  // The Cover's filled button takes the same darker brown, with white text on it.
  assert.equal(token(cover, "--button").toUpperCase(), "#6E4536");
  assert.equal(two(ratio(token(cover, "--on-button"), token(cover, "--button"))), 8.18);
  for (const key of ["coverLight", "markedLight"] as Key[]) {
    const map = withIncreasedContrast(key);
    for (const bg of ["--bg", "--surface", "--surface-2"])
      for (const fg of ["--muted", "--link"])
        assert.ok(ratio(token(map, fg), token(map, bg)) >= 4.5, `${fg} on ${bg} in ${labels[key]} with Increase Contrast`);
  }
  for (const key of ["coverLamplight", "markedLamplight"] as Key[]) {
    const map = withIncreasedContrast(key);
    assert.equal(token(map, "--muted").toUpperCase(), "#DDD0C5");
    assert.equal(two(ratio(token(map, "--muted"), token(map, "--bg"))), 12.23);
    for (const bg of ["--bg", "--surface", "--surface-2"])
      assert.ok(ratio(token(map, "--muted"), token(map, bg)) >= 4.5, `muted on ${bg} in ${labels[key]}`);
  }
});

test("Increase Contrast and reduced transparency: lines become the muted colour and the bars turn opaque", () => {
  for (const key of keys) {
    const map = withIncreasedContrast(key);
    assert.equal(token(map, "--line"), token(map, "--muted"), `--line follows --muted in ${labels[key]}`);
    assert.equal(token(map, "--bar"), token(map, "--bar-solid"), `--bar is opaque in ${labels[key]}`);
  }
  const rules = innerRules(transparencyRule);
  assert.equal(rules.length, 1);
  const [list, declarations] = rules[0];
  assert.equal(declarations.get("--bar"), "var(--bar-solid)");
  for (const key of keys) {
    assert.ok(list.includes(overrideSelectors[key]), `${labels[key]} is covered by reduced transparency`);
    assert.ok(specificity(overrideSelectors[key]) >= specificity(selectors[key]));
  }
  assert.ok(appCss.indexOf(transparencyRule) > appCss.indexOf(selectors.markedLamplight + " {"));
});

// --- The colours people see are the colours of the rules -----------------------------------------

function rulesFor(css: string, selector: RegExp): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(",").some((s) => selector.test(s.trim())))
    .map(([, , body]) => body);
}

test("both stylesheets draw the keyboard focus ring as 3px solid var(--focus)", () => {
  for (const [name, css] of [["src/styles.css", appCss], ["site/src/styles/global.css", siteCss]] as const) {
    const bodies = rulesFor(css, /:focus-visible$/);
    assert.ok(bodies.length > 0, `${name} has a :focus-visible rule`);
    const outlines = bodies.flatMap((body) => [...body.matchAll(/outline:\s*([^;]+);/g)].map((m) => m[1].trim()));
    assert.ok(outlines.length > 0, `${name} sets an outline`);
    for (const outline of outlines) assert.equal(outline, "3px solid var(--focus)", `${name} focus outline`);
  }
  assert.ok(rulesFor(appCss, /^summary:focus-visible$/).length > 0, "the disclosure summary shows the same ring");
});

test("input, textarea and select edges use var(--muted), never the decorative var(--line)", () => {
  for (const tag of ["input", "textarea", "select"]) {
    const bodies = rulesFor(appCss, new RegExp(`^${tag}$`));
    assert.ok(bodies.length > 0, `${tag} has a base rule`);
    const edges = bodies.flatMap((body) =>
      [...body.matchAll(/(?:^|[;\s])border(?:-color)?:\s*([^;]+);/g)].map((m) => m[1].trim()),
    );
    assert.ok(edges.length > 0, `${tag} sets an edge`);
    for (const edge of edges) {
      assert.ok(edge.includes("var(--muted)"), `${tag} edge "${edge}" uses var(--muted)`);
      assert.ok(!edge.includes("var(--line)"), `${tag} edge "${edge}" does not use var(--line)`);
    }
  }
});

test("the stylesheet uses only token names that exist", () => {
  const defined = new Set([...constants.keys(), ...blocks.coverLight.keys(), ...blocks.markedLight.keys()]);
  const used = new Set([...appCss.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
  const unknown = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(unknown, [], "var() names without a definition");
});
