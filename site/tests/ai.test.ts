// Checks the AI explanations: their data, and how the built pages show them
// (run `npm run build` first; `npm run check` does both). Rules: docs/AI_EXPLANATIONS.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseAiFile } from "../src/lib/ai.ts";
import { chapterNote, library } from "../src/lib/bible.ts";

const { bible, ai } = library();
const fixture = JSON.parse(
  readFileSync("tests/fixtures/public-domain-verses.json", "utf8"),
) as { verses: Record<string, Record<string, string>> };
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const visible = (html: string) =>
  clean(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&"),
  );
const layer = (html: string, name: string) =>
  new RegExp(`<section[^>]*data-layer="${name}"[\\s\\S]*?</section>`).exec(html)?.[0] ?? "";

test("AI explanations load and stay drafts until a reviewer signs off", () => {
  assert.ok(ai.length > 0, "at least one AI explanation");
  for (const entry of ai) {
    assert.equal(entry.review, "ai draft", `${entry.id} is labelled as an unreviewed draft`);
    assert.ok(entry.model.length > 0, `${entry.id} names its model`);
  }
});

test("an AI explanation that misquotes Scripture is rejected", () => {
  const good = JSON.parse(readFileSync("../public/ai/psalms.json", "utf8"));
  assert.equal(parseAiFile(good, "psalms", bible).length, good.records.length);
  const bad = structuredClone(good);
  bad.records[0].sections[0].text += " The psalm says “The LORD is my rock”.";
  assert.throws(() => parseAiFile(bad, "psalms", bible), /not in the WEB text/);
  const licensed = structuredClone(good);
  licensed.records[0].translations[0].renderings[0].translation = "NIV";
  assert.throws(() => parseAiFile(licensed, "psalms", bible), /public-domain/);
});

test("wording from other translations matches the public-domain verse it comes from", () => {
  let checked = 0;
  for (const entry of ai)
    for (const note of entry.translations)
      for (const rendering of note.renderings) {
        const key = `${entry.book}/${entry.chapter}/${note.verse}`;
        const verse = fixture.verses[rendering.translation]?.[key];
        assert.ok(verse, `${entry.id}: no ${rendering.translation} text on file for verse ${note.verse}`);
        assert.ok(
          clean(verse).includes(clean(rendering.text)),
          `${entry.id}: ${rendering.translation} wording for verse ${note.verse} differs from the source`,
        );
        checked++;
      }
  assert.ok(checked > 0);
});

test("pages show an AI explanation as its own labelled block, apart from sourced notes", () => {
  for (const entry of ai) {
    const html = readFileSync(`dist/bible/${entry.book}/${entry.chapter}/index.html`, "utf8");
    const block = visible(layer(html, "ai"));
    assert.ok(block.includes("AI explanation"), `${entry.id} label`);
    assert.ok(block.includes("Written by an AI model"), `${entry.id} says who wrote it`);
    assert.ok(block.includes("can contain mistakes"), `${entry.id} warns about mistakes`);
    assert.ok(block.includes(entry.model), `${entry.id} names the model`);
    const opening = clean(entry.sections[0].text.split("\n")[0]);
    assert.ok(block.includes(opening), `${entry.id} text is shown as written`);
    const sourced = visible(layer(html, "sourced"));
    assert.ok(!sourced.includes(opening), `${entry.id} is not inside the sourced note`);
    const note = chapterNote(entry.book, entry.chapter);
    if (note) assert.ok(sourced.includes(clean(note.text)), `${entry.id} keeps its sourced note`);
  }
});

test("chapters without an AI explanation show none", () => {
  const has = new Set(ai.map((entry) => `${entry.book}/${entry.chapter}`));
  for (const book of bible.books)
    for (const chapter of book.chapters) {
      if (has.has(`${book.slug}/${chapter.number}`)) continue;
      const html = readFileSync(`dist/bible/${book.slug}/${chapter.number}/index.html`, "utf8");
      assert.ok(!html.includes('data-layer="ai"'), `${book.name} ${chapter.number}`);
    }
});
