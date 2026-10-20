import assert from "node:assert/strict";
import test from "node:test";
import { MAX_STARS, skyLine, starPositions } from "../src/ui/stars.ts";

// The sky of Lamplight (plan 16, direction B): one star per walked day, scattered by the dates, never a grid.
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);
const days = (count: number, from = 0) => Array.from({ length: count }, (_, i) => day(from + i));

test("the line under the sky says it in words, with no zero to beat and no run to break", () => {
  assert.equal(skyLine(0), "Today's walk lights your first star.");
  assert.equal(skyLine(1), "1 day walked. It stays.");
  assert.equal(skyLine(12), "12 days walked. Each one stays.");
  for (const n of [0, 1, 2, 19, 365]) assert.ok(!/[—!]/.test(skyLine(n)), skyLine(n));
});

test("every walked day is a star; today's place is an empty ring until today's walk is done", () => {
  const walked = days(12);
  const done = starPositions(walked, day(11));
  assert.equal(done.length, 12);
  assert.equal(done.filter((s) => s.isToday).length, 1);
  assert.equal(done.find((s) => s.isToday)?.walked, true);
  const waiting = starPositions(walked, day(12));
  assert.equal(waiting.length, 13, "the ring is one more place");
  const ring = waiting.find((s) => s.isToday);
  assert.equal(ring?.walked, false);
  assert.equal(ring?.date, day(12));
  assert.equal(starPositions([], day(0)).length, 1, "0 days: only the ring");
  assert.equal(starPositions([], day(0))[0].walked, false);
});

test("at most 40 stars are drawn, the newest ones, and the places stay inside the sky", () => {
  const walked = days(200);
  const stars = starPositions(walked, day(199));
  assert.equal(stars.length, MAX_STARS);
  assert.equal(stars[0].date, day(160));
  assert.equal(stars.at(-1)?.date, day(199));
  for (const s of stars) {
    assert.ok(s.x >= 4 && s.x <= 96, `x ${s.x}`);
    assert.ok(s.y >= 8 && s.y <= 92, `y ${s.y}`);
    assert.ok(s.size >= 2 && s.size <= 4, `size ${s.size}`);
    assert.ok(s.opacity >= 0.55 && s.opacity <= 0.95, `opacity ${s.opacity}`);
  }
});

test("the places are deterministic and a star never moves when more days are walked", () => {
  const a = starPositions(days(30), day(29));
  const b = starPositions(days(30), day(29));
  assert.deepEqual(a, b);
  const later = starPositions(days(31), day(30));
  for (const star of a) {
    const same = later.find((s) => s.date === star.date);
    assert.ok(same, star.date);
    assert.equal(same.x, star.x, `${star.date} x`);
    assert.equal(same.y, star.y, `${star.date} y`);
  }
  // The order of the dates given does not matter, and a date given twice is one star.
  assert.deepEqual(starPositions([...days(30)].reverse().concat(day(3)), day(29)), a);
});

test("the stars are scattered: not a grid, no two of the same row or column, and a gap shows no hole", () => {
  const stars = starPositions(days(40), day(39));
  const xs = new Set(stars.map((s) => Math.round(s.x)));
  const ys = new Set(stars.map((s) => Math.round(s.y)));
  assert.ok(xs.size > 25, `${xs.size} distinct columns`);
  assert.ok(ys.size > 20, `${ys.size} distinct rows`);
  // A skipped day takes no place: five days walked of the last ten draw five stars.
  const gappy = starPositions([day(0), day(2), day(4), day(6), day(9)], day(9));
  assert.equal(gappy.length, 5);
});
