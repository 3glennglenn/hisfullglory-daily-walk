import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  aiUnreviewedCardLabel,
  aiUnreviewedLabel,
  editorialNote,
  publishedChecks,
  refLabel,
  splitHook,
  todaysCheck,
  toAppCheck,
  withVoices,
} from "../src/context/checks.ts";
import { parseRoute } from "../src/platform/router.ts";

const dir = "site/content/context-checks";
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));

// A whole file as the site writes it, built here so each case can break one thing.
const file = (slug: string, over: Record<string, unknown> = {}) => ({
  slug,
  review: "approved",
  approved: "2026-10-14",
  drafted: "ai",
  written: "2026-10-13",
  verse: { book: "john", chapter: 3, start: 16, end: 16 },
  hook: "You know X. But did you know Y?",
  story: "The story.",
  storyStatus: "scripture",
  moment: "The moment.",
  readings: "The readings.",
  point: "The point.",
  voices: [],
  sources: [],
  ...over,
});
const aiFile = (slug: string, over: Record<string, unknown> = {}) => {
  const { approved: _approved, ...rest } = file(slug);
  return { ...rest, review: "ai-unreviewed", model: "Test model", ...over };
};

test("every context check the website publishes reads cleanly in the app, and drafts stay out", () => {
  // The live folder is counted at run time: the daily routine adds a file to it every day.
  const published = files.filter((f) => f.review === "approved" || f.review === "ai-unreviewed");
  const checks = publishedChecks(files);
  assert.equal(checks.length, published.length);
  assert.ok(checks.length > 0);
  for (const f of published) {
    const read = toAppCheck(f);
    assert.ok(read, `${f.slug} reads in the app`);
    assert.equal(read.review, f.review);
    assert.equal(read.written, f.written);
  }
  const approved = files.find((f) => f.review === "approved");
  assert.equal(toAppCheck({ ...approved, review: "draft" }), null);
  assert.equal(publishedChecks(files.map((f) => ({ ...f, review: "draft" }))).length, 0);
  // Every quoted voice in a story is there to be shown.
  for (const check of checks)
    for (const piece of withVoices(check.argued ?? "", check.voices))
      assert.ok(typeof piece === "string" || piece.words.length > 0, `${check.slug}: quoted voice`);
});

// Founder decision D-06 of 2026-10-19 ("Ja, elke dag de nieuwste") replaced the old assertion that a check
// written by an AI model, which no person has checked, never reaches the app. It reaches the app now, with its
// review, written date and model, and the screens that show it carry the label.
test("D-06: an AI-unreviewed check reaches the app with its review, written date and model", () => {
  const read = toAppCheck(aiFile("john-3-16", { written: "2026-10-19" }));
  assert.ok(read);
  assert.equal(read.review, "ai-unreviewed");
  assert.equal(read.written, "2026-10-19");
  assert.equal(read.model, "Test model");
  assert.equal(read.approved, undefined);
  assert.equal(read.drafted, "ai");
  const approved = toAppCheck(file("a"));
  assert.ok(approved);
  assert.equal(approved.review, "approved");
  assert.equal(approved.approved, "2026-10-14");
  assert.equal(approved.model, undefined);
});

test("toAppCheck leaves out drafts and files that are not whole", () => {
  assert.equal(toAppCheck(file("a", { review: "draft" })), null);
  assert.equal(toAppCheck(file("a", { review: "draft", approved: undefined })), null);
  // An AI-unreviewed file needs the model that wrote it, and must say drafted "ai".
  assert.equal(toAppCheck(aiFile("a", { model: undefined })), null);
  assert.equal(toAppCheck(aiFile("a", { model: "  " })), null);
  assert.equal(toAppCheck(aiFile("a", { drafted: "human" })), null);
  // An approved file needs the day of approval and a real written date.
  assert.equal(toAppCheck(file("a", { approved: undefined })), null);
  assert.equal(toAppCheck(file("a", { approved: "2026-13-40" })), null);
  assert.equal(toAppCheck(file("a", { written: "yesterday" })), null);
  // No hook, or no other part of the story, no check.
  assert.equal(toAppCheck(file("a", { hook: "" })), null);
  assert.equal(toAppCheck(file("a", { hook: undefined })), null);
  assert.equal(toAppCheck(aiFile("a", { hook: "  " })), null);
  assert.equal(toAppCheck(file("a", { moment: undefined })), null);
  assert.equal(toAppCheck(file("Not A Slug")), null);
  assert.equal(toAppCheck(file("a", { storyStatus: "other" })), null);
  assert.equal(toAppCheck(null), null);
  assert.equal(toAppCheck("text"), null);
});

