// The site reads Scripture and study notes from the app at build time
// (docs/WEBSITE_PLAN.md, section 3). Nothing here writes, generates or rewords a note.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  knowledgeFor,
  knowledgeRecords,
  parseStudyFile,
  type KnowledgeRecord,
} from "../../../src/bible/knowledge.ts";
import type { BibleBook, BibleData } from "../../../src/bible/provider.ts";
import { aiFor, loadAiExplanations, type AiExplanation } from "./ai.ts";

export type { AiExplanation, BibleBook, BibleData, KnowledgeRecord };
// Song of Songs speaker labels are shown as in the app's Reader.
export { hasSpeakers, speakerNote, speakerParts } from "../../../src/bible/provider.ts";

// npm scripts and tests run with site/ as the working directory.
const appRoot = resolve(process.cwd(), "..");
const biblePath = join(appRoot, "public", "bible", "web.json");
const studyDir = join(appRoot, "public", "study");

let cache:
  | { bible: BibleData; notes: KnowledgeRecord[]; ai: AiExplanation[] }
  | undefined;

export function library() {
  if (cache) return cache;
  if (!existsSync(biblePath))
    throw new Error(`WEB text not found at ${biblePath}. Run from site/.`);
  const bible = JSON.parse(readFileSync(biblePath, "utf8")) as BibleData;
  if (bible.books.length !== 66) throw new Error("Incomplete Bible library.");
  // An invalid study file stops the build, so the site never publishes partial or
  // misattributed notes.
  const fromFiles = readdirSync(studyDir)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) =>
      parseStudyFile(
        JSON.parse(readFileSync(join(studyDir, file), "utf8")),
        file.replace(/\.json$/, ""),
        bible,
      ),
    );
  cache = {
    bible,
    notes: [...knowledgeRecords, ...fromFiles],
    ai: loadAiExplanations(bible),
  };
  return cache;
}

/** The AI explanation for a chapter: its own, else the book's. Never mixed with notes. */
export const aiExplanation = (book: string, chapter: number) =>
  aiFor(library().ai, book, chapter);

/** The AI explanation of a book as a whole, if one has been written. */
export const bookAiExplanation = (book: string) =>
  library().ai.find((entry) => entry.book === book && entry.scope === "book");

export const oldTestamentBooks = 39;
export const testamentOf = (index: number) =>
  index < oldTestamentBooks ? "Old Testament" : "New Testament";

export const chapterTitle = (book: BibleBook, chapter: number) =>
  `${book.slug === "psalms" ? "Psalm" : book.name} ${chapter}`;

/** The book's own note, if one has been written. */
export const bookNote = (book: string) =>
  library().notes.find((note) => note.book === book && note.scope === "book");

/** The most specific note for a whole chapter: its chapter note, else the book note. */
export const chapterNote = (book: string, chapter: number) =>
  knowledgeFor(book, chapter, undefined, library().notes);

/** Turns a Scripture path from a note's basis into a label and a link on this site. */
export function basisLink(path: string) {
  const [, , slug, chapter, verse] = path.split("/");
  const book = library().bible.books.find((b) => b.slug === slug);
  if (!book) throw new Error(`Unknown basis path ${path}`);
  return {
    label: `${book.name} ${chapter}${verse ? `:${verse}` : ""}`,
    href: `/bible/${slug}/${chapter}${verse ? `#v${verse}` : ""}`,
  };
}
