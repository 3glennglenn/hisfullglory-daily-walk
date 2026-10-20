// The reader's shelf (UI-SPEC 12, D-07): every context check read to the last screen, kept on this device.
// The shelf only grows. Nothing here removes an entry, marks a gap or counts days; an entry holds the check's
// slug and the local day it was finished, nothing else. Whether a check was written by an AI model is read
// from the bundled check by its slug when the shelf is drawn, never stored.
import { validDate } from "../storage.ts";
import { spineHeight } from "../../site/src/lib/editorial.ts";
import type { ShelfEntry } from "../platform/models.ts";
import type { AppContextCheck } from "./checks.ts";

export { spineHeight };

/** Adds a finished check once. A second call for the same slug returns the shelf it was given, unchanged. */
export function finishCheck(shelf: ShelfEntry[], slug: string, date: string): ShelfEntry[] {
  if (!/^[a-z0-9-]+$/.test(slug) || !validDate(date)) return shelf;
  if (shelf.some((entry) => entry.slug === slug)) return shelf;
  return [...shelf, { slug, finishedOn: date }];
}

/**
 * The heading above the shelf moment at the end of a story (UI-SPEC A7, E10). "Added to your shelf" is said only
 * after the entry was really written; "On your shelf" when the check was there before; nothing when it was not
 * there and the write failed, so the screen never claims what the device did not keep.
 */
export function shelfHeading(alreadyThere: boolean, saved: boolean): "Added to your shelf" | "On your shelf" | null {
  if (alreadyThere) return "On your shelf";
  return saved ? "Added to your shelf" : null;
}

/** How many checks stand on the shelf, and how many of them were written by an AI model that no person checked. */
export function shelfSummary(shelf: ShelfEntry[], checks: AppContextCheck[]): { count: number; ai: number } {
  const unchecked = new Set(checks.filter((check) => check.review === "ai-unreviewed").map((check) => check.slug));
  return { count: shelf.length, ai: shelf.filter((entry) => unchecked.has(entry.slug)).length };
}

/** The height of a mini spine (UI-SPEC A9): the full spine's 128 to 160px, mapped onto 24 to 40px. */
export const miniSpineHeight = (slug: string): number => 24 + (spineHeight(slug) - 128) / 2;

/** "Nothing on it yet", "1 context check read", "9 context checks read". */
export const countLabel = (count: number): string =>
  count === 0 ? "Nothing on it yet" : `${count} context ${count === 1 ? "check" : "checks"} read`;

/** "October 19": a local day written the way the shelf says when a check was read, in English. */
export function monthDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/**
 * The reference a spine shows for a check that is no longer published (UI-SPEC 12): the shelf kept only its slug,
 * and a slug is the verse ("1-corinthians-10-13", "psalm-46-10", "john-8-31-32"). A slug that does not read like
 * that gives "Context check", so a spine is never blank.
 */
export function slugReference(slug: string): string {
  const match = /^(.+?)-(\d+)-(\d+)(?:-(\d+))?$/.exec(slug);
  if (!match) return "Context check";
  const book = match[1].split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  return `${book} ${match[2]}:${match[3]}${match[4] ? `-${match[4]}` : ""}`;
}
