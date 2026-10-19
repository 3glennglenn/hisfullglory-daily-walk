// Repository-wide design gates of phase 01.1 (calm redesign). Later plans add their gates here.
// Run from the project root: node --experimental-strip-types --test tests/design-gates.test.ts
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const TEXT = /\.(ts|tsx|js|mjs|cjs|css|astro|html|json|svg|md|txt|xml|webmanifest)$/i;
// Written by site/scripts/sync-shared.mjs from src/styles.css: whatever it holds is already checked there.
const GENERATED = /^tokens\.generated\./;

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return ["node_modules", "dist", ".astro"].includes(entry.name) ? [] : filesUnder(path);
    return TEXT.test(entry.name) && !GENERATED.test(entry.name) ? [path] : [];
  });
}

/** The code the app and the site ship: src, site/src and the app's index.html. */
const shipped = [...filesUnder("src"), ...filesUnder(join("site", "src")), "index.html"];

test("the design gates scan the app, the site and index.html", () => {
  assert.ok(shipped.length > 50, `scanned ${shipped.length} files`);
  assert.ok(shipped.includes("index.html"));
  assert.ok(shipped.some((file) => file.endsWith("styles.css")));
});

test("the brown of phase 1 is retired: it appears nowhere in src, site/src or index.html", () => {
  // Built from its six hex digits so that this file does not contain the value itself.
  const retired = new RegExp("#" + ["85", "4b", "38"].join(""), "i");
  const hits = shipped.filter((file) => retired.test(readFileSync(file, "utf8")));
  assert.deepEqual(hits, [], "files that still use the retired brown (D-09: the logo's own browns only)");
});

test("the share picture keeps the five Cover Light colours of UI-SPEC 5.1", () => {
  const source = readFileSync(join("src", "context", "shareCard.ts"), "utf8");
  const palette = source.match(/const colors = \{([^}]*)\}/)?.[1] ?? "";
  const hexes = [...palette.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0].toUpperCase());
  assert.deepEqual(hexes, ["#F3F1EE", "#FFFFFF", "#251914", "#675A52", "#8D5C4B"]);
});

test("the static browser colour and the install colours are Cover Light (the default look)", () => {
  const html = readFileSync("index.html", "utf8");
  assert.match(html, /<meta name="theme-color" content="#F3F1EE" \/>/);
  const config = readFileSync("vite.config.ts", "utf8");
  assert.match(config, /theme_color: "#F3F1EE"/);
  assert.match(config, /background_color: "#F3F1EE"/);
});
