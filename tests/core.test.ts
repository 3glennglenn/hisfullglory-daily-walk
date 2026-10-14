import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankState,
  completeDate,
  localDate,
  rhythm,
  sanitizeState,
  streak,
  validDate,
} from "../src/storage.ts";

test("the rhythm forgives one missed day and welcomes the reader back after more", () => {
  const days = ["2026-10-08", "2026-10-09", "2026-10-11", "2026-10-12"];
  // One missed day (the 10th) does not break the run.
  assert.deepEqual(rhythm(days, "2026-10-12"), { days: 4, current: true, missedYesterday: false });
  assert.deepEqual(rhythm(days, "2026-10-13"), { days: 4, current: true, missedYesterday: false });
  // Missing yesterday keeps the run, and the app says so gently.
  assert.deepEqual(rhythm(days, "2026-10-14"), { days: 4, current: true, missedYesterday: true });
  // Two missed days end it: no zero, a welcome back instead.
  assert.equal(rhythm(days, "2026-10-15").current, false);
  // Two missed days in the middle split the run.
  assert.equal(rhythm(["2026-10-01", "2026-10-04", "2026-10-05"], "2026-10-05").days, 2);
  assert.deepEqual(rhythm([], "2026-10-05"), { days: 0, current: false, missedYesterday: false });
  // Future dates and duplicates are ignored, across a year boundary too.
  assert.equal(rhythm(["2025-12-30", "2026-01-01", "2026-01-01", "2026-02-01"], "2026-01-01").days, 2);
});

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

test("listening reads the reference and then every verse in this edition, in order", async () => {
  const { speechParts } = await import("../src/bible/speech.ts");
  const parts = speechParts("Psalm 23", { number: 23, verses: [
    { number: 1, text: "Yahweh is my shepherd:" },
    { number: 2, text: "", omitted: true },
    { number: 3, text: "He restores my soul." },
  ] });
  assert.deepEqual(parts, [
    { text: "Psalm 23." },
    { verse: 1, text: "Yahweh is my shepherd:" },
    { verse: 3, text: "He restores my soul." },
  ]);
});

test("push setup: the public key decodes to a P-256 point and reminder times stay in the day", async () => {
  const { keyBytes, suggestedReminderTime, validReminderTime } = await import("../src/platform/pushKeys.ts");
  const { config } = await import("../src/config.ts");
  const key = keyBytes(config.pushPublicKey);
  assert.equal(key.length, 65);
  assert.equal(key[0], 4);
  assert.equal(suggestedReminderTime("morning"), "07:30");
  assert.ok(validReminderTime("05:00") && validReminderTime("22:00") && validReminderTime("12:30"));
  assert.ok(!validReminderTime("04:59") && !validReminderTime("22:01") && !validReminderTime("7:30") && !validReminderTime("25:00"));
});
