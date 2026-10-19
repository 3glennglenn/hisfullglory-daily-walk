// Built-page checks for the calm redesign of the site (phase 01.1, plans 12 and 13). They read
// site/dist (run `npm run build` first; `npm run check` does both) and need no browser: what a
// browser must measure lives in scripts/site-browser-check.mjs, which is a local check.
// Expectations about "the newest check" are computed here from the content folder with the
// site's own functions, never from a hard-coded slug: the daily routine adds checks to main.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { site } from "../src/config.ts";
import { approved } from "../src/data/legal.ts";
import { aiFor } from "../src/lib/ai.ts";
import { library } from "../src/lib/bible.ts";
import {
  aiUnreviewedCardLabel,
  editorialNote,
  featuredChecks,
  publishedChecks,
  publishedTopics,
} from "../src/lib/content.ts";
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

// Plan 13: the chapter page, the topic and legal pages, the privacy storage list.
const { bible, ai } = library();

test("a chapter page keeps the layers in order, with one filled app button and v-anchors (W2)", () => {
  const html = read("/bible/john/3");
  const main = mainOf(html);
  const explanation = aiFor(ai, "john", 3);
  const checks = publishedChecks().filter((item) => item.verse.book === "john" && item.verse.chapter === 3);
  const layers = [...main.matchAll(/data-layer="([a-z]+)"/g)].map((match) => match[1]);
  assert.deepEqual(layers, [
    "scripture",
    "sourced",
    ...(explanation ? ["ai"] : []),
    "voices",
    ...(checks.length ? ["editorial"] : []),
  ]);
  assert.ok(textOf(main).includes("Around John 3"), "the Around heading");
  assert.equal(count(main, /<a[^>]*class="button"[^>]*>/g), 1, "one filled app button");
  assert.ok(textOf(main).includes("Read John 3 in the app"));
  assert.ok(main.includes('id="v1"') && main.includes('id="v16"'), "the verse anchors");
  // The chapter row at the top and at the bottom; John 3 has both neighbours.
  assert.equal(count(main, 'aria-label="Chapters"'), 1);
  assert.equal(count(main, 'aria-label="Chapters, end of page"'), 1);
  assert.equal(count(main, 'href="/bible/john/2"'), 2 + 0, "John 2 is linked from both rows");
  assert.equal(count(main, 'href="/bible/john/4"'), 2, "John 4 is linked from both rows");
  // The ends of the Bible have no dead control.
  assert.ok(!mainOf(read("/bible/genesis/1")).includes("‹"), "no previous on Genesis 1");
  assert.ok(!mainOf(read("/bible/revelation/22")).includes("›"), "no next on Revelation 22");
  // The WEB line closes the page.
  assert.ok(textOf(main).endsWith("World English Bible. Public-domain source and edition notes"));
  assert.ok(!html.includes('data-slot="sponsor"'));
});

test("a chapter that holds an AI-written context check shows its label and badge (D-06)", () => {
  const unchecked = publishedChecks().filter((item) => item.review === "ai-unreviewed");
  assert.ok(unchecked.length > 0, "the content folder holds an AI-unreviewed check");
  for (const item of unchecked) {
    const main = mainOf(read(`/bible/${item.verse.book}/${item.verse.chapter}`));
    const row = main.match(new RegExp(`<a class="row" href="/context-checks/${item.slug}"[\\s\\S]*?</a>`))?.[0] ?? "";
    assert.ok(row, `${item.slug}: a row on its chapter page`);
    assert.ok(textOf(row).includes(aiUnreviewedCardLabel), `${item.slug}: the card label`);
    assert.ok(row.includes("ai-badge"), `${item.slug}: the badge`);
  }
});

test("every chapter page has its previous and next chapter, except at the ends of the Bible", () => {
  const sample = [bible.books[42], bible.books[18], bible.books[65]];
  for (const book of sample)
    for (const chapter of book.chapters.slice(0, 3)) {
      const main = mainOf(read(`/bible/${book.slug}/${chapter.number}`));
      assert.equal(count(main, "<nav class=\"pager"), 2, `${book.slug} ${chapter.number}: two chapter rows`);
    }
});

