import test from "node:test";
import assert from "node:assert/strict";
import { countLabel, finishCheck, miniSpineHeight, monthDay, shelfHeading, shelfSummary, slugReference, spineHeight } from "../src/context/shelf.ts";
import { freshPlatform, savePlatform, V3_KEY } from "../src/platform/persistence.ts";
import type { ShelfEntry } from "../src/platform/models.ts";
import { aiUnreviewedCardLabel, checkUrl, shareText, type AppContextCheck } from "../src/context/checks.ts";

// Only the fields the shelf looks at.
const check = (slug: string, review: "approved" | "ai-unreviewed") => ({ slug, review }) as AppContextCheck;

test("finishCheck appends a finished check once and the shelf only grows (D-07)", () => {
  const empty: ShelfEntry[] = [];
  const one = finishCheck(empty, "john-3-16", "2026-10-20");
  assert.deepEqual(one, [{ slug: "john-3-16", finishedOn: "2026-10-20" }]);
  assert.deepEqual(empty, [], "the shelf that was passed in is not changed");
  // A second call for the same slug, even on another day, returns the same shelf unchanged.
  const again = finishCheck(one, "john-3-16", "2026-10-25");
  assert.equal(again, one);
  assert.equal(again[0].finishedOn, "2026-10-20", "the first day stays");
  // Another check stands next to it, in finishing order, with no gap for the days between.
  const two = finishCheck(one, "psalm-46-10", "2026-10-27");
  assert.deepEqual(two.map((e) => e.slug), ["john-3-16", "psalm-46-10"]);
  assert.equal(two.length, 2);
});

test("finishCheck refuses what could not be a slug or a date", () => {
  const shelf: ShelfEntry[] = [{ slug: "a", finishedOn: "2026-10-01" }];
  assert.equal(finishCheck(shelf, "Not A Slug", "2026-10-20"), shelf);
  assert.equal(finishCheck(shelf, "", "2026-10-20"), shelf);
  assert.equal(finishCheck(shelf, "b", "2026-13-40"), shelf);
  assert.equal(finishCheck(shelf, "b", "today"), shelf);
});

test("shelfSummary counts the shelf and the AI-unreviewed checks on it, looked up by slug and never stored", () => {
  const checks = [check("john-3-16", "ai-unreviewed"), check("psalm-46-10", "approved"), check("romans-8-28", "approved")];
  const shelf: ShelfEntry[] = [
    { slug: "psalm-46-10", finishedOn: "2026-10-18" },
    { slug: "john-3-16", finishedOn: "2026-10-20" },
  ];
  assert.deepEqual(shelfSummary(shelf, checks), { count: 2, ai: 1 });
  assert.deepEqual(shelfSummary([], checks), { count: 0, ai: 0 });
  // A check that is no longer published still stands on the shelf; it is not counted as AI-written.
  assert.deepEqual(shelfSummary([{ slug: "taken-down", finishedOn: "2026-10-01" }], checks), { count: 1, ai: 0 });
  // The entries hold only the slug and the day.
  assert.deepEqual(Object.keys(shelf[1]).sort(), ["finishedOn", "slug"]);
});

test("spineHeight is stable for a slug, between 128 and 160, in steps of 8", () => {
  for (const slug of ["john-3-16", "psalm-46-10", "1-corinthians-10-13", "a", "matthew-18-20", "revelation-3-20"]) {
    const h = spineHeight(slug);
    assert.equal(h, spineHeight(slug), "stable");
    assert.ok(h >= 128 && h <= 160, `${slug}: ${h} in range`);
    assert.equal(h % 8, 0, `${slug}: ${h} in steps of 8`);
    const mini = miniSpineHeight(slug);
    assert.ok(mini >= 24 && mini <= 40, `${slug}: mini ${mini} between 24 and 40`);
  }
  // The same few heights do not cover every slug.
  const seen = new Set(Array.from({ length: 40 }, (_, i) => spineHeight(`check-${i}`)));
  assert.ok(seen.size > 1);
});

