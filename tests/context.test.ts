import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { approvedChecks, checkOfTheDay, refLabel, toAppCheck, withVoices } from "../src/context/checks.ts";
import { parseRoute } from "../src/platform/router.ts";

const dir = "site/content/context-checks";
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));

test("every approved context check on the website reads cleanly in the app, and drafts stay out", () => {
  const approved = files.filter((f) => f.review === "approved");
  const checks = approvedChecks(files);
  assert.equal(checks.length, approved.length);
  assert.ok(checks.length > 0);
  assert.equal(toAppCheck({ ...approved[0], review: "draft" }), null);
  assert.equal(toAppCheck({ ...approved[0], hook: "" }), null);
  // Every quoted voice in a story is there to be shown.
  for (const check of checks)
    for (const piece of withVoices(check.argued ?? "", check.voices))
      assert.ok(typeof piece === "string" || piece.words.length > 0, `${check.slug}: quoted voice`);
});

test("one check a day, the same for every reader, going round the whole list", () => {
  const checks = approvedChecks(files);
  assert.equal(checkOfTheDay(checks, "2026-10-14")?.slug, checkOfTheDay(checks, "2026-10-14")?.slug);
  const seen = new Set<string>();
  for (let day = 1; day <= checks.length; day++) seen.add(checkOfTheDay(checks, `2026-11-${String(day).padStart(2, "0")}`)!.slug);
  assert.equal(seen.size, checks.length);
  assert.equal(checkOfTheDay([], "2026-10-14"), undefined);
});

test("references and the story routes read the way a person would write them", () => {
  assert.equal(refLabel({ book: "1-corinthians", chapter: 10, start: 13, end: 13 }), "1 Corinthians 10:13");
  assert.equal(refLabel({ book: "psalms", chapter: 46, start: 10, end: 10 }), "Psalm 46:10");
  assert.equal(refLabel({ book: "john", chapter: 8, start: 31, end: 32 }), "John 8:31-32");
  assert.deepEqual(parseRoute("/context"), { page: "context", id: undefined, tab: "read" });
  assert.equal(parseRoute("/context/john-8-32").id, "john-8-32");
  assert.equal(parseRoute("/context/John_8").page, "not-found");
  assert.equal(parseRoute("/context/a/b").page, "not-found");
});
