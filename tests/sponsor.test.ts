import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { config, sponsorFor, type Sponsor, type SponsorPlace } from "../src/config.ts";
import { sponsorFor as siteSponsorFor } from "../site/src/lib/sponsor.ts";

// The sponsor slot (UI-SPEC 13, founder decision D-13 of 2026-10-19): built for later, empty at launch.
const places: SponsorPlace[] = ["today-end", "story-end", "site-home-end", "site-context-check-end", "pray", "community"];
const fixture: Sponsor = {
  name: "Fixture Sponsor",
  line: "A line a sponsor would write.",
  url: "https://sponsor.example/path",
  until: "2026-12-31",
  places: ["today-end"],
};

test("no sponsor: sponsorFor gives nothing at any of the six candidate places", () => {
  assert.equal(places.length, 6);
  for (const place of places) assert.equal(sponsorFor(place, null, "2026-10-20"), null, place);
});

test("the app's slot is empty at launch (null), and a sponsor, once set, is well formed", () => {
  const sponsor = config.sponsor;
  if (sponsor === null) return;
  assert.ok(sponsor.name.length > 0 && sponsor.name.length <= 40, "name at most 40 characters");
  assert.ok(sponsor.line.length > 0 && sponsor.line.length <= 90, "line at most 90 characters");
  assert.ok(sponsor.url.startsWith("https://"));
  assert.ok(!new URL(sponsor.url).search, "no query string, so no tracking parameters");
  assert.match(sponsor.until, /^\d{4}-\d{2}-\d{2}$/);
  for (const place of sponsor.places) assert.ok(places.includes(place), place);
});

test("a sponsor listing only today-end shows there and nowhere else", () => {
  assert.equal(sponsorFor("today-end", fixture, "2026-10-20"), fixture);
  for (const place of places.filter((p) => p !== "today-end")) assert.equal(sponsorFor(place, fixture, "2026-10-20"), null, place);
});

test("a sponsor shows on its last day and not after it", () => {
  assert.equal(sponsorFor("today-end", fixture, "2026-12-31"), fixture);
  assert.equal(sponsorFor("today-end", fixture, "2027-01-01"), null);
});

test("an address that is not https is never shown", () => {
  assert.equal(sponsorFor("today-end", { ...fixture, url: "http://sponsor.example/" }, "2026-10-20"), null);
  assert.equal(sponsorFor("today-end", { ...fixture, url: "javascript:alert(1)" }, "2026-10-20"), null);
});

test("the app and the website use the same rule", () => {
  assert.equal(sponsorFor, siteSponsorFor);
});

test("SponsorRow keeps its promises in its source: nothing without a sponsor, no tracking when there is one", () => {
  const source = readFileSync("src/ui/SponsorRow.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(source.includes('rel="sponsored noopener"'));
  assert.ok(source.includes('target="_blank"'));
  assert.ok(source.includes("if (!shown) return null;"), "returns null when there is nothing to show");
  assert.ok(source.includes("Sponsors do not receive anything about you."));
  assert.doesNotMatch(source, /<img|<script|<iframe|track\(|document\.cookie|fetch\(/, "no image, script, cookie or analytics event");
  // The link is the address as configured: nothing is appended to it.
  assert.ok(source.includes("href={shown.url}"));
  assert.doesNotMatch(source, /utm_|\?\w+=|URLSearchParams|\.search/);
});
