// Context checks in the app: the same published files the website builds from
// (site/content/context-checks), shown as a short story to swipe through. The website's
// build validates every file (site/src/lib/content.ts); tests/context.test.ts checks that
// every published file also reads cleanly here.
//
// Published means what the site publishes: `approved`, or `ai-unreviewed` (founder decision D-06,
// 2026-10-19: "Ja, elke dag de nieuwste"). Drafts never reach the app. The words that say how a
// check was made come from the site's own dependency-free module, so the label is the same
// sentence on the site and in the app. The .ts extension lets Node's test runner and
// scripts/browser-check.mjs load this file directly, as src/config.ts does for legal.ts.
import {
  aiUnreviewedCardLabel,
  aiUnreviewedLabel,
  aiUnreviewedNote,
  editorialNote,
  newestFirst,
  publicationDate,
  splitHook,
  spineHeight,
} from "../../site/src/lib/editorial.ts";
import { validDate } from "../storage.ts";
import type { ShelfEntry } from "../platform/models.ts";

export { aiUnreviewedCardLabel, aiUnreviewedLabel, aiUnreviewedNote, editorialNote, newestFirst, publicationDate, splitHook, spineHeight };

export interface CheckRef { book: string; chapter: number; start: number; end: number }
export interface CheckVoice { id?: string; name: string; about: string; words: string; source: { title: string; url: string } }
export interface AppContextCheck {
  slug: string;
  /** "approved" by the founder, or "ai-unreviewed": written by an AI model, no person has checked it. */
  review: "approved" | "ai-unreviewed";
  /** The day it was written (YYYY-MM-DD). */
  written: string;
  /** The day the founder approved it; only an approved check has one. */
  approved?: string;
  drafted: "ai" | "human";
  /** The AI model that wrote an AI-unreviewed check. */
  model?: string;
  verse: CheckRef;
  hook: string;
  story: string;
  storyStatus: "scripture" | "history" | "reading";
  moment: string;
  readings: string;
  argued?: string;
  point: string;
  voices: CheckVoice[];
  sources: { title: string; url: string }[];
}

export const siteUrl = "https://hisfullglory.com";
export const storyStatuses: Record<AppContextCheck["storyStatus"], string> = {
  scripture: "Drawn from the Bible itself.",
  history: "Background from outside the Bible.",
  reading: "One reading of the evidence. Scholars differ.",
};

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/**
 * Reads one file as the app needs it. Anything that is a draft, or not whole, is left out: a file
 * without a hook, an approved file without its approval date, an AI-unreviewed file that does not
 * say drafted "ai" or name the model.
 */
export function toAppCheck(raw: unknown): AppContextCheck | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || (r.review !== "approved" && r.review !== "ai-unreviewed") || !text(r.slug) || !/^[a-z0-9-]+$/.test(r.slug)) return null;
  const review = r.review;
  if (r.drafted !== "ai" && r.drafted !== "human") return null;
  if (!text(r.written) || !validDate(r.written)) return null;
  if (review === "approved" && !(text(r.approved) && validDate(r.approved))) return null;
  if (review === "ai-unreviewed" && (r.drafted !== "ai" || !text(r.model))) return null;
  const v = r.verse as CheckRef | undefined;
  if (!v || !text(v.book) || ![v.chapter, v.start, v.end].every(Number.isInteger)) return null;
  if (![r.hook, r.story, r.moment, r.readings, r.point].every(text)) return null;
  if (!["scripture", "history", "reading"].includes(r.storyStatus as string)) return null;
  return {
    slug: r.slug,
    review,
    written: r.written,
    ...(review === "approved" ? { approved: r.approved as string } : {}),
    drafted: r.drafted,
    ...(review === "ai-unreviewed" ? { model: r.model as string } : {}),
    verse: { book: v.book, chapter: v.chapter, start: v.start, end: v.end },
    hook: r.hook as string,
    story: r.story as string,
    storyStatus: r.storyStatus as AppContextCheck["storyStatus"],
    moment: r.moment as string,
    readings: r.readings as string,
    ...(text(r.argued) ? { argued: r.argued } : {}),
    point: r.point as string,
    voices: Array.isArray(r.voices) ? (r.voices as CheckVoice[]) : [],
    sources: Array.isArray(r.sources) ? (r.sources as AppContextCheck["sources"]) : [],
  };
}

/** The published checks, newest first: later publication date, then later written date, then slug A to Z. */
export function publishedChecks(files: unknown[]): AppContextCheck[] {
  return files.map(toAppCheck).filter((c): c is AppContextCheck => !!c).sort(newestFirst);
}

export type TodayState = "unread" | "finished-today" | "all-finished";
export interface TodaysCheck {
  check: AppContextCheck;
  state: TodayState;
  /** The day the reader finished it; set for "finished-today" and "all-finished". */
  finishedOn?: string;
}

/**
 * Today's context check (UI-SPEC A1, D-05, D-06): the newest published check that the reader has not
 * finished on an earlier day. One finished today stays Today's, in its finished state. When every
 * check was finished on an earlier day, the newest one is shown in its finished state. `checks` must
 * be in newest-first order (publishedChecks). Undefined when nothing is published.
 */
export function todaysCheck(checks: AppContextCheck[], shelf: ShelfEntry[], date: string): TodaysCheck | undefined {
  if (!checks.length) return undefined;
  const finished = (check: AppContextCheck) => shelf.find((entry) => entry.slug === check.slug)?.finishedOn;
  for (const check of checks) {
    const on = finished(check);
    if (on === undefined) return { check, state: "unread" };
    if (on === date) return { check, state: "finished-today", finishedOn: on };
    // Finished on an earlier day: skipped, the next newest is looked at.
  }
  const newest = checks[0];
  return { check: newest, state: "all-finished", finishedOn: finished(newest) };
}

/** "1 Corinthians 10:13", "Psalm 46:10", "John 8:31-32". */
export function refLabel(ref: CheckRef): string {
  const book = ref.book === "psalms" ? "Psalm" : ref.book.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  return `${book} ${ref.chapter}:${ref.start}${ref.end > ref.start ? `-${ref.end}` : ""}`;
}

export const checkUrl = (check: AppContextCheck) => `${siteUrl}/context-checks/${check.slug}`;

/** Splits text into its own words and the quoted voices its [[id]] markers stand for. */
export function withVoices(value: string, voices: CheckVoice[]): (string | CheckVoice)[] {
  return value.split(/\[\[([a-z0-9-]+)\]\]/).map((piece, index) => {
    if (index % 2 === 0) return piece;
    return voices.find((voice) => voice.id === piece) ?? "";
  });
}

export const paragraphs = (value: string) => value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
