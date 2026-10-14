// Context checks in the app: the same approved files the website builds from
// (site/content/context-checks), shown as a short story to swipe through. The website's
// build validates every file (site/src/lib/content.ts); tests/context.test.ts checks that
// every approved file also reads cleanly here.
import { dateNumber } from "../storage.ts";

export interface CheckRef { book: string; chapter: number; start: number; end: number }
export interface CheckVoice { id?: string; name: string; about: string; words: string; source: { title: string; url: string } }
export interface AppContextCheck {
  slug: string;
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
/** Shown with every check, as on the website. */
export const madeHow =
  "Written with the help of an AI model. Scripture quotations are checked against the World English Bible. Approved by HisFullGlory. Not reviewed by a theological reader.";

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Reads one file as the app needs it; anything that is not approved or not whole is left out. */
export function toAppCheck(raw: unknown): AppContextCheck | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || r.review !== "approved" || !text(r.slug) || !/^[a-z0-9-]+$/.test(r.slug)) return null;
  const v = r.verse as CheckRef | undefined;
  if (!v || !text(v.book) || ![v.chapter, v.start, v.end].every(Number.isInteger)) return null;
  if (![r.hook, r.story, r.moment, r.readings, r.point].every(text)) return null;
  if (!["scripture", "history", "reading"].includes(r.storyStatus as string)) return null;
  return {
    slug: r.slug,
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

/** The approved checks in a fixed order, so every reader gets the same one on the same day. */
export function approvedChecks(files: unknown[]): AppContextCheck[] {
  return files.map(toAppCheck).filter((c): c is AppContextCheck => !!c).sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Today's check: the list in turn, one a day, starting again at the end. */
export function checkOfTheDay(checks: AppContextCheck[], date: string): AppContextCheck | undefined {
  if (!checks.length) return undefined;
  const n = dateNumber(date);
  return checks[((n % checks.length) + checks.length) % checks.length];
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
