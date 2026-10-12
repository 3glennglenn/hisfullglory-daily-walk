import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseAiFile, loadAiExplanations, clearAiCache, aiFor, blocks, publicDomainTranslations } from "../src/bible/ai.ts";
import type { BibleData } from "../src/bible/provider.ts";

const bible = JSON.parse(readFileSync("public/bible/web.json", "utf8")) as BibleData;
const aiDir = "public/ai";
const files = readdirSync(aiDir).filter((f) => f.endsWith(".json"));
const read = (file: string) => JSON.parse(readFileSync(`${aiDir}/${file}`, "utf8"));
type Raw = { records: Record<string, any>[] };
const chapterRecord = (file: Raw) => file.records.find((r) => r.chapter !== undefined)!;
const bookRecord = (file: Raw) => file.records.find((r) => r.scope === "book")!;

test("every AI file names a real WEB book and passes validation as an unreviewed draft", () => {
  assert.ok(files.length > 0);
  for (const file of files) {
    const book = file.replace(/\.json$/, "");
    const records = parseAiFile(read(file), book, bible);
    assert.ok(records.length > 0, `${file} has records`);
    for (const r of records) {
      assert.equal(r.review, "ai draft", `${r.id} stays a draft until a theological reader signs off`);
      assert.ok(r.sections.some((s) => s.kind === "summary"), `${r.id} explains the text`);
      for (const t of r.translations)
        for (const x of t.renderings) assert.ok(x.translation in publicDomainTranslations, `${r.id} compares public-domain text only`);
    }
  }
});

test("AI files that misquote Scripture or use a licensed translation are rejected whole", () => {
  const good = read("psalms.json") as Raw;
  const copy = () => structuredClone(good);
  assert.throws(() => parseAiFile(good, "romans", bible), /declare book/);
  const misquote = copy();
  chapterRecord(misquote).sections[0].text += " The psalm says “The LORD is my rock”.";
  assert.throws(() => parseAiFile(misquote, "psalms", bible), /not in the WEB text/);
  const licensed = copy();
  chapterRecord(licensed).translations[0].renderings[0].translation = "NIV";
  assert.throws(() => parseAiFile(licensed, "psalms", bible), /public-domain/);
  const unlabelled = copy();
  delete chapterRecord(unlabelled).model;
  assert.throws(() => parseAiFile(unlabelled, "psalms", bible), /model/);
  const reviewedByNobody = copy();
  chapterRecord(reviewedByNobody).review = "approved";
  assert.throws(() => parseAiFile(reviewedByNobody, "psalms", bible), /review/);
  const wrongChapter = copy();
  Object.assign(chapterRecord(wrongChapter), { chapter: 151, id: "ai:psalms/151" });
  assert.throws(() => parseAiFile(wrongChapter, "psalms", bible), /chapter must exist/);
  const duplicate = copy();
  duplicate.records.push(structuredClone(chapterRecord(duplicate)));
  assert.throws(() => parseAiFile(duplicate, "psalms", bible), /chapter must exist once/);
  const wrongVerse = copy();
  chapterRecord(wrongVerse).translations[0].verse = 99;
  assert.throws(() => parseAiFile(wrongVerse, "psalms", bible), /existing verse/);
});

test("a book has at most one explanation for the whole book, without translation notes", () => {
  const good = read("psalms.json") as Raw;
  const copy = () => structuredClone(good);
  assert.ok(bookRecord(good), "psalms has a book record");
  const twice = copy();
  twice.records.push(structuredClone(bookRecord(twice)));
  assert.throws(() => parseAiFile(twice, "psalms", bible), /one book record/);
  const withChapter = copy();
  bookRecord(withChapter).chapter = 1;
  assert.throws(() => parseAiFile(withChapter, "psalms", bible), /one book record/);
  const withTranslations = copy();
  bookRecord(withTranslations).translations = structuredClone(chapterRecord(withTranslations).translations);
  assert.throws(() => parseAiFile(withTranslations, "psalms", bible), /only on a chapter/);
  const misquote = copy();
  bookRecord(misquote).sections[0].text += " It opens with “Blessed is the phone”.";
  assert.throws(() => parseAiFile(misquote, "psalms", bible), /not in the WEB text of this book/);
});

test("a chapter shows its own explanation, else the one for its book", () => {
  const records = parseAiFile(read("psalms.json"), "psalms", bible);
  assert.equal(aiFor(records, "psalms", 23)?.id, "ai:psalms/23");
  assert.equal(aiFor(records, "psalms", 1)?.id, "ai:psalms");
  assert.equal(aiFor(records, "genesis", 1), undefined);
});

test("AI loading shows nothing on missing, non-JSON, invalid or offline files", async () => {
  const response = (status: number, body: unknown, type = "application/json") =>
    Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": type } }));
  clearAiCache();
  assert.deepEqual(await loadAiExplanations("genesis", bible, () => response(404, "")), []);
  clearAiCache();
  assert.deepEqual(await loadAiExplanations("genesis", bible, () => response(200, "<!doctype html>", "text/html")), []);
  clearAiCache();
  assert.deepEqual(await loadAiExplanations("genesis", bible, () => response(200, { book: "exodus", records: [] })), []);
  clearAiCache();
  assert.deepEqual(await loadAiExplanations("genesis", bible, () => Promise.reject(new Error("offline"))), []);
  assert.deepEqual(await loadAiExplanations("../etc", bible, () => { throw new Error("must not fetch"); }), []);
  clearAiCache();
  const ok = await loadAiExplanations("psalms", bible, () => response(200, read("psalms.json")));
  assert.ok(ok.some((r) => r.id === "ai:psalms/23"));
});

test("explanation text splits into paragraphs and simple lists", () => {
  assert.deepEqual(blocks("One.\n\n- a\n- b\n\nTwo\nlines."), [{ paragraph: "One." }, { list: ["a", "b"] }, { paragraph: "Two lines." }]);
});
