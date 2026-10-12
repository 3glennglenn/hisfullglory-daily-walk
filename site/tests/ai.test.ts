// Checks how the built pages show the AI explanations (run `npm run build` first;
// `npm run check` does both). The files themselves are checked by the app's tests/ai.test.ts.
// Rules: docs/AI_EXPLANATIONS.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { aiFor, type AiExplanation } from "../src/lib/ai.ts";
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

/** A page must show exactly the expected explanation as its own block, or none at all. */
function checkPage(path: string, expected: AiExplanation | undefined, where: string) {
  const html = readFileSync(`dist/${path}/index.html`, "utf8");
  if (!expected) {
    assert.ok(!html.includes('data-layer="ai"'), `${where}: no AI block`);
    return;
  }
  const block = visible(layer(html, "ai"));
  assert.ok(block.includes("AI explanation"), `${where}: label`);
  assert.ok(block.includes("Written by an AI model"), `${where}: says who wrote it`);
  assert.ok(block.includes("can contain mistakes"), `${where}: warns about mistakes`);
  assert.ok(block.includes(expected.model), `${where}: names the model`);
  const opening = clean(expected.sections[0].text.split("\n")[0]);
  assert.ok(block.includes(opening), `${where}: shows ${expected.id} as written`);
  assert.ok(!visible(layer(html, "sourced")).includes(opening), `${where}: not inside the sourced note`);
}

test("AI explanations load and stay drafts until a reviewer signs off", () => {
  assert.ok(ai.length > 0, "at least one AI explanation");
  for (const entry of ai) {
    assert.equal(entry.review, "ai draft", `${entry.id} is labelled as an unreviewed draft`);
    assert.ok(entry.model.length > 0, `${entry.id} names its model`);
  }
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

test("every Bible page shows the right AI explanation as its own labelled block, or none", () => {
  for (const book of bible.books) {
    checkPage(
      `bible/${book.slug}`,
      ai.find((entry) => entry.book === book.slug && entry.scope === "book"),
      book.name,
    );
    for (const chapter of book.chapters)
      checkPage(
        `bible/${book.slug}/${chapter.number}`,
        aiFor(ai, book.slug, chapter.number),
        `${book.name} ${chapter.number}`,
      );
  }
});

test("a chapter with its own explanation keeps its sourced note beside it", () => {
  for (const entry of ai.filter((e) => e.scope === "chapter")) {
    const html = readFileSync(`dist/bible/${entry.book}/${entry.chapter}/index.html`, "utf8");
    const note = chapterNote(entry.book, entry.chapter!);
    if (note)
      assert.ok(visible(layer(html, "sourced")).includes(clean(note.text)), `${entry.id} keeps its sourced note`);
  }
});
