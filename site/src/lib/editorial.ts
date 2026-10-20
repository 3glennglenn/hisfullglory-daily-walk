// The words a page uses to say how it was made and how far it has been checked, and the
// small rules about which context check is the newest. This file has no Node imports on
// purpose: the site (site/src/lib/content.ts re-exports it) and the app (src/context/checks.ts)
// both import it, so the label is the same sentence on every surface (phase 01.1, D-06).
// Change a word here and it changes everywhere; the tests pin the sentences.

export type Review = "draft" | "approved" | "ai-unreviewed";

/**
 * The label at the top of an AI-unreviewed context check, the shorter one on its cards, and
 * the closing note. Together they say that an AI model wrote the context, that the Bible text
 * is not AI-written (it is the World English Bible), and that the context can contain mistakes.
 * They say the AI wrote the context, never the Bible: the founder's wording of 2026-10-20
 * (D-06 amended). "Not checked by a person" is gone by that decision; the earlier wording was
 * settled with the UX copy review of 2026-10-16.
 */
export const aiUnreviewedLabel = "Context written by AI, from the sources below. The Bible text is the World English Bible.";
export const aiUnreviewedCardLabel = "Context written by AI, from named sources.";
export const aiUnreviewedNote =
  "This context was written by an AI model to help you see the verse in its setting. The Bible text is the World English Bible. Before publishing, an automatic check made sure every source below opens and every quotation matches its source. It can contain mistakes. If a source says otherwise, tell us.";

/** How an editorial page says it was made and how far it has been checked. */
export function editorialNote(review: Review, drafted: "ai" | "human"): string {
  if (review === "ai-unreviewed") return aiUnreviewedNote;
  const made =
    drafted === "ai"
      ? "Written with the help of an AI model. Scripture quotations are checked against the World English Bible."
      : "Written by HisFullGlory. Scripture quotations are checked against the World English Bible.";
  const status =
    review === "approved"
      ? "Approved by HisFullGlory. Not reviewed by a theological reader."
      : "Not approved yet.";
  return `${made} ${status}`;
}

/** What a rule about "the newest context check" needs to know about a check. */
export interface Dated {
  slug: string;
  review: Review;
  /** The day the check was written (YYYY-MM-DD). */
  written: string;
  /** The day the founder approved it; only an approved check has one. */
  approved?: string;
}

/**
 * The day a check counts as published (founder decision D-06, UI-SPEC A1): the approved date
 * for an approved check, the written date for an AI-unreviewed one.
 */
export const publicationDate = (item: Dated): string =>
  item.review === "approved" && item.approved ? item.approved : item.written;

/**
 * Orders checks newest first: later publication date, then later written date, then slug
 * A to Z. Use it as the argument of `Array.prototype.sort`.
 */
export const newestFirst = (a: Dated, b: Dated): number =>
  publicationDate(b).localeCompare(publicationDate(a)) ||
  b.written.localeCompare(a.written) ||
  a.slug.localeCompare(b.slug);

const hookMarker = ". But did you know";

/**
 * Splits a context check's hook where the format puts its turn: "You know X. But did you know
 * Y?" gives "You know X." (with its full stop) and "But did you know Y?". A hook without that
 * marker stays whole and has no second part.
 */
export function splitHook(hook: string): { first: string; second?: string } {
  const at = hook.indexOf(hookMarker);
  if (at < 0) return { first: hook };
  return { first: hook.slice(0, at + 1), second: hook.slice(at + 2) };
}

/**
 * How tall a context check's spine stands on a shelf (UI-SPEC section 2): 128 to 160px in
 * steps of 8, from a stable hash of the slug, so the same check is the same height on the
 * app's shelf and on the site's bookcase, and always has been.
 */
export function spineHeight(slug: string): number {
  let hash = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return 128 + (hash % 5) * 8;
}
