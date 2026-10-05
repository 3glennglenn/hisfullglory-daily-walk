import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankState,
  completeDate,
  localDate,
  sanitizeState,
  streak,
  validDate,
} from "../src/storage.ts";

test("local date uses the device calendar, including midnight", () => {
  assert.equal(localDate(new Date(2026, 9, 5, 0, 1)), "2026-10-05");
  assert.equal(localDate(new Date(2026, 9, 5, 23, 59)), "2026-10-05");
});
test("completion is idempotent; streaks continue and reset across year boundaries", () => {
  const first = completeDate(blankState(), "2025-12-31");
  assert.equal(completeDate(first, "2025-12-31"), first);
  const second = completeDate(first, "2026-01-01");
  assert.equal(streak(second.completedDates, "2026-01-01"), 2);
  assert.equal(streak(second.completedDates, "2026-01-02"), 2);
  assert.equal(streak(second.completedDates, "2026-01-03"), 0);
  assert.equal(
    streak(completeDate(second, "2026-01-03").completedDates, "2026-01-03"),
    1,
  );
});
test("calendar-day math survives daylight saving transitions", () => {
  assert.equal(
    streak(["2026-03-28", "2026-03-29", "2026-03-30"], "2026-03-30"),
    3,
  );
});
test("malformed, outdated and corrupted storage recover safely", () => {
  for (const value of [null, "oops", {}, { version: 0 }, { version: 2 }])
    assert.deepEqual(sanitizeState(value), blankState());
  const state = sanitizeState({
    version: 1,
    activePlan: "bad",
    journals: { "2026-02-30": "bad", "2026-10-05": "keep", "2026-10-06": 5 },
    completedDates: ["2026-10-05", "2026-10-05", "invalid", "2026-02-30"],
    progress: { "peace-in-god": [0, 0, 4, 5, -1, "2"] },
  });
  assert.equal(state.activePlan, null);
  assert.deepEqual(state.journals, { "2026-10-05": "keep" });
  assert.deepEqual(state.completedDates, ["2026-10-05"]);
  assert.deepEqual(state.progress["peace-in-god"], [0, 4]);
});
test("real calendar dates only", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-02-29"), false);
});
