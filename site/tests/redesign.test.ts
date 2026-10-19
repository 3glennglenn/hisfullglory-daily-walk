// Built-page checks for the calm redesign of the site (phase 01.1, plans 12 and 13). They read
// site/dist (run `npm run build` first; `npm run check` does both) and need no browser: what a
// browser must measure lives in scripts/site-browser-check.mjs, which is a local check.
// Expectations about "the newest check" are computed here from the content folder with the
// site's own functions, never from a hard-coded slug: the daily routine adds checks to main.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { site } from "../src/config.ts";
import { aiUnreviewedCardLabel, featuredChecks } from "../src/lib/content.ts";
import { splitHook } from "../src/lib/editorial.ts";

const read = (address: string) => readFileSync(`dist${address}/index.html`, "utf8");
/** A built page as a reader sees its words: tags, styles and scripts removed, entities turned back. */
const textOf = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim();
/** The main landmark of a built page. */
const mainOf = (html: string) => html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? "";
const count = (html: string, needle: string | RegExp) =>
  typeof needle === "string" ? html.split(needle).length - 1 : (html.match(needle)?.length ?? 0);

const newest = featuredChecks()[0];
const home = read("");

test("the home opens with the newest published check on the cover, labelled when no person checked it (D-05, D-06)", () => {
  assert.ok(newest, "the content folder holds at least one published context check");
  // The first part of the hook is the page's one h1 (UI-SPEC W1).
  const headings = home.match(/<h1[\s\S]*?<\/h1>/g) ?? [];
  assert.equal(headings.length, 1, "one h1");
  assert.equal(textOf(headings[0]), splitHook(newest.hook).first);
  const cover = home.match(/<section[^>]*class="[^"]*cover-wrap[^"]*"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.ok(cover, "a cover on the home page");
  assert.ok(cover.includes(`href="/context-checks/${newest.slug}"`), "Read the story leads to the newest check");
  assert.ok(textOf(cover).includes("Read the story"));
  // The AI label stands on the cover exactly when the check is AI-written and unchecked.
  assert.equal(textOf(cover).includes(aiUnreviewedCardLabel), newest.review === "ai-unreviewed");
  // The second part of the hook follows when the hook has one.
  const { second } = splitHook(newest.hook);
  if (second) assert.ok(textOf(cover).includes(second), "the second part of the hook");
});

test("the home page's title and description are unchanged: they carry search", () => {
  assert.ok(home.includes(`<title>${site.name}: study the Bible together</title>`));
  assert.ok(home.includes(`<meta name="description" content="${site.description}">`) || home.includes(`content="${site.description}"`));
  assert.ok(count(home, "Study the Bible together.") === 0 || newest === undefined, "the old h1 only shows without a cover");
});
