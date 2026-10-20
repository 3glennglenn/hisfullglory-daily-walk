// The giving catalog (docs/GIVING_CATALOG.md): every entry follows the research rules, the first page is the
// diverse "most effective" one, and the "why it is here" line says only what the evaluator says.
//
// Run from the project root: node --experimental-strip-types --test tests/giving-catalog.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { causes, causesByPage, curatedCharityCatalog, givingPages, whyListed } from "../src/giving/catalog.ts";

const words = (text: string) => text.trim().split(/\s+/).length;

test("the catalog has the verified entries (31 researched, plus World Vision checked by the founder) with no duplicate id or title", () => {
  assert.ok(causes.length >= 31, "the 31 verified entries and the founder-checked additions");
  assert.equal(new Set(causes.map((c) => c.id)).size, causes.length, "ids are unique");
  assert.equal(new Set(causes.map((c) => c.title.toLowerCase())).size, causes.length, "titles are unique");
  for (const c of causes) assert.match(c.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${c.id}: a lower-case slug`);
});

test("every entry follows the research rules: official https page, no query, a source, short evidence and description", () => {
  const known = new Set(givingPages.map((p) => p.id));
  for (const c of causes) {
    const donate = new URL(c.donationUrl);
    assert.equal(donate.protocol, "https:", `${c.id}: donation page is https`);
    assert.equal(donate.search, "", `${c.id}: no query string (no tracking or affiliate codes)`);
    assert.equal(donate.hash, "", `${c.id}: no fragment`);
    assert.equal(donate.username + donate.password, "", `${c.id}: no credentials`);
    const source = new URL(c.sourceUrl);
    assert.equal(source.protocol, "https:", `${c.id}: source is https`);
    assert.ok(c.evidence.trim().length > 0 && words(c.evidence) < 25, `${c.id}: evidence is under 25 words (${words(c.evidence)})`);
    assert.ok(words(c.description) <= 20, `${c.id}: description is at most 20 words (${words(c.description)})`);
    assert.ok(known.has(c.page), `${c.id}: page "${c.page}" is one of the six`);
    assert.match(c.verifiedOn, /^\d{4}-\d{2}-\d{2}$/, `${c.id}: verifiedOn is a date`);
    assert.equal(typeof c.christian, "boolean", `${c.id}: christian is set`);
    assert.doesNotMatch(c.description, /\$\s?\d|€\s?\d|£\s?\d|\bcosts? \$/i, `${c.id}: no money-to-outcome promise in the description`);
  }
});

test("a shared checkout names the choice the donor must pick, and nothing else has one", () => {
  for (const c of causes) {
    const shared = new URL(c.donationUrl).hostname === "secure.givewell.org";
    assert.equal(Boolean(c.checkoutChoice), shared, `${c.id}: checkoutChoice only where the checkout is shared`);
  }
});

test("the pages are six, in order, and each holds charities; adding an entry needs no code change", () => {
  assert.deepEqual(
    givingPages.map((p) => p.id),
    ["most-effective", "poverty-hunger", "health-research", "children-protection", "animals", "christian"],
  );
  assert.deepEqual(
    givingPages.map((p) => p.title),
    ["Most effective", "Poverty and hunger", "Health, medicine and research", "Children and protection", "Animals", "Christian charities"],
  );
  const grouped = causesByPage();
  assert.equal(grouped.length, 6);
  assert.equal(grouped.reduce((n, p) => n + p.causes.length, 0), causes.length, "every entry sits on a page");
  for (const page of grouped) assert.ok(page.causes.length > 0, `${page.id} is not empty`);
  // A new entry on a known page lands on that page without touching anything else.
  const extra = { ...causes[0], id: "extra", title: "Extra", page: "animals" as const, category: "Animals" };
  assert.equal(causesByPage([...causes, extra]).find((p) => p.id === "animals")!.causes.at(-1)!.id, "extra");
});

test("page 1 has exactly six entries from at least four different evaluators", () => {
  const first = causesByPage()[0];
  assert.equal(first.id, "most-effective");
  assert.equal(first.causes.length, 6);
  assert.ok(new Set(first.causes.map((c) => c.evaluator)).size >= 4);
});

test("Christian charities are labelled, are all on their own page, and are backed by an accountability check", () => {
  for (const c of causes) {
    assert.equal(c.christian, c.page === "christian", `${c.id}: christian flag matches the page`);
    if (c.christian) assert.ok(["Charity Navigator", "ECFA"].includes(c.evaluator), `${c.id}: Christian entries are accountability-checked`);
  }
});

test("the 'why it is here' line is exactly the wording each evaluator allows", () => {
  const byId = (id: string) => whyListed(curatedCharityCatalog.get(id)!);
  assert.equal(byId("givewell-top-charities-fund"), "Recommended by GiveWell");
  assert.equal(byId("givedirectly"), "Recommended by The Life You Can Save");
  assert.equal(byId("strongminds"), "Top charity, Happier Lives Institute");
  assert.equal(byId("taimaka"), "Promising charity, Happier Lives Institute");
  assert.equal(byId("the-humane-league"), "Recommended by Animal Charity Evaluators");
  assert.equal(byId("international-justice-mission"), "Charity Navigator: Four-Star, 97%");
  assert.equal(byId("world-relief"), "Charity Navigator: Four-Star, 100%");
  assert.equal(byId("compassion-international"), "ECFA accredited");
  assert.equal(byId("world-vision"), "ECFA accredited");
  // Every entry gets a line, and a Charity Navigator line always carries the score from its evidence.
  for (const c of causes) {
    const line = whyListed(c);
    assert.ok(line.length > 0);
    if (c.evaluator === "Charity Navigator") assert.match(line, /^Charity Navigator: Four-Star, \d+%$/, c.id);
  }
});
