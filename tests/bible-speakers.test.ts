import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BibleData } from "../src/bible/provider.ts";

const bible = JSON.parse(readFileSync("public/bible/web.json", "utf8")) as BibleData;
const verse = (id: string, chapter: number, number: number) =>
  bible.books.find((b) => b.id === id)!.chapters.find((c) => c.number === chapter)!.verses.find((v) => v.number === number)!.text;

// Song of Songs marks who speaks with `\sp Beloved`, `\sp Lover`, `\sp Friends` and `\sp Brothers`
// lines just before the next verse. Before 2026-10-14 the importer kept them as words, so 27
// verses ended with or contained a label: "…which is Solomon’s. Beloved".
const label = /(?:^|\s)(?:Beloved|Lover|Friends|Brothers)(?=$|\s[\p{Lu}“‘])/u;

test("no verse ends with or contains a Song of Songs speaker label", () => {
  const problems: string[] = [];
  for (const book of bible.books)
    for (const chapter of book.chapters)
      for (const v of chapter.verses) {
        const where = `${book.name} ${chapter.number}:${v.number}`;
        const hit = v.text.match(label);
        if (hit) problems.push(`${where}: "${v.text.slice(Math.max(0, hit.index! - 20), hit.index! + 20)}"`);
        // In the Song's own text these words only appear in lowercase ("my beloved", "Eat, friends!").
        if (book.id === "SNG" && /\b(?:Beloved|Lover|Friends|Brothers)\b/.test(v.text)) problems.push(`${where}: capitalised label word`);
      }
  assert.deepEqual(problems, []);
});

test("verses that held a speaker label keep the rest of their text", () => {
  assert.equal(verse("SNG", 1, 1), "The Song of songs, which is Solomon’s.");
  assert.equal(
    verse("SNG", 1, 4),
    "Take me away with you. Let’s hurry. The king has brought me into his rooms. We will be glad and rejoice in you. We will praise your love more than wine! They are right to love you.",
  );
  assert.equal(verse("SNG", 8, 5).startsWith("Who is this who comes up from the wilderness, leaning on her beloved? Under"), true);
});
