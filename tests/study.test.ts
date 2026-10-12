import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  parseStudyFile,
  loadStudyRecords,
  clearStudyCache,
  knowledgeFor,
  knowledgeRecords,
  assembleGrounding,
} from "../src/bible/knowledge.ts";
import type { BibleData } from "../src/bible/provider.ts";

const bible = JSON.parse(readFileSync("public/bible/web.json", "utf8")) as BibleData;
const studyDir = "public/study";
const files = readdirSync(studyDir).filter((f) => f.endsWith(".json"));

test("every study file names a real WEB book and passes validation", () => {
  assert.ok(files.length > 0);
  for (const file of files) {
    const book = file.replace(/\.json$/, "");
    const records = parseStudyFile(JSON.parse(readFileSync(`${studyDir}/${file}`, "utf8")), book, bible);
    assert.ok(records.length > 0, `${file} has records`);
    for (const r of records) {
      assert.equal(r.review, "editorial draft", `${r.id} stays a draft until a reviewer signs off`);
      assert.ok(r.source.startsWith("https://"));
      assert.ok((r.basis ?? []).length > 0, `${r.id} cites the text it rests on`);
    }
  }
});

test("study notes never quote Scripture that the WEB text does not contain", () => {
  // Every quoted phrase in a note must appear in one of its basis verses.
  for (const file of files) {
    const book = file.replace(/\.json$/, "");
    for (const r of parseStudyFile(JSON.parse(readFileSync(`${studyDir}/${file}`, "utf8")), book, bible)) {
      const basisText = (r.basis ?? []).map((p) => {
        const [, , slug, ch, v] = p.split("/");
        return bible.books.find((b) => b.slug === slug)!.chapters[Number(ch) - 1].verses.find((x) => x.number === Number(v))!.text;
      }).join(" ");
      for (const quote of r.text.matchAll(/“([^”]+)”/g)) {
        const q = quote[1];
        // Single-word glosses such as "Corban" must still occur in the basis.
        assert.ok(basisText.includes(q), `${r.id}: "${q}" not found in its basis verses`);
      }
    }
  }
});

test("invalid study files are rejected whole", () => {
  const good = { id: "book:romans", scope: "book", text: "A sufficiently long note about Romans.", source: "https://ebible.org/engwebp/ROM01.htm", interpretiveStatus: "common interpretation" };
  assert.throws(() => parseStudyFile({ book: "luke", records: [good] }, "romans", bible), /declare book/);
  assert.throws(() => parseStudyFile({ book: "romans", records: [{ ...good, source: "http://x.example" }] }, "romans", bible), /HTTPS/);
  assert.throws(() => parseStudyFile({ book: "romans", records: [{ ...good, interpretiveStatus: "certain" }] }, "romans", bible), /status/);
  assert.throws(() => parseStudyFile({ book: "romans", records: [{ ...good, scope: "chapter", chapter: 17 }] }, "romans", bible), /chapter not in/);
  assert.throws(() => parseStudyFile({ book: "romans", records: [{ ...good, scope: "passage", chapter: 8, start: 99 }] }, "romans", bible), /beyond chapter/);
  assert.throws(() => parseStudyFile({ book: "romans", records: [{ ...good, basis: ["/bible/romans/1/99"] }] }, "romans", bible), /basis/);
  assert.throws(() => parseStudyFile({ book: "romans", records: [good, good] }, "romans", bible), /unique/);
  assert.throws(() => parseStudyFile({ book: "romans", records: [{ ...good, sources: [{ title: "", url: "https://a.example" }] }] }, "romans", bible), /sources/);
  assert.equal(parseStudyFile({ book: "romans", records: [good] }, "romans", bible)[0].review, "editorial draft");
});

test("book context is the fallback for any chapter, below chapter notes", () => {
  const romans = parseStudyFile(JSON.parse(readFileSync(`${studyDir}/romans.json`, "utf8")), "romans", bible);
  const records = [...knowledgeRecords, ...romans];
  assert.equal(knowledgeFor("romans", 3, 23, records)?.scope, "book");
  assert.equal(knowledgeFor("romans", 8, 28, records)?.scope, "chapter", "existing Romans 8 note still wins");
  assert.equal(knowledgeFor("genesis", 1, 1, records), undefined);
  assert.equal(assembleGrounding(bible, "romans", 3, 23, records).at(-1)?.id, "book:romans");
});

test("study loading falls back honestly on missing, non-JSON or invalid files", async () => {
  clearStudyCache();
  const response = (status: number, body: unknown, type = "application/json") =>
    Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": type } }));
  assert.deepEqual(await loadStudyRecords("genesis", () => response(404, "")), []);
  clearStudyCache();
  assert.deepEqual(await loadStudyRecords("genesis", () => response(200, "<!doctype html>", "text/html")), []);
  clearStudyCache();
  assert.deepEqual(await loadStudyRecords("genesis", () => response(200, { book: "exodus", records: [] })), []);
  clearStudyCache();
  assert.deepEqual(await loadStudyRecords("genesis", () => Promise.reject(new Error("offline"))), []);
  assert.deepEqual(await loadStudyRecords("../etc", () => { throw new Error("must not fetch"); }), []);
  clearStudyCache();
  const ok = await loadStudyRecords("romans", () => response(200, JSON.parse(readFileSync(`${studyDir}/romans.json`, "utf8"))));
  assert.equal(ok[0].id, "book:romans");
});

test("the community opens with the eight launch topics", async () => {
  const { launchTopics, findTopic } = await import("../src/topics/graph.ts");
  assert.deepEqual(launchTopics.map((t) => t.label), ["Returning to God", "Growing closer to God", "Anxiety", "Prayer", "Purpose", "Relationships", "Grief", "New Christian"]);
  assert.ok(findTopic("pornography"), "non-launch topics still resolve for deep links and existing posts");
});
