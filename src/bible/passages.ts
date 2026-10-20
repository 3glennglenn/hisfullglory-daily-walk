// Passage helpers for the reader and the library: book titles, testaments, the chapter before and after,
// and human references for stored addresses. Pure functions, no browser APIs, so Node's test runner loads
// this file directly (tests/passages.test.ts).
import type { BibleData } from "./provider.ts";

type BookLike = { id: string; slug: string; name: string };

const gospels = new Set(["matthew", "mark", "luke", "john"]);
// The title a book carries over its text in a printed Bible. Kept neutral: no claim about who wrote it.
const letters: Record<string, string> = {
  romans: "The Letter to the Romans",
  "1-corinthians": "The First Letter to the Corinthians",
  "2-corinthians": "The Second Letter to the Corinthians",
  galatians: "The Letter to the Galatians",
  ephesians: "The Letter to the Ephesians",
  philippians: "The Letter to the Philippians",
  colossians: "The Letter to the Colossians",
  "1-thessalonians": "The First Letter to the Thessalonians",
  "2-thessalonians": "The Second Letter to the Thessalonians",
  "1-timothy": "The First Letter to Timothy",
  "2-timothy": "The Second Letter to Timothy",
  titus: "The Letter to Titus",
  philemon: "The Letter to Philemon",
  hebrews: "The Letter to the Hebrews",
  james: "The Letter of James",
  "1-peter": "The First Letter of Peter",
  "2-peter": "The Second Letter of Peter",
  "1-john": "The First Letter of John",
  "2-john": "The Second Letter of John",
  "3-john": "The Third Letter of John",
  jude: "The Letter of Jude",
};
const numbered: Record<string, string> = {
  "1-samuel": "The First Book of Samuel",
  "2-samuel": "The Second Book of Samuel",
  "1-kings": "The First Book of Kings",
  "2-kings": "The Second Book of Kings",
  "1-chronicles": "The First Book of Chronicles",
  "2-chronicles": "The Second Book of Chronicles",
};

/** The small title above a chapter's heading: "The Gospel of John", "The Book of Psalms". */
export function bookTitle(book: BookLike): string {
  if (gospels.has(book.slug)) return `The Gospel of ${book.name}`;
  if (book.slug === "acts") return "The Acts of the Apostles";
  if (book.slug === "revelation") return "The Revelation to John";
  if (book.slug === "song-of-solomon") return "The Song of Solomon";
  return letters[book.slug] ?? numbered[book.slug] ?? `The Book of ${book.name}`;
}

/** The first 39 books are the Old Testament, the last 27 the New. */
export const oldTestamentBooks = 39;
export const isOldTestament = (data: BibleData, slug: string) => {
  const at = data.books.findIndex((b) => b.slug === slug);
  return at >= 0 && at < oldTestamentBooks;
};

export interface ChapterLink {
  book: string;
  chapter: number;
  /** "John 2" */
  reference: string;
}
/**
 * The chapter before and after, crossing from one book to the next. Genesis 1 has no previous chapter and
 * Revelation 22 no next one; nothing else lacks either (UI-SPEC A3).
 */
export function adjacentChapters(data: BibleData, slug: string, chapter: number): { previous?: ChapterLink; next?: ChapterLink } {
  const at = data.books.findIndex((b) => b.slug === slug);
  if (at < 0) return {};
  const book = data.books[at];
  const link = (b: BibleData["books"][number], number: number): ChapterLink => ({ book: b.slug, chapter: number, reference: `${b.name} ${number}` });
  let previous: ChapterLink | undefined;
  let next: ChapterLink | undefined;
  if (chapter > 1) previous = link(book, chapter - 1);
  else if (at > 0) {
    const before = data.books[at - 1];
    previous = link(before, before.chapters.length);
  }
  if (chapter < book.chapters.length) next = link(book, chapter + 1);
  else if (at < data.books.length - 1) next = link(data.books[at + 1], 1);
  return { previous, next };
}

/** A slug turned into words when the Bible has not loaded yet: "1-john" is "1 John", "song-of-solomon" "Song of Solomon". */
export const slugWords = (slug: string) =>
  slug
    .split("-")
    .map((word, i) => (i > 0 && ["of", "the"].includes(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");

/**
 * "Romans 8:28" for /bible/romans/8/28 and "John 3" for /bible/john/3, with the book's own name when the Bible
 * is loaded. Returns the address itself for anything that is not a passage.
 */
export function referenceFromPath(data: BibleData | null | undefined, path: string): string {
  const m = /^\/bible\/([a-z0-9-]+)\/(\d+)(?:\/(\d+))?$/.exec(path);
  if (!m) return path;
  const name = data?.books.find((b) => b.slug === m[1])?.name ?? slugWords(m[1]);
  return `${name} ${m[2]}${m[3] ? `:${m[3]}` : ""}`;
}
