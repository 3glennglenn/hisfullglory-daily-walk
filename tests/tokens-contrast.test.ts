// Contrast guard for the shared design tokens (UX-01, WCAG 2.2 AA).
// "Contrast" here means the WCAG relative-luminance ratio computed from the sRGB hex values,
// not how a colour looks: text pairs need 4.5:1, focus rings and control edges need 3:1.
// The pairs are those of the UI-SPEC Color table; they hold in Light and in Dark.
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const appCss = readFileSync("src/styles.css", "utf8");
const siteCss = readFileSync("site/src/styles/global.css", "utf8");

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

const lightList = tokensIn(blockOf(appCss, ":root"));
const darkList = tokensIn(blockOf(appCss, ':root[data-theme="dark"]'));
const themes: Record<string, Map<string, string>> = {
  light: new Map(lightList),
  dark: new Map(darkList),
};

/** #rgb or #rrggbb to [r, g, b] in 0..1 (no alpha: contrast pairs are opaque colours). */
function rgb(hex: string): [number, number, number] {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  assert.match(h, /^[0-9a-f]{6}$/i, `${hex} is an opaque sRGB hex colour`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function token(theme: string, name: string): string {
  const value = themes[theme].get(name);
  assert.ok(value, `${name} is defined in ${theme}`);
  return value;
}

// Sanity check of the formula against the two extremes and a known mid value.
test("the contrast formula returns 21:1 for black on white and 1:1 for equal colours", () => {
  assert.equal(Math.round(ratio("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(ratio("#777777", "#777777"), 1);
  assert.ok(Math.abs(ratio("#767676", "#ffffff") - 4.54) < 0.01, "#767676 on white is the known 4.54:1");
});

test("Light and Dark token blocks list the same names in the same order", () => {
  assert.deepEqual(
    lightList.map(([name]) => name),
    darkList.map(([name]) => name),
  );
});

test("the danger tokens exist in both themes with the UI-SPEC values", () => {
  assert.equal(token("light", "--danger"), "#9b2c24");
  assert.equal(token("light", "--on-danger"), "#ffffff");
  assert.equal(token("dark", "--danger"), "#f2a59b");
  assert.equal(token("dark", "--on-danger"), "#251914");
  // Same position in both blocks, so the site sync accepts them.
  const names = lightList.map(([name]) => name);
  assert.equal(names.indexOf("--danger"), darkList.map(([name]) => name).indexOf("--danger"));
  assert.equal(names.indexOf("--on-danger"), names.indexOf("--danger") + 1);
});

// [foreground, background, minimum] per pair of the UI-SPEC Color table.
const textPairs: [string, string][] = [
  ["--ink", "--bg"],
  ["--ink", "--paper"],
  ["--ink", "--card"],
  ["--muted", "--bg"],
  ["--muted", "--paper"],
  ["--muted", "--card"],
  ["--strong", "--bg"],
  ["--strong", "--paper"],
  ["--strong", "--card"],
  ["--on-strong", "--strong"],
  ["--success", "--paper"],
  ["--danger", "--bg"],
  ["--danger", "--paper"],
  ["--danger", "--card"],
  ["--on-danger", "--danger"],
];
const nonTextPairs: [string, string][] = [
  // Focus ring colour on the page backgrounds.
  ["--strong", "--bg"],
  ["--strong", "--paper"],
  // Control edge colour on the page backgrounds.
  ["--muted", "--bg"],
  ["--muted", "--paper"],
];

for (const theme of Object.keys(themes)) {
  test(`${theme}: every text pair reaches 4.5:1`, () => {
    for (const [fg, bg] of textPairs) {
      const value = ratio(token(theme, fg), token(theme, bg));
      assert.ok(value >= 4.5, `${fg} on ${bg} (${theme}) is ${value.toFixed(2)}:1, needs 4.5:1`);
    }
  });
  test(`${theme}: the focus ring and control edges reach 3:1`, () => {
    for (const [fg, bg] of nonTextPairs) {
      const value = ratio(token(theme, fg), token(theme, bg));
      assert.ok(value >= 3, `${fg} on ${bg} (${theme}) is ${value.toFixed(2)}:1, needs 3:1`);
    }
  });
}

// The colours in the checks above are only the colours people see if the rules use them.
function rulesFor(css: string, selector: RegExp): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(",").some((s) => selector.test(s.trim())))
    .map(([, , body]) => body);
}

test("both stylesheets draw the keyboard focus ring as 3px solid var(--strong)", () => {
  for (const [name, css] of [["src/styles.css", appCss], ["site/src/styles/global.css", siteCss]] as const) {
    const bodies = rulesFor(css, /:focus-visible$/);
    assert.ok(bodies.length > 0, `${name} has a :focus-visible rule`);
    const outlines = bodies.flatMap((body) => [...body.matchAll(/outline:\s*([^;]+);/g)].map((m) => m[1].trim()));
    assert.ok(outlines.length > 0, `${name} sets an outline`);
    for (const outline of outlines) assert.equal(outline, "3px solid var(--strong)", `${name} focus outline`);
  }
});

test("input, textarea and select edges use var(--muted), never var(--border)", () => {
  for (const tag of ["input", "textarea", "select"]) {
    const bodies = rulesFor(appCss, new RegExp(`^${tag}$`));
    assert.ok(bodies.length > 0, `${tag} has a base rule`);
    const edges = bodies.flatMap((body) =>
      [...body.matchAll(/(?:^|[;\s])border(?:-color)?:\s*([^;]+);/g)].map((m) => m[1].trim()),
    );
    assert.ok(edges.length > 0, `${tag} sets an edge`);
    for (const edge of edges) {
      assert.ok(edge.includes("var(--muted)"), `${tag} edge "${edge}" uses var(--muted)`);
      assert.ok(!edge.includes("var(--border)"), `${tag} edge "${edge}" does not use var(--border)`);
    }
  }
});
