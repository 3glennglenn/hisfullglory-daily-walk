// Built-page checks for the calm redesign of the site (phase 01.1, plans 12 and 13). They read
// site/dist (run `npm run build` first; `npm run check` does both) and need no browser: what a
// browser must measure lives in scripts/site-browser-check.mjs, which is a local check.
// Expectations about "the newest check" are computed here from the content folder with the
// site's own functions, never from a hard-coded slug: the daily routine adds checks to main.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { site } from "../src/config.ts";
import { aiUnreviewedCardLabel, editorialNote, featuredChecks, publishedChecks } from "../src/lib/content.ts";
import { splitHook } from "../src/lib/editorial.ts";
import { sponsorFor, type Sponsor } from "../src/lib/sponsor.ts";

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

test("the home has four parts and one filled Open the app (W1, audit High)", () => {
  const main = mainOf(home);
  const words = textOf(main);
  // Exactly one filled "Open the app" in the page body; the header's is the quiet one.
  assert.equal(count(main, /<a[^>]*class="button"[^>]*>\s*Open the app\s*<\/a>/g), 1, "one filled Open the app in main");
  assert.equal(count(main, "Open the app"), 1, "Open the app appears once in main");
  assert.ok(words.includes("HisFullGlory is a free Bible app: a new context check each day, Scripture first, context that names its sources, and AI and community always labelled."));
  assert.ok(words.includes("The HisFullGlory app is a beta web app. It opens in your browser."));
  assert.ok(main.includes('href="/beta"') && words.includes("About the beta"));
  assert.ok(words.includes("All context checks"));
  for (const heading of ["Four layers, never mixed", "Start here"]) assert.ok(words.includes(heading), heading);
  // The old sections are gone.
  for (const gone of ["How it works", "Inside the app", "Join the beta", "What you can count on", "See the resources", "Step 1"])
    assert.ok(!words.includes(gone), `${gone} is removed`);
  // Four layer rows, each with its own data-layer, in the fixed order of UI-SPEC 5.3.
  const layers = [...main.matchAll(/data-layer="([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(layers, ["scripture", "sourced", "ai", "voices"]);
  for (const sentence of [
    "Scripture comes first. The text is the World English Bible, a public-domain translation.",
    "Context notes name their sources and carry a label that says how far they have been reviewed.",
    "Where we show an AI explanation, it is labelled as AI and kept apart from Scripture and from sourced notes.",
    "Community voices are labelled as community. Popularity does not make something true.",
    "Your journal and private prayers stay on your own device.",
    "The community has rules, reporting and moderation.",
  ])
    assert.ok(words.includes(sentence), sentence);
  // Eight topics to start with.
  const topics = main.match(/<ul class="topics"[\s\S]*?<\/ul>/)?.[0] ?? "";
  assert.equal(count(topics, "<li"), 8);
});

test("the bookcase stands the six newest checks, and says in words which ones no person checked (D-06)", () => {
  const bookcase = home.match(/<div class="bookcase[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? "";
  const links = [...bookcase.matchAll(/<a[^>]*href="\/context-checks\/([a-z0-9-]+)"[^>]*aria-label="([^"]*)"/g)];
  const expected = featuredChecks().slice(0, 6);
  assert.deepEqual(
    links.map((match) => match[1]),
    expected.map((item) => item.slug),
  );
  for (const [index, match] of links.entries()) {
    const unchecked = expected[index].review === "ai-unreviewed";
    assert.equal(match[2].endsWith(", written by an AI model, not checked by a person"), unchecked, `${match[1]}: accessible name`);
  }
  // The legend line is there when a spine carries the badge, and only then.
  const anyUnchecked = expected.some((item) => item.review === "ai-unreviewed");
  assert.equal(count(home, 'class="legend"'), anyUnchecked ? 1 : 0, "the legend line");
});

test("the sponsor slot is built and empty: nothing renders while sponsor is null (D-13)", () => {
  assert.equal(site.sponsor, null);
  for (const address of ["", "/context-checks", `/context-checks/${newest.slug}`, "/bible/john/3"]) {
    const html = read(address);
    assert.ok(!html.includes('data-slot="sponsor"'), `${address}: no sponsor element`);
    assert.ok(!textOf(mainOf(html)).includes("Sponsor"), `${address}: no word Sponsor in the page body`);
  }
});

test("a sponsor shows only at its listed place, before its end date, with an https address", () => {
  const fixture: Sponsor = {
    name: "A quiet publisher",
    line: "Study Bibles for slow reading.",
    url: "https://example.org/bibles",
    until: "2027-01-31",
    places: ["site-home-end"],
  };
  assert.equal(sponsorFor("site-home-end", fixture, "2026-12-01"), fixture);
  assert.equal(sponsorFor("site-context-check-end", fixture, "2026-12-01"), null, "an unlisted place renders nothing");
  assert.equal(sponsorFor("site-home-end", fixture, "2027-02-01"), null, "after its end date");
  assert.equal(sponsorFor("site-home-end", { ...fixture, url: "http://example.org" }, "2026-12-01"), null, "http is refused");
  for (const place of ["today-end", "story-end", "site-home-end", "site-context-check-end", "pray", "community"] as const)
    assert.equal(sponsorFor(place, null, "2026-12-01"), null, `${place} with no sponsor`);
});

test("a context-check page says first how far it was checked, tells its story, and ends on the editorial note (W3)", () => {
  for (const item of publishedChecks()) {
    const html = read(`/context-checks/${item.slug}`);
    const main = mainOf(html);
    const where = item.slug;
    // The "Context check" eyebrow is gone: the breadcrumb names the section.
    assert.ok(!textOf(main).includes("Context check "), `${where}: no eyebrow`);
    if (item.review === "ai-unreviewed") {
      // The labelled AI note is the first block after the breadcrumb, with its dashed frame and badge.
      assert.ok(/<\/nav>\s*<p class="ai-unreviewed"[^>]*role="note"/.test(main), `${where}: the AI note comes right after the breadcrumb`);
      assert.ok(main.includes("ai-badge"), `${where}: the AI badge`);
    } else assert.ok(!main.includes('class="ai-unreviewed"'), `${where}: an approved check has no AI note`);
    // One filled app button, and the secondary one is not filled.
    assert.equal(count(main, /<a[^>]*class="button"[^>]*>/g), 1, `${where}: one filled app button`);
    assert.ok(main.includes("Study this passage in the app") && main.includes("Read the whole chapter"));
    // The verse sits on the cover (the signature block), with its WEB line.
    assert.ok(/class="cover-wrap[^"]*"/.test(main) && main.includes("World English Bible"), `${where}: the verse on the cover`);
    // The editorial note is the last thing in the page body (no sponsor is set).
    assert.ok(textOf(main).endsWith(editorialNote(item.review, item.drafted)), `${where}: the editorial note comes last`);
    assert.ok(!html.includes('data-slot="sponsor"'), `${where}: no sponsor element`);
    // Voices keep the sourced treatment: figures, not a Scripture face.
    assert.equal(count(main, 'class="card voice"'), item.voices.filter((voice) => !voice.id).length, `${where}: voice figures`);
  }
});

test("the context-checks index lists every published check newest first, the AI ones with their label (W5)", () => {
  const html = read("/context-checks");
  const rows = [...html.matchAll(/<a class="row" href="\/context-checks\/([a-z0-9-]+)"[\s\S]*?<\/a>/g)];
  const expected = featuredChecks();
  assert.deepEqual(
    rows.map((row) => row[1]),
    expected.map((item) => item.slug),
  );
  for (const [index, row] of rows.entries())
    assert.equal(row[0].includes(aiUnreviewedCardLabel), expected[index].review === "ai-unreviewed", `${row[1]}: card label`);
  assert.ok(html.includes('class="bookcase"'), "the bookcase");
  assert.ok(textOf(mainOf(html)).startsWith("Context checks Verses many people know by heart"));
});
