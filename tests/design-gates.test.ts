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

// UI-SPEC A15, D-10: every question the app asks is its own dialog or sheet (src/ui/ConfirmDialog.tsx,
// src/ui/TextSheet.tsx); a browser pop-up looks broken in the store build. The gate finds a call of the
// browser's confirm, prompt or alert, bare or on window, and leaves a method of another object alone
// (the install prompt of the BeforeInstallPromptEvent is `install.prompt()`, and its type declares `prompt()`).
const POPUP_CALL =
  /(?<![\w$./])(?:confirm|prompt|alert)\s*\(|\b(?:window|globalThis|self|top|parent)\s*\.\s*(?:confirm|prompt|alert)\s*\(/g;
// An interface or type member such as `prompt(): Promise<void>;` declares a method, it calls nothing.
const MEMBER_SIGNATURE = /^[ \t]*(?:confirm|prompt|alert)\s*\([^)]*\)\s*:/gm;

function popupCalls(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1")
    .replace(MEMBER_SIGNATURE, "");
  return [...code.matchAll(POPUP_CALL)].map((m) => m[0]);
}

test("no browser pop-ups: the detector sees bare and window calls and leaves other objects' methods alone", () => {
  for (const call of [
    'if (confirm("Delete?")) go();',
    'window.confirm("Delete?")',
    'const text = window.prompt("A private prayer update");',
    'window . alert ("Saved")',
    'globalThis.alert("x")',
    'x ? alert(1) : 0',
  ])
    assert.ok(popupCalls(call).length > 0, `should be found: ${call}`);
  for (const fine of [
    "await install.prompt();",
    "  prompt(): Promise<void>;",
    "showAlert(message)",
    "props.confirm(1)",
    "this.alert()",
    "onConfirm(id)",
    "// window.confirm(\"old\")",
    "/* prompt(x) */",
    'const link = "https://example.com/confirm(1)";',
    "const confirmed = true;",
  ])
    assert.deepEqual(popupCalls(fine), [], `should be left alone: ${fine}`);
});

test("no browser pop-ups: src never calls confirm, prompt or alert, bare or on window (UI-SPEC A15, D-10)", () => {
  const files = filesUnder("src").filter((file) => /\.(ts|tsx|js|mjs)$/.test(file));
  assert.ok(files.length > 50, `scanned ${files.length} files`);
  const hits = files.flatMap((file) => popupCalls(readFileSync(file, "utf8")).map((call) => `${file}: ${call}`));
  assert.deepEqual(hits, [], "browser pop-ups left in src: use ConfirmDialog or TextSheet instead");
});

// ---- Plan 08: no guilt in the app's words (UI-SPEC 9.1, D-11) ---------------------------------------------------------
// The glossary never says that a day was "missed" and never speaks of a "streak": a day away shows nothing, and the
// walk counts days walked. The gate reads what a person can read in a .tsx file under src, a string literal or JSX
// text, and leaves comments, identifiers and the .ts data files alone. The two words are built from their parts so
// that this file does not contain them.
const GUILT_WORDS = new RegExp(`\\b(?:${["mis", "sed"].join("")}|${["str", "eak"].join("")}s?)\\b`, "i");
const STRING_LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
// Text between tags, or between a tag and an expression: `>Walk complete<`, `>{n} days walked<`, `}. Tomorrow<`.
const JSX_TEXT = /[>}]([^<>{}\n]+)(?=[<{])/g;

function readableText(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  return [...code.matchAll(STRING_LITERAL)].map((m) => m[0]).concat([...code.matchAll(JSX_TEXT)].map((m) => m[1]));
}

test("the guilt-words gate sees strings and JSX text and leaves comments and identifiers alone", () => {
  const missed = ["mis", "sed"].join("");
  const streak = ["str", "eak"].join("");
  for (const bad of [
    `const line = "A ${missed} day is a loss";`,
    `<p>You have a ${streak} of 3 days</p>`,
    `<p>{n} day ${streak}s</p>`,
    "const t = `Keep your " + streak + " alive`;",
    `<span>You ${missed.toUpperCase()} yesterday</span>`,
  ])
    assert.ok(readableText(bad).some((text) => GUILT_WORDS.test(text)), `should be found: ${bad}`);
  for (const fine of [
    `// A ${missed} day is an invitation (a comment)`,
    `/* ${streak} of days */`,
    `const ${streak} = 3;`,
    `<p>A day away is an invitation to begin again. There is no penalty.</p>`,
    `const word = "mistreated";`,
    `<p>{n} days walked</p>`,
  ])
    assert.ok(!readableText(fine).some((text) => GUILT_WORDS.test(text)), `should be left alone: ${fine}`);
});

test("no .tsx file under src says a day was missed or speaks of a streak (UI-SPEC 9.1, D-11)", () => {
  const files = filesUnder("src").filter((file) => file.endsWith(".tsx"));
  assert.ok(files.length > 30, `scanned ${files.length} files`);
  const hits = files.flatMap((file) =>
    readableText(readFileSync(file, "utf8"))
      .filter((text) => GUILT_WORDS.test(text))
      .map((text) => `${file}: ${text.slice(0, 80)}`),
  );
  assert.deepEqual(hits, [], "words of guilt in the app's interface: say nothing about a day away, count days walked");
});


// ---- Plan 11: one type scale, no uppercase, no bare button names (UI-SPEC 6.2, 15 item 9) ----------------------------
const appCss = readFileSync(join("src", "styles.css"), "utf8");
/** The declarations of a stylesheet with their selector, in order. Comments are kept out of the selector. */
function declarations(css: string): { selector: string; property: string; value: string; comment: string }[] {
  const found: { selector: string; property: string; value: string; comment: string }[] = [];
  let comment = "";
  const stripped = css.replace(/\/\*([\s\S]*?)\*\//g, (_all, text: string) => `\u0000${text.replace(/\u0000/g, "")}\u0001`);
  for (const rule of stripped.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selectorText = rule[1].replace(/\u0000[\s\S]*?\u0001/g, (c) => {
      comment = c;
      return "";
    });
    const selector = selectorText.trim().replace(/\s+/g, " ");
    for (const decl of rule[2].replace(/\u0000[\s\S]*?\u0001/g, (c) => {
      comment += c;
      return "";
    }).split(";")) {
      const [property, ...rest] = decl.split(":");
      if (rest.length) found.push({ selector, property: property.trim(), value: rest.join(":").trim(), comment });
    }
  }
  return found;
}

test("block 1 of src/styles.css holds the six type tokens and the numeral with the CSS values of UI-SPEC 6.2", () => {
  const block = appCss.slice(0, appCss.indexOf("}"));
  const expected: Record<string, string> = {
    "--text-large-title": "calc(1rem + 17px)",
    "--text-display": "calc(0.6471rem + 17px)",
    "--text-title": "1.1765rem",
    "--text-scripture": "1.1765rem",
    "--text-body": "1rem",
    "--text-footnote": "0.7647rem",
    "--text-numeral": "calc(2rem + 44px)",
  };
  for (const [name, value] of Object.entries(expected))
    assert.ok(block.includes(`${name}: ${value};`), `${name} is ${value}`);
});

test("every font-size in src/styles.css is a type token, inherit, 1em or 100 % (the one root rule is the platform's text size)", () => {
  const sizes = declarations(appCss).filter((d) => d.property === "font-size");
  assert.ok(sizes.length > 150, `scanned ${sizes.length} font-size declarations`);
  const bad = sizes.filter(
    (d) =>
      !/^var\(--text-(large-title|display|title|scripture|body|footnote|numeral)\)$/.test(d.value) &&
      !["inherit", "1em", "100%"].includes(d.value) &&
      // html { font-size: 106.25% } makes 1rem the platform's Body size (UI-SPEC 6.2); it is the root of the scale, not a step.
      !(d.selector === "html" && d.value === "106.25%") &&
      // The tab labels grow with the text size up to 16px, and the long-press tip shows a label at twice its size
      // (UI-SPEC 6.3, 14): both are made of the Footnote token, capped.
      !(d.selector === ".tab" && d.value === "min(var(--text-footnote), 16px)") &&
      !(d.selector === ".tab-tip" && d.value === "min(calc(var(--text-footnote) * 2), 13vw)"),
  );
  assert.deepEqual(bad.map((d) => `${d.selector}: ${d.value}`), [], "font sizes that are not one of the six steps");
});

test("nothing in the app or the site is set below 13px: no rem, em or px font-size under 0.7647rem", () => {
  const files = shipped.filter((file) => /\.(css|astro|html)$/.test(file));
  const hits: string[] = [];
  for (const file of files) {
    for (const m of readFileSync(file, "utf8").matchAll(/font-size:\s*([0-9.]+)(rem|em|px)\b/g)) {
      const px = m[2] === "px" ? Number(m[1]) : Number(m[1]) * 17;
      if (px < 12.99) hits.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("no uppercase text transform in the app's or the site's CSS (UI-SPEC 2 Removed accessories)", () => {
  const files = shipped.filter((file) => /\.(css|astro|html)$/.test(file));
  const hits = files.filter((file) => /text-transform:\s*uppercase/i.test(readFileSync(file, "utf8")));
  assert.deepEqual(hits, []);
});

test("letter-spacing in src/styles.css is normal, 0, or sits under a comment that names an ornament", () => {
  const spaced = declarations(appCss).filter(
    (d) => d.property === "letter-spacing" && !["normal", "0", "0em"].includes(d.value),
  );
  const bad = spaced.filter((d) => !/ornament/i.test(d.comment));
  assert.deepEqual(bad.map((d) => `${d.selector}: ${d.value}`), []);
});

// No visible button is named only "Cancel", "OK", "Done" or "Close" (UI-SPEC 15.9): a button with that word on it
// carries an aria-label that names its object ("Close entry", "Close Romans 8:28"), and a dialog's safe choice says what it keeps.
const BARE_NAME = /^(Cancel|OK|Done|Close)$/;
function bareButtons(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  for (const m of code.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const text = m[2].replace(/<[^>]*>/g, "").replace(/\{["'`]([^"'`]*)["'`]\}/g, "$1").trim();
    if (BARE_NAME.test(text) && !/aria-label\s*=/.test(m[1])) found.push(text);
  }
  for (const m of code.matchAll(/(?:safeLabel|actionLabel|label)\s*[=:]\s*["'](Cancel|OK|Done|Close)["']/g)) found.push(m[1]);
  return found;
}

test("the bare-label detector sees a button named only Cancel and leaves a named one alone", () => {
  assert.deepEqual(bareButtons("<button className=\"secondary\" onClick={x}>Cancel</button>"), ["Cancel"]);
  assert.deepEqual(bareButtons("<button>\n  Close\n</button>"), ["Close"]);
  assert.deepEqual(bareButtons("<ConfirmDialog safeLabel=\"Done\" />"), ["Done"]);
  assert.deepEqual(bareButtons("<button aria-label=\"Close entry\">Close</button>"), []);
  assert.deepEqual(bareButtons("<button>Close request</button>"), []);
});

test("no .tsx file under src has a button named only Cancel, OK, Done or Close", () => {
  const files = filesUnder("src").filter((file) => file.endsWith(".tsx"));
  const hits = files.flatMap((file) => bareButtons(readFileSync(file, "utf8")).map((name) => `${file}: ${name}`));
  assert.deepEqual(hits, []);
});

test("the crash screen says what UI-SPEC 9.2 says, and the install offer keeps one plain and one secondary button", () => {
  const source = readFileSync(join("src", "platformApp.tsx"), "utf8");
  assert.ok(source.includes("A moment to begin again"));
  assert.ok(source.includes("Your saved data remains on this device."));
  assert.match(source, /Reload the app/);
  assert.doesNotMatch(source, />\s*Reload\s*</);
  assert.match(source, /className="secondary"\s+onClick=\{async/);
  assert.match(source, /className="text-button"\s+onClick=\{\(\) =>\s+update/);
});