test("countLabel says it plainly and never scolds", () => {
  assert.equal(countLabel(0), "Nothing on it yet");
  assert.equal(countLabel(1), "1 context check read");
  assert.equal(countLabel(2), "2 context checks read");
  assert.equal(countLabel(9), "9 context checks read");
  assert.equal(countLabel(12), "12 context checks read");
});

// ---- Plan 07: finishing a story (UI-SPEC A7, 12, E10) ---------------------------------------------------------

test("shelfHeading: 'Added to your shelf' only after a saved first finish, 'On your shelf' when it was there, nothing when the write failed", () => {
  assert.equal(shelfHeading(false, true), "Added to your shelf");
  assert.equal(shelfHeading(true, true), "On your shelf");
  // Already on the shelf: nothing needed saving, so the true sentence still holds.
  assert.equal(shelfHeading(true, false), "On your shelf");
  // Not there before and the write failed: no heading at all (T-01.1-25).
  assert.equal(shelfHeading(false, false), null);
});

/** A storage that keeps what it is given, and one that refuses every write (the browser's full or blocked storage). */
const working = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const failing = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };

test("finishing through the real save path: one entry with today's date, again adds nothing, a failing storage says not saved", () => {
  const storage = working();
  const start = freshPlatform();
  // The same step the story takes: the new shelf goes into the state and the state is saved.
  const first = { ...start, shelf: finishCheck(start.shelf, "john-3-16", "2026-10-20") };
  assert.equal(savePlatform(storage, first), true);
  assert.deepEqual(JSON.parse(storage.data.get(V3_KEY)!).shelf, [{ slug: "john-3-16", finishedOn: "2026-10-20" }]);
  assert.equal(shelfHeading(false, true), "Added to your shelf");

  // Finishing it again: the shelf comes back unchanged, so the story does not even write.
  const again = finishCheck(first.shelf, "john-3-16", "2026-10-21");
  assert.equal(again, first.shelf);
  assert.equal(first.shelf.some((e) => e.slug === "john-3-16"), true);
  assert.equal(shelfHeading(true, true), "On your shelf");

  // A storage that cannot write: savePlatform says false, the state in memory is not replaced, no heading.
  const kept = start;
  const attempt = { ...start, shelf: finishCheck(start.shelf, "psalm-46-10", "2026-10-20") };
  const saved = savePlatform(failing, attempt);
  assert.equal(saved, false);
  assert.deepEqual(kept.shelf, [], "the shelf the reader had is unchanged");
  assert.equal(shelfHeading(false, saved), null);
  // Blocked storage (a migration that could not be saved) refuses too.
  assert.equal(savePlatform(storage, attempt, true), false);
});

test("slugReference reads a verse out of a slug, and monthDay says the day in English", () => {
  assert.equal(slugReference("john-3-16"), "John 3:16");
  assert.equal(slugReference("1-corinthians-10-13"), "1 Corinthians 10:13");
  assert.equal(slugReference("psalm-46-10"), "Psalm 46:10");
  assert.equal(slugReference("john-8-31-32"), "John 8:31-32");
  assert.equal(slugReference("not-a-verse"), "Context check");
  assert.equal(monthDay("2026-10-19"), "October 19");
  assert.equal(monthDay("2026-03-04"), "March 4");
});

test("shareText: an approved check shares as before, an AI-unreviewed one carries its label in the same words (D-06)", () => {
  const approved = { slug: "psalm-46-10", review: "approved", hook: "You know the verse. But did you know it was a battle cry?" } as AppContextCheck;
  const written = { slug: "john-3-16", review: "ai-unreviewed", hook: "You know the verse. But did you know it was said at night?" } as AppContextCheck;
  assert.equal(shareText(approved), `${approved.hook} ${checkUrl(approved)}`, "unchanged for an approved check");
  assert.equal(shareText(written), `${written.hook} Written by an AI model. Not checked by a person. ${checkUrl(written)}`);
  assert.ok(shareText(written).includes(aiUnreviewedCardLabel), "the words are the card's");
  assert.ok(!shareText(approved).includes("AI model"));
});
