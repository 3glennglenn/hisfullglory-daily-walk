// The site's first paint and appearance switch (UI-SPEC 3.2 to 3.4, W8). Runs the head script of
// the built pages in node:vm against stub storage and device settings, so no browser is needed.
// Run `npm run build` first (`npm run check` does both). The switch itself, a reload and a real
// first paint are checked in a browser by scripts/site-browser-check.mjs.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : path.endsWith(".html") ? [path] : [];
  });
}
const pages = htmlFiles("dist");

/** The head's inline script that sets the look: the one that reads hfg-look. */
function headScript(html: string): string {
  const head = html.slice(0, html.indexOf("</head>"));
  const scripts = [...head.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const found = scripts.filter((code) => code.includes("hfg-look"));
  assert.equal(found.length, 1, "exactly one head script sets the look");
  return found[0];
}

const home = readFileSync("dist/index.html", "utf8");
const deep = existsSync("dist/bible/john/3/index.html")
  ? readFileSync("dist/bible/john/3/index.html", "utf8")
  : readFileSync(pages.find((file) => file.includes("bible"))!, "utf8");

type Scenario = {
  stored?: Record<string, string>;
  dark?: boolean;
  blocked?: boolean;
};

/** Runs the script the way a browser would and reports what it set. */
function run(script: string, { stored = {}, dark = false, blocked = false }: Scenario) {
  const dataset: Record<string, string> = {};
  const meta = { content: "#F3F1EE", setAttribute(name: string, value: string) { if (name === "content") this.content = value; } };
  const document = {
    documentElement: { dataset },
    // The script may spell the selector with or without quotes around theme-color.
    querySelector: (selector: string) => (selector.replace(/"/g, "") === "meta[name=theme-color]" ? meta : null),
  };
  const localStorage = blocked
    ? { getItem() { throw new Error("storage blocked"); } }
    : { getItem: (key: string) => (key in stored ? stored[key] : null) };
  const matchMedia = (query: string) => ({ matches: query.includes("dark") ? dark : false });
  vm.runInNewContext(script, { document, localStorage, matchMedia });
  return { look: dataset.look, mode: dataset.mode, color: meta.content };
}

const cases: [string, Scenario, string, string, string][] = [
  ["nothing stored, light device", {}, "cover", "light", "#F3F1EE"],
  ["nothing stored, dark device", { dark: true }, "cover", "lamplight", "#1A120E"],
  ["marked page, light device", { stored: { "hfg-look": "marked" } }, "marked", "light", "#FFFDF9"],
  ["marked page, dark device", { stored: { "hfg-look": "marked" }, dark: true }, "marked", "lamplight", "#1A120E"],
  ["an unknown look falls back to Cover", { stored: { "hfg-look": "gothic" } }, "cover", "light", "#F3F1EE"],
  ["Lamplight on, light device", { stored: { "hfg-lamplight": "on" } }, "cover", "lamplight", "#1A120E"],
  ["Lamplight off, dark device", { stored: { "hfg-lamplight": "off" }, dark: true }, "cover", "light", "#F3F1EE"],
  ["Lamplight automatic, dark device", { stored: { "hfg-lamplight": "auto" }, dark: true }, "cover", "lamplight", "#1A120E"],
  ["an unknown Lamplight value follows the device", { stored: { "hfg-lamplight": "sepia" }, dark: false }, "cover", "light", "#F3F1EE"],
  ["marked page with Lamplight on", { stored: { "hfg-look": "marked", "hfg-lamplight": "on" } }, "marked", "lamplight", "#1A120E"],
  ["old hfg-theme dark, light device", { stored: { "hfg-theme": "dark" } }, "cover", "lamplight", "#1A120E"],
  ["old hfg-theme light, dark device", { stored: { "hfg-theme": "light" }, dark: true }, "cover", "light", "#F3F1EE"],
  ["hfg-lamplight wins over an old hfg-theme", { stored: { "hfg-theme": "dark", "hfg-lamplight": "off" } }, "cover", "light", "#F3F1EE"],
  ["storage that throws, light device", { blocked: true }, "cover", "light", "#F3F1EE"],
  ["storage that throws, dark device", { blocked: true, dark: true }, "cover", "lamplight", "#1A120E"],
];

for (const page of [
  ["the home page", home],
  ["a chapter page", deep],
] as const) {
  const script = headScript(page[1]);
  for (const [name, scenario, look, mode, color] of cases)
    test(`first paint, ${page[0]}: ${name}`, () => {
      assert.deepEqual(run(script, scenario), { look, mode, color });
    });
}

test("unreadable JSON in an old app state falls back to the defaults", () => {
  const script = headScript(home);
  assert.deepEqual(run(script, { stored: { "hfg-daily-walk:v3": "{not json" } }), {
    look: "cover",
    mode: "light",
    color: "#F3F1EE",
  });
});

test("every page sets the look in the head, before its styles, and has one theme-color", () => {
  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    const end = html.indexOf("</head>");
    const script = html.indexOf('localStorage.getItem("hfg-lamplight")');
    assert.ok(script > 0 && script < end, `${file}: hfg-lamplight is read in the head`);
    const firstStyle = html.search(/<link[^>]+rel="stylesheet"|<style/);
    assert.ok(firstStyle < 0 || script < firstStyle, `${file}: the script comes before the first stylesheet`);
    const metas = html.match(/<meta name="theme-color"[^>]*>/g) ?? [];
    assert.equal(metas.length, 1, `${file}: one theme-color meta`);
    assert.ok(!metas[0].includes("media="), `${file}: the theme-color meta is not media-specific`);
    assert.ok(metas[0].includes('content="#F3F1EE"'), `${file}: static theme-color is Cover Light`);
  }
});

test("every page offers the Theme and Lamplight switch, hidden until its script runs", () => {
  for (const file of pages) {
    const html = readFileSync(file, "utf8");
    assert.match(html, /<section[^>]*data-appearance[^>]*\shidden/, `${file}: hidden switch`);
    for (const label of ["Appearance", "Theme", "Lamplight", "Cover and story", "Marked page", "Automatic"])
      assert.ok(html.includes(`>${label}<`), `${file}: ${label}`);
    for (const choice of ['data-look-choice="cover"', 'data-look-choice="marked"', 'data-lamplight-choice="auto"', 'data-lamplight-choice="on"', 'data-lamplight-choice="off"'])
      assert.ok(html.includes(choice), `${file}: ${choice}`);
    assert.ok(html.includes('role="status"'), `${file}: current-effect line`);
    assert.equal((html.match(/aria-pressed=/g) ?? []).length, 5, `${file}: five pills with aria-pressed`);
    assert.ok(!html.includes("data-theme-choice"), `${file}: the old Auto/Light/Dark group is gone`);
  }
});

test("the switch writes only the two new keys and carries the old choice over once", () => {
  const html = home;
  assert.ok(html.includes('write("hfg-look"'), "writes hfg-look");
  assert.ok(html.includes('write("hfg-lamplight"'), "writes hfg-lamplight");
  assert.ok(html.includes('read("hfg-theme")') && html.includes('remove("hfg-theme")'), "migrates and removes hfg-theme");
  assert.ok(!html.includes("dataset.theme"), "no data-theme is set any more");
});

test("the head script is the app's first-paint script", () => {
  // Same keys, legacy order and theme-color pairs as index.html (UI-SPEC 3.3). Comments,
  // whitespace and the quotes inside the meta selector do not count.
  const plain = (code: string) =>
    code
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\s+/g, "")
      .replace(/\[name="theme-color"\]/g, "[name=theme-color]")
      .replace(/'/g, '"');
  const app = readFileSync("../index.html", "utf8");
  const appScript = app.slice(0, app.indexOf("</head>")).match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";
  assert.ok(appScript.includes("hfg-look"), "found the app's script");
  assert.equal(plain(headScript(home)), plain(appScript));
});
