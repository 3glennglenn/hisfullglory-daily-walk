import test from "node:test";
import assert from "node:assert/strict";
import { countLabel, finishCheck, miniSpineHeight, shelfSummary, spineHeight } from "../src/context/shelf.ts";
import type { ShelfEntry } from "../src/platform/models.ts";
import type { AppContextCheck } from "../src/context/checks.ts";

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
