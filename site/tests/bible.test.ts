// Checks the built site (run `npm run build` first; `npm run check` does both).
// Every Bible page must exist, show the WEB text exactly, and show notes only as written.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { bookNote, chapterNote, hasSpeakers, library, speakerNote, speakerParts } from "../src/lib/bible.ts";

const { bible, notes } = library();
const page = (path: string) => `dist/${path}/index.html`;
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const speakerSpan = /<span[^>]*class="speaker"[^>]*>[^<]*<\/span>/g;

/** The text a reader sees: tags removed, entities decoded, whitespace collapsed. */
function visibleText(html: string) {
  return clean(
    html
      .replace(/<[^>]+>/g, "")
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&"),
  );
}

test("the build has been run", () => {
  assert.ok(existsSync(page("bible")), "dist/bible/index.html is missing: run npm run build");
});

test("every book and chapter has its own page", () => {
  let pages = 1;
  for (const book of bible.books) {
    assert.ok(existsSync(page(`bible/${book.slug}`)), `${book.name} page`);
    pages++;
    for (const chapter of book.chapters) {
      assert.ok(
        existsSync(page(`bible/${book.slug}/${chapter.number}`)),
        `${book.name} ${chapter.number} page`,
      );
      pages++;
    }
  }
  assert.equal(pages, 1 + 66 + 1189);
});

test("every chapter page shows the WEB text of each verse, unchanged", () => {
  for (const book of bible.books)
    for (const chapter of book.chapters) {
      const html = readFileSync(page(`bible/${book.slug}/${chapter.number}`), "utf8");
      // Speaker labels inside a verse (Song of Songs) are not verse text; the next test checks them.
      const shown = new Map(
        [...html.matchAll(/<p[^>]*\bid="v(\d+)"[^>]*>([\s\S]*?)<\/p>/g)].map(
          ([, number, inner]) => [Number(number), visibleText(inner.replace(speakerSpan, ""))],
        ),
      );
      assert.equal(shown.size, chapter.verses.length, `${book.name} ${chapter.number} verse count`);
      for (const verse of chapter.verses) {
        const expected = verse.omitted
          ? `${verse.number} Verse omitted in this WEB edition. See the source notes.`
          : `${verse.number} ${clean(verse.text)}`;
        assert.equal(
          shown.get(verse.number),
          expected,
          `${book.name} ${chapter.number}:${verse.number}`,
        );
      }
    }
});

test("Song of Songs shows each speaker label where the WEB puts it, with the note", () => {
  // Labels before a verse are their own paragraph; a label mid-verse is a span inside it.
  let labels = 0;
  for (const book of bible.books)
    for (const chapter of book.chapters) {
      const html = readFileSync(page(`bible/${book.slug}/${chapter.number}`), "utf8");
      const expected = chapter.verses.flatMap((v) => {
        const { above, parts } = speakerParts(v);
        return [
          ...above.map((label) => `above ${v.number} ${label}`),
          ...parts.filter((p) => p.label).map((p) => `inside ${v.number} ${p.label}`),
        ];
      });
      const shown: string[] = [];
      let waiting: string[] = [];
      let current = 0;
      for (const [, tag, verse, label] of html.matchAll(
        /<(p|span)\b[^>]*?(?:\bid="v(\d+)"[^>]*|class="speaker"[^>]*>([^<]+)<)/g,
      )) {
        if (verse) {
          current = Number(verse);
          shown.push(...waiting.map((l) => `above ${current} ${l}`));
          waiting = [];
        } else if (tag === "p") waiting.push(label);
        else shown.push(`inside ${current} ${label}`);
      }
      const where = `${book.name} ${chapter.number}`;
      assert.deepEqual(shown, expected, where);
      assert.equal(html.includes(speakerNote), book.id === "SNG" && hasSpeakers(chapter), `${where} note`);
      labels += shown.length;
    }
  assert.equal(labels, 33);
});

test("no note quotes Scripture that the WEB text does not contain", () => {
  for (const note of notes) {
    // A note rests on its basis verses; one without a basis rests on its own chapter.
    const verses = (note.basis ?? []).length
      ? note.basis!.map((path) => {
          const [, , slug, chapter, verse] = path.split("/");
          return bible.books
            .find((book) => book.slug === slug)!
            .chapters[Number(chapter) - 1].verses.find((v) => v.number === Number(verse))!.text;
        })
      : (bible.books
          .find((book) => book.slug === note.book)!
          .chapters[(note.chapter ?? 1) - 1].verses.map((v) => v.text));
    const basisText = verses.join(" ");
    for (const [, quote] of note.text.matchAll(/“([^”]+)”/g))
      assert.ok(basisText.includes(quote), `${note.id}: “${quote}” is not in its basis verses`);
  }
});

test("pages show the note as written, or the honest fallback", () => {
  const fallback = "Context for this book is being written.";
  let withNote = 0;
  for (const book of bible.books) {
    const html = visibleText(readFileSync(page(`bible/${book.slug}`), "utf8"));
    const own = bookNote(book.slug);
    if (own) withNote++;
    assert.ok(html.includes(own ? clean(own.text) : fallback), `${book.name} book page`);
    assert.equal(html.includes(fallback), !own, `${book.name} fallback only without a note`);
    for (const chapter of book.chapters) {
      const note = chapterNote(book.slug, chapter.number);
      const text = visibleText(readFileSync(page(`bible/${book.slug}/${chapter.number}`), "utf8"));
      assert.ok(text.includes(note ? clean(note.text) : fallback), `${book.name} ${chapter.number} note`);
      if (note) {
        assert.ok(
          text.includes(note.scope === "chapter" ? "Chapter context" : "Book context"),
          `${book.name} ${chapter.number} says which kind of context it shows`,
        );
        if (note.review === "editorial draft")
          assert.ok(text.includes("Editorial draft"), `${book.name} ${chapter.number} draft label`);
      }
    }
  }
  assert.ok(withNote > 0, "at least one book note is published");
});
