import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { STUDY_BOOKS } from "../src/bible/studyBooks.ts";
import { parseRoute } from "../src/platform/router.ts";
import type { BibleData } from "../src/bible/provider.ts";

// Bible, Study lists the books that have study notes from STUDY_BOOKS (01.2 D-05, T-01.2-11). The list must be the
// folder, no more and no less, and every slug must be a book the Bible has and an address the router accepts.
const bible = JSON.parse(readFileSync("public/bible/web.json", "utf8")) as BibleData;
const inFolder = readdirSync("public/study")
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""));

test("STUDY_BOOKS is exactly the books that have a file in public/study", () => {
  assert.ok(inFolder.length > 0);
  assert.deepEqual([...STUDY_BOOKS].sort(), [...inFolder].sort());
  assert.equal(new Set(STUDY_BOOKS).size, STUDY_BOOKS.length, "no book twice");
});

test("STUDY_BOOKS follows the order of the Bible and names real books", () => {
  const order = bible.books.map((book) => book.slug);
  const at = STUDY_BOOKS.map((slug) => order.indexOf(slug));
  assert.ok(at.every((i) => i >= 0), "every slug is a book of the WEB");
  assert.deepEqual([...at].sort((a, b) => a - b), at, "canonical order");
});

test("every slug opens the book's first chapter at Context through the router", () => {
  for (const slug of STUDY_BOOKS) {
    assert.match(slug, /^[a-z0-9-]+$/);
    const route = parseRoute(`/bible/${slug}/1`, "?tab=context");
    assert.equal(route.page, "bible", slug);
    assert.equal(route.book, slug);
    assert.equal(route.chapter, 1);
    assert.equal(route.tab, "context");
  }
});