test("publishedChecks orders newest first: publication date, then later written, then slug A to Z", () => {
  const list = publishedChecks([
    file("old", { approved: "2026-10-14", written: "2026-10-13" }),
    // An AI-unreviewed check counts from the day it was written.
    aiFile("ai-new", { written: "2026-10-19" }),
    // The same publication date as "b-tie": the later written date goes first.
    file("a-tie", { approved: "2026-10-16", written: "2026-10-12" }),
    file("c-tie", { approved: "2026-10-16", written: "2026-10-15" }),
    // Same publication date, same written date: slug A to Z.
    file("b-tie", { approved: "2026-10-16", written: "2026-10-15" }),
    file("draft", { review: "draft", approved: undefined }),
  ]);
  assert.deepEqual(list.map((c) => c.slug), ["ai-new", "b-tie", "c-tie", "a-tie", "old"]);
});

test("todaysCheck: the newest check the reader has not finished on an earlier day", () => {
  const checks = publishedChecks([
    aiFile("newest", { written: "2026-10-19" }),
    file("middle", { approved: "2026-10-16" }),
    file("oldest", { approved: "2026-10-14" }),
  ]);
  assert.deepEqual(checks.map((c) => c.slug), ["newest", "middle", "oldest"]);
  const date = "2026-10-20";

  // An empty shelf: the newest one, unread.
  const fresh = todaysCheck(checks, [], date);
  assert.equal(fresh?.check.slug, "newest");
  assert.equal(fresh?.state, "unread");
  assert.equal(fresh?.finishedOn, undefined);

  // The newest was finished on an earlier day: skipped, the next newest is Today's.
  const skipped = todaysCheck(checks, [{ slug: "newest", finishedOn: "2026-10-19" }], date);
  assert.equal(skipped?.check.slug, "middle");
  assert.equal(skipped?.state, "unread");

  // A check finished today stays Today's, in its finished state.
  const today = todaysCheck(checks, [{ slug: "newest", finishedOn: date }], date);
  assert.equal(today?.check.slug, "newest");
  assert.equal(today?.state, "finished-today");
  assert.equal(today?.finishedOn, date);
  // ...also when an older one was finished earlier and a newer-looking one is unread below it.
  const later = todaysCheck(checks, [{ slug: "middle", finishedOn: date }], date);
  assert.equal(later?.check.slug, "newest", "a newer unread check comes before the one finished today");
  assert.equal(later?.state, "unread");

  // The shelf holds a check finished earlier and one finished today: the newer unread one is still first;
  // with the newest finished today, it stays.
  const mixed = todaysCheck(checks, [{ slug: "oldest", finishedOn: "2026-10-18" }, { slug: "newest", finishedOn: date }], date);
  assert.equal(mixed?.check.slug, "newest");
  assert.equal(mixed?.state, "finished-today");

  // Every check finished before today: the newest, in its finished state, with the day it was finished.
  const all = todaysCheck(
    checks,
    [
      { slug: "oldest", finishedOn: "2026-10-15" },
      { slug: "middle", finishedOn: "2026-10-17" },
      { slug: "newest", finishedOn: "2026-10-19" },
    ],
    date,
  );
  assert.equal(all?.check.slug, "newest");
  assert.equal(all?.state, "all-finished");
  assert.equal(all?.finishedOn, "2026-10-19");

  // Nothing published.
  assert.equal(todaysCheck([], [], date), undefined);
});

test("a file the app cannot read is skipped and the next newest is used", () => {
  const checks = publishedChecks([
    // The newest by date, but without a hook.
    file("broken", { approved: "2026-10-30", hook: undefined }),
    // An AI-unreviewed file without a model.
    aiFile("no-model", { written: "2026-10-29", model: undefined }),
    file("good", { approved: "2026-10-20" }),
    file("older", { approved: "2026-10-14" }),
  ]);
  assert.deepEqual(checks.map((c) => c.slug), ["good", "older"]);
  assert.equal(todaysCheck(checks, [], "2026-10-21")?.check.slug, "good");
});

test("splitHook splits at the turn of the hook and leaves other hooks whole", () => {
  assert.deepEqual(splitHook("You know X. But did you know Y?"), { first: "You know X.", second: "But did you know Y?" });
  assert.deepEqual(splitHook("You know “For God so loved the world”. But did you know it was first spoken to one man?"), {
    first: "You know “For God so loved the world”.",
    second: "But did you know it was first spoken to one man?",
  });
  assert.deepEqual(splitHook("You know the saying that money is the root of all evil?"), { first: "You know the saying that money is the root of all evil?" });
});

test("the label words are the site's, word for word", () => {
  assert.equal(aiUnreviewedCardLabel, "Context written by AI, from named sources.");
  assert.equal(aiUnreviewedLabel, "Context written by AI, from the sources below. The Bible text is the World English Bible.");
  assert.equal(editorialNote("ai-unreviewed", "ai"), "This context was written by an AI model to help you see the verse in its setting. The Bible text is the World English Bible. Before publishing, an automatic check made sure every source below opens and every quotation matches its source. It can contain mistakes. If a source says otherwise, tell us.");
  assert.equal(
    editorialNote("approved", "ai"),
    "Written with the help of an AI model. Scripture quotations are checked against the World English Bible. Approved by HisFullGlory. Not reviewed by a theological reader.",
  );
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