test("a topic page shows the care notice before the passages (W4)", () => {
  for (const topic of publishedTopics()) {
    const main = mainOf(read(`/topics/${topic.id}`));
    if (topic.care) {
      assert.ok(main.includes('class="care"'), `${topic.id}: care notice`);
      assert.ok(main.indexOf('class="care"') < main.indexOf('class="passages"'), `${topic.id}: the notice comes first`);
      assert.ok(textOf(main).includes(topic.care));
    }
    assert.equal(count(main, /<ol class="passages"[\s\S]*?<\/ol>/g), 1);
  }
});

test("the legal pages keep their gate: approved means no draft banner and no noindex (W6)", () => {
  for (const address of ["/privacy", "/terms", "/contact", "/delete-account"]) {
    const html = read(address);
    assert.equal(html.includes('class="draft"'), !approved, `${address}: draft banner`);
    assert.equal(html.includes('<meta name="robots" content="noindex"'), !approved, `${address}: noindex`);
  }
});

test("the privacy page lists the new on-device keys and the shelf, and no longer the old two (UI-SPEC 16)", () => {
  const text = textOf(mainOf(read("/privacy")));
  for (const key of ["hfg-look", "hfg-lamplight", "hfg-lamplight-notice"]) assert.ok(text.includes(key), key);
  assert.ok(text.includes("the older keys hfg-theme and hfg-appearance are read once and then removed") || text.includes("older keys hfg-theme and hfg-appearance are read once and then removed"));
  assert.ok(!mainOf(read("/privacy")).includes("<strong>hfg-theme</strong>"), "hfg-theme is not a listed key any more");
  assert.ok(text.includes("your shelf of the context checks you have read to the end"), "the shelf is among the private data");
});

// Plan 13, task 3: the style guide and the site's design gates (UI-SPEC 15, items 4 and 9).
test("the style guide shows the four colour blocks with their contrast pairs and the type scale (W7)", () => {
  const html = read("/styleguide");
  const words = textOf(mainOf(html));
  for (const name of ["Cover Light", "Cover Lamplight", "Marked Light", "Marked Lamplight"]) assert.ok(words.includes(name), name);
  assert.equal(count(html, 'class="panel"'), 4, "four colour panels");
  assert.ok(words.includes("ink on bg") && words.includes("on-sig on sig (the hook)"), "the contrast pairs");
  // Every pair printed passes its need in all four blocks (the same numbers tests/tokens-contrast.test.ts proves in the app).
  assert.equal(count(words, "below"), 0, "no pair is below its need");
  for (const size of ["34px", "28px", "20px", "17px", "13px"]) assert.ok(words.includes(size), `${size} in the scale`);
  assert.ok(html.includes('content="noindex"'), "not indexed");
});

/** Every .astro and .css file under site/src, as [path, text]. */
function sources(dir = "src"): [string, string][] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /[.](astro|css)$/.test(entry.name) ? [[path.replaceAll("\\", "/"), readFileSync(path, "utf8")] as [string, string]] : [];
  });
}

test("no text is set in uppercase anywhere in the site's styles (UI-SPEC 15, item 9)", () => {
  for (const [path, text] of sources()) assert.ok(!/text-transform:\s*uppercase/.test(text), `${path} sets uppercase text`);
});

test("every font size in the site's styles is a type token or follows its parent (UI-SPEC 6.2, 15 item 9)", () => {
  const allowed = [
    /^var\(--text-[a-z-]+\)$/,
    /^var\(\$\{[^}]+\}\)$/, // the style guide's samples name their token in a template
    /^(inherit|1em|100%)$/,
  ];
  // Two recorded exceptions: the page root (the 17px/18px root every size scales from) and the home
  // hook at 1024px (2.2222rem = 40px at the 18px root, UI-SPEC W1).
  const exceptions: [string, RegExp][] = [
    ["src/styles/global.css", /^(106[.]25|112[.]5)%$/],
    ["src/components/Cover.astro", /^2[.]2222rem$/],
  ];
  const found: string[] = [];
  for (const [path, text] of sources())
    for (const [, raw] of text.matchAll(/font-size:\s*([^;}"]+)/g)) {
      const value = raw.trim();
      if (allowed.some((rule) => rule.test(value))) continue;
      if (exceptions.some(([file, rule]) => file === path && rule.test(value))) continue;
      found.push(`${path}: font-size: ${value}`);
    }
  assert.deepEqual(found, [], "off-scale font sizes");
});
