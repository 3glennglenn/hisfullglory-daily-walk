import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verseText } from "../scripts/usfm.mjs";
import type { BibleData } from "../src/bible/provider.ts";

const bible = JSON.parse(readFileSync("public/bible/web.json", "utf8")) as BibleData;

test("USFM markers are removed without running words together", () => {
  // Shortened from the official source (engwebp_usfm.zip). Before 2026-10-14 the space after a
  // closing marker was removed with it, which gave "bornSon", "righteousness.”Then" and so on.
  const cases: [string, string, string][] = [
    [
      "John 3:16, footnote between Jesus' words",
      '\\wj \\+w his|strong="G3956"\\+w* \\+w only|strong="G3439"\\+w* born\\wj*\\f + \\fr 3:16 \\ft The phrase “only born” is from the Greek word “μονογενη”.\\f* \\wj \\+w Son|strong="G5207"\\+w*, \\+w that|strong="G2443"\\+w*',
      "his only born Son, that",
    ],
    [
      "Matthew 3:15, end of Jesus' words",
      '\\+w righteousness|strong="G1343"\\+w*.”\\wj* \\w Then|strong="G5119"\\w* \\w he|strong="G1161"\\w* allowed \\w him|strong="G3588"\\w*.   \n\\p\n',
      "righteousness.” Then he allowed him.",
    ],
    [
      "Matthew 5:21, cross reference",
      '\\+w murder|strong="G5407"\\+w*;’\\wj*\\x + \\xo 5:21 \\xt Exodus 20:13\\x* \\wj \\+w and|strong="G1161"\\+w* ‘\\+w Whoever|strong="G3739"\\+w*',
      "murder;’ and ‘Whoever",
    ],
    [
      "Luke 12:6, punctuation right after a footnote",
      '\\+w two|strong="G1417"\\+w* assaria coins\\wj*\\f + \\fr 12:6 \\ft An assarion was a small copper coin.\\f*\\wj ? \\+w Not|strong="G3756"\\+w*',
      "two assaria coins? Not",
    ],
    [
      "Matthew 5:3, poetry line inside Jesus' words",
      '\\wj “\\+w Blessed|strong="G3107"\\+w* \\+w are|strong="G1510"\\+w* \\+w the|strong="G3588"\\+w* \\+w poor|strong="G4434"\\+w* \\+w in|strong="G4151"\\+w* \\+w spirit|strong="G4151"\\+w*,\\wj*  \n\\q2 \\wj \\+w for|strong="G3754"\\+w* theirs',
      "“Blessed are the poor in spirit, for theirs",
    ],
    [
      "Psalm 3:2, footnote then Selah",
      '\\w in|strong="H5921"\\w* \\w God|strong="H3068"\\w*.”\\f + \\fr 3:2 \\ft The Hebrew word rendered “God” is “\\+wh אֱלֹהִ֑ים\\+wh*” (Elohim).\\f* \\qs Selah.\\qs*   \n\\q1\n',
      "in God.” Selah.",
    ],
    [
      "Luke 17:36, a verse that is only a footnote",
      "\\f + \\fr 17:36 \\ft Some Greek manuscripts add: “Two will be in the field: the one taken, and the other left.”\\f*   \n\\p\n",
      "",
    ],
  ];
  for (const [where, usfm, text] of cases) assert.equal(verseText(usfm), text, where);
});

test("no WEB verse runs two words together or has stray spaces", () => {
  // A lowercase letter directly followed by a capital ("bornSon"), or closing punctuation
  // directly followed by a letter ("world.The", "murder;’and"), means a space went missing.
  // ’ after a letter is an apostrophe ("don’t", "Father’s"), so only ’ after a non-letter counts.
  const runTogether = /\p{Ll}\p{Lu}|[.,;:!?)”]\p{L}|(?<!\p{L})’\p{L}/u;
  const problems: string[] = [];
  for (const book of bible.books)
    for (const chapter of book.chapters)
      for (const v of chapter.verses) {
        const where = `${book.name} ${chapter.number}:${v.number}`;
        const hit = v.text.match(runTogether);
        if (hit) problems.push(`${where}: "${v.text.slice(Math.max(0, hit.index! - 20), hit.index! + 20)}"`);
        if (/\s\s|^\s|\s$/.test(v.text)) problems.push(`${where}: extra whitespace`);
      }
  assert.deepEqual(problems, []);
});

test("the five verses the WEB leaves out stay marked as omitted", () => {
  const omitted = bible.books.flatMap((b) =>
    b.chapters.flatMap((c) => c.verses.filter((v) => v.omitted).map((v) => `${b.id} ${c.number}:${v.number}`)),
  );
  assert.deepEqual(omitted, ["LUK 17:36", "ACT 8:37", "ACT 15:34", "ACT 24:7", "ROM 16:25"]);
  for (const b of bible.books)
    for (const c of b.chapters) for (const v of c.verses) assert.equal(v.omitted, v.text === "", `${b.id} ${c.number}:${v.number}`);
});
