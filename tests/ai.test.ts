import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseAiFile, loadAiExplanations, clearAiCache, blocks, publicDomainTranslations } from "../src/bible/ai.ts";
import type { BibleData } from "../src/bible/provider.ts";

const bible = JSON.parse(readFileSync("public/bible/web.json", "utf8")) as BibleData;
const aiDir = "public/ai";
const files = readdirSync(aiDir).filter((f) => f.endsWith(".json"));
const read = (file: string) => JSON.parse(readFileSync(`${aiDir}/${file}`, "utf8"));

test("every AI file names a real WEB book and passes validation as an unreviewed draft", () => {
  assert.ok(files.length > 0);
  for (const file of files) {
    const book = file.replace(/\.json$/, "");
    const records = parseAiFile(read(file), book, bible);
    assert.ok(records.length > 0, `${file} has records`);
    for (const r of records) {
      assert.equal(r.review, "ai draft", `${r.id} stays a draft until a theological reader signs off`);
      assert.ok(r.sections.some((s) => s.kind === "summary"), `${r.id} explains the chapter`);
      for (const t of r.translations)
        for (const x of t.renderings) assert.ok(x.translation in publicDomainTranslations, `${r.id} compares public-domain text only`);
    }
  }
});

test("AI files that misquote Scripture or use a licensed translation are rejected whole", () => {
  const good = read("psalms.json");
  const copy = () => structuredClone(good);
  assert.throws(() => parseAiFile(good, "romans", bible), /declare book/);
  const misquote = copy();
  misquote.records[0].sections[0].text += " The psalm says “The LORD is my rock”.";
  assert.throws(() => parseAiFile(misquote, "psalms", bible), /not in the WEB text/);
  const licensed = copy();
  licensed.records[0].translations[0].renderings[0].translation = "NIV";
  assert.throws(() => parseAiFile(licensed, "psalms", bible), /public-domain/);
  const unlabelled = copy();
  delete unlabelled.records[0].model;
  assert.throws(() => parseAiFile(unlabelled, "psalms", bible), /model/);
  const reviewedByNobody = copy();
  reviewedByNobody.records[0].review = "approved";
  assert.throws(() => parseAiFile(reviewedByNobody, "psalms", bible), /review/);
  const wrongChapter = copy();
  wrongChapter.records[0].chapter = 151;
  assert.throws(() => parseAiFile(wrongChapter, "psalms", bible), /chapter must exist/);
  const duplicate = copy();
  duplicate.records.push(structuredClone(duplicate.records[0]));
  assert.throws(() => parseAiFile(duplicate, "psalms", bible), /chapter must exist once/);
  const wrongVerse = copy();
  wrongVerse.records[0].translations[0].verse = 99;
  assert.throws(() => parseAiFile(wrongVerse, "psalms", bible), /existing verse/);
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
  assert.equal(ok[0].id, "ai:psalms/23");
});

test("explanation text splits into paragraphs and simple lists", () => {
  assert.deepEqual(blocks("One.\n\n- a\n- b\n\nTwo\nlines."), [{ paragraph: "One." }, { list: ["a", "b"] }, { paragraph: "Two lines." }]);
});
