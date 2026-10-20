import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adjacentChapters, bookTitle, isOldTestament, oldTestamentBooks, referenceFromPath, slugWords } from "../src/bible/passages.ts";
import type { BibleData } from "../src/bible/provider.ts";

const bible = JSON.parse(readFileSync("public/bible/web.json", "utf8")) as BibleData;

test("the chapter before and after crosses from one book to the next; only Genesis 1 and Revelation 22 have a gap", () => {
  assert.equal(adjacentChapters(bible, "genesis", 1).previous, undefined);
  assert.equal(adjacentChapters(bible, "genesis", 1).next?.reference, "Genesis 2");
  assert.equal(adjacentChapters(bible, "revelation", 22).next, undefined);
  assert.equal(adjacentChapters(bible, "revelation", 22).previous?.reference, "Revelation 21");
  assert.equal(adjacentChapters(bible, "john", 3).previous?.reference, "John 2");
  assert.equal(adjacentChapters(bible, "john", 3).next?.reference, "John 4");
  // John 1 follows Luke 24, and Genesis 50 leads to Exodus 1.
  assert.equal(adjacentChapters(bible, "john", 1).previous?.reference, "Luke 24");
  assert.equal(adjacentChapters(bible, "genesis", 50).next?.reference, "Exodus 1");
  assert.deepEqual(adjacentChapters(bible, "malachi", 4).next, { book: "matthew", chapter: 1, reference: "Matthew 1" });
  // Every chapter of the Bible has a previous one except the first, and a next one except the last.
  let gaps = 0;
  for (const book of bible.books)
    for (const chapter of book.chapters) {
      const { previous, next } = adjacentChapters(bible, book.slug, chapter.number);
      if (!previous) gaps++;
      if (!next) gaps++;
    }
  assert.equal(gaps, 2);
  assert.deepEqual(adjacentChapters(bible, "nowhere", 1), {});
});

test("every book has a printed-Bible title and the testaments split after Malachi", () => {
  const titles = bible.books.map((b) => bookTitle(b));
  assert.equal(new Set(titles).size, 66, "66 different titles");
  assert.equal(bookTitle(bible.books.find((b) => b.slug === "john")!), "The Gospel of John");
  assert.equal(bookTitle(bible.books.find((b) => b.slug === "psalms")!), "The Book of Psalms");
  assert.equal(bookTitle(bible.books.find((b) => b.slug === "1-samuel")!), "The First Book of Samuel");
  assert.equal(bookTitle(bible.books.find((b) => b.slug === "acts")!), "The Acts of the Apostles");
  assert.equal(bible.books[oldTestamentBooks - 1].slug, "malachi");
  assert.equal(isOldTestament(bible, "malachi"), true);
  assert.equal(isOldTestament(bible, "matthew"), false);
});

test("references for stored addresses use the book's own name, and fall back to words before the Bible has loaded", () => {
  assert.equal(referenceFromPath(bible, "/bible/romans/8/28"), "Romans 8:28");
  assert.equal(referenceFromPath(bible, "/bible/song-of-solomon/2"), "Song of Solomon 2");
  assert.equal(referenceFromPath(null, "/bible/1-john/3"), "1 John 3");
  assert.equal(referenceFromPath(null, "/bible/song-of-solomon/2/4"), "Song of Solomon 2:4");
  assert.equal(slugWords("2-kings"), "2 Kings");
  assert.equal(referenceFromPath(bible, "/somewhere"), "/somewhere", "anything that is not a passage is returned as it is");
});
