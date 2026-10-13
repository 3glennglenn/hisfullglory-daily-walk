// Topic pages and articles are editorial content in site/content/. A file goes online only
// when the founder has approved it: "review": "approved" (docs/WEBSITE_PLAN.md, section 6).
// Quotations are checked against the WEB text, as they are for study notes and AI
// explanations. An invalid file stops the build.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { launchTopics } from "../../../src/topics/graph.ts";
import { chapterTitle, library, type BibleData } from "./bible.ts";

export type Review = "draft" | "approved";
export interface PassageRef {
  book: string;
  chapter: number;
  start: number;
  end: number;
}
export interface TopicPassage extends PassageRef {
  reason: string;
}
interface Editorial {
  review: Review;
  /** Who wrote the first version. Shown on the page, so a reader knows. */
  drafted: "ai" | "human";
  written: string;
}
export interface TopicPage extends Editorial {
  id: string;
  label: string;
  intro: string;
  care?: string;
  passages: TopicPassage[];
}
export interface Article extends Editorial {
  slug: string;
  title: string;
  description: string;
  topic?: string;
  passage: PassageRef;
  sections: { heading: string; text: string }[];
  basis: PassageRef[];
  sources: { title: string; url: string }[];
}

type Raw = Record<string, unknown>;

function check(ok: unknown, where: string, what: string): asserts ok {
  if (!ok) throw new Error(`${where}: ${what}`);
}

function text(value: unknown, min: number, max: number, where: string): string {
  check(typeof value === "string", where, "must be text");
  check(value.length >= min && value.length <= max, where, `must be ${min} to ${max} characters, is ${value.length}`);
  // Copy rules that can be checked: no em dashes, and curly double quotes only.
  check(!value.includes("—"), where, "no em dashes");
  check(!value.includes('"'), where, "use curly quotes, and only for words from the WEB text");
  return value;
}

const quotations = (value: string) => [...value.matchAll(/“([^”]*)”/g)].map(([, words]) => words);

/** The WEB text of a range of verses. Throws when part of the range does not exist. */
export function passageText(raw: unknown, bible: BibleData, where: string): { ref: PassageRef; words: string } {
  const ref = raw as PassageRef;
  check(ref && typeof ref.book === "string", where, "needs a book");
  const chapter = bible.books
    .find((book) => book.slug === ref.book)
    ?.chapters.find((candidate) => candidate.number === ref.chapter);
  check(chapter, where, `unknown chapter ${ref.book} ${ref.chapter}`);
  check(Number.isInteger(ref.start) && Number.isInteger(ref.end) && ref.end >= ref.start, where, "start and end must be verse numbers in order");
  const verses = chapter.verses.filter(
    (verse) => verse.number >= ref.start && verse.number <= ref.end && !verse.omitted,
  );
  check(verses.length === ref.end - ref.start + 1, where, `verses ${ref.start} to ${ref.end} are not all in the WEB text`);
  return {
    ref: { book: ref.book, chapter: ref.chapter, start: ref.start, end: ref.end },
    words: verses.map((verse) => verse.text).join(" "),
  };
}

function editorial(raw: Raw, where: string): Editorial {
  check(raw.review === "draft" || raw.review === "approved", where, 'review must be "draft" or "approved"');
  check(raw.drafted === "ai" || raw.drafted === "human", where, 'drafted must be "ai" or "human"');
  const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  check(date(raw.written), where, "written must be a date");
  // An approved file records the day the founder approved it; a draft has no such date.
  check(date(raw.approved) === (raw.review === "approved"), where, "approved must be the date of approval, and only on an approved file");
  return { review: raw.review, drafted: raw.drafted, written: raw.written as string };
}

export function parseTopic(input: unknown, id: string, bible: BibleData): TopicPage {
  const raw = input as Raw;
  const where = `topic ${id}`;
  const topic = launchTopics.find((candidate) => candidate.id === id);
  check(topic && raw?.id === id, where, "the file name and id must be a launch topic");
  const intro = text(raw.intro, 120, 600, `${where} intro`);
  check(!quotations(intro).length, where, "keep quotations in the passage reasons");
  check(Array.isArray(raw.passages) && raw.passages.length >= 4 && raw.passages.length <= 7, where, "needs 4 to 7 passages");
  const seen = new Set<string>();
  const passages = raw.passages.map((entry: Raw, index: number) => {
    const at = `${where} passage ${index + 1}`;
    const { ref, words } = passageText(entry, bible, at);
    const key = `${ref.book} ${ref.chapter}:${ref.start}-${ref.end}`;
    check(!seen.has(key), at, "listed twice");
    seen.add(key);
    const reason = text(entry.reason, 40, 280, `${at} reason`);
    const quoted = quotations(reason);
    // The passage itself is the source of the reason, so the reason must quote it.
    check(quoted.length > 0, at, "the reason must quote the passage");
    for (const words_ of quoted) check(words.includes(words_), at, `“${words_}” is not in the WEB text of the passage`);
    return { ...ref, reason };
  });
  return {
    id,
    label: topic.label,
    ...editorial(raw, where),
    intro,
    ...(raw.care === undefined ? {} : { care: text(raw.care, 40, 300, `${where} care`) }),
    passages,
  };
}

export function parseArticle(input: unknown, slug: string, bible: BibleData): Article {
  const raw = input as Raw;
  const where = `article ${slug}`;
  check(/^[a-z0-9-]+$/.test(slug) && raw?.slug === slug, where, "the file name and slug must match");
  // The page title gets " | HisFullGlory" added and must stay within 60 characters.
  const title = text(raw.title, 15, 45, `${where} title`);
  const description = text(raw.description, 50, 160, `${where} description`);
  check(!quotations(title + description).length, where, "no quotations in the title or description");
  check(raw.topic === undefined || launchTopics.some((topic) => topic.id === raw.topic), where, "topic must be a launch topic");
  check(Array.isArray(raw.basis) && raw.basis.length > 0, where, "needs the passages it rests on");
  const basis = raw.basis.map((entry, index) => passageText(entry, bible, `${where} basis ${index + 1}`));
  check(Array.isArray(raw.sections) && raw.sections.length >= 3 && raw.sections.length <= 8, where, "needs 3 to 8 sections");
  const sections = raw.sections.map((entry: Raw, index: number) => {
    const at = `${where} section ${index + 1}`;
    const body = text(entry.text, 80, 2500, at);
    for (const words of quotations(body))
      check(basis.some((passage) => passage.words.includes(words)), at, `“${words}” is not in the WEB text of any basis passage`);
    return { heading: text(entry.heading, 3, 70, `${at} heading`), text: body };
  });
  check(Array.isArray(raw.sources) && raw.sources.length > 0, where, "needs at least one source");
  const sources = raw.sources.map((entry: Raw, index: number) => {
    const at = `${where} source ${index + 1}`;
    check(typeof entry.url === "string" && entry.url.startsWith("https://"), at, "needs an https link");
    return { title: text(entry.title, 3, 120, at), url: entry.url };
  });
  return {
    slug,
    ...editorial(raw, where),
    title,
    description,
    ...(raw.topic === undefined ? {} : { topic: raw.topic as string }),
    passage: passageText(raw.passage, bible, `${where} passage`).ref,
    sections,
    basis: basis.map((passage) => passage.ref),
    sources,
  };
}

/** A well-known verse put back into its surroundings. Everything rests on the text itself. */
export interface ContextCheck extends Editorial {
  slug: string;
  verse: PassageRef;
  /** One or two sentences that open the page, and the line a video can start with. */
  hook: string;
  /** The scene: who is speaking, to whom, where, and what was happening to them. */
  moment: string;
  around: string;
  /** How the verse has been read, by whom and when, set side by side without a winner. */
  readings: string;
  point: string;
  /** The story around the verse: what was going on, or what the verse went on to mean. */
  story: string;
  /** How firm the story is. Anything from outside the Bible has to name its sources. */
  storyStatus: keyof typeof storyStatuses;
  sources: { title: string; url: string }[];
  /** What named people said about the verse or its teaching, word for word, each with its source. */
  voices: { name: string; about: string; words: string; source: { title: string; url: string } }[];
  basis: PassageRef[];
}

/** The line a page shows under the story, so a reader knows what it rests on. */
export const storyStatuses = {
  scripture: "Drawn from the Bible itself.",
  history: "Background from outside the Bible. The sources are listed below.",
  reading: "One reading of the evidence. Scholars differ, and the sources are listed below.",
} as const;

/**
 * The parts that follow the story, with their headings, in the order a page shows them.
 * Each is told as part of one continuing story, in paragraphs, not as a list of facts.
 */
export const checkParts = [
  ["moment", "The moment", 200, 1800],
  ["around", "What stands around it", 100, 1400],
  ["readings", "How people have read it", 200, 1800],
  ["point", "What the context adds", 80, 1000],
] as const;

export function parseContextCheck(input: unknown, slug: string, bible: BibleData): ContextCheck {
  const raw = input as Raw;
  const where = `context check ${slug}`;
  check(/^[a-z0-9-]+$/.test(slug) && raw?.slug === slug, where, "the file name and slug must match");
  const verse = passageText(raw.verse, bible, `${where} verse`);
  check(Array.isArray(raw.basis) && raw.basis.length > 0, where, "needs the passages around the verse");
  const around = raw.basis.map((entry, index) => passageText(entry, bible, `${where} basis ${index + 1}`));
  // The verse and the passages around it are the only source, so every quotation must be in them.
  const part = (name: string, min: number, max: number) => {
    const value = text(raw[name], min, max, `${where} ${name}`);
    for (const words of quotations(value))
      check([verse, ...around].some((passage) => passage.words.includes(words)), `${where} ${name}`, `“${words}” is not in the WEB text of the verse or its basis passages`);
    return value;
  };
  const parts = Object.fromEntries(checkParts.map(([name, , min, max]) => [name, part(name, min, max)]));
  check(typeof raw.storyStatus === "string" && raw.storyStatus in storyStatuses, where, "storyStatus must be scripture, history or reading");
  const storyStatus = raw.storyStatus as keyof typeof storyStatuses;
  check(raw.sources === undefined || Array.isArray(raw.sources), where, "sources must be a list");
  const sources = ((raw.sources ?? []) as Raw[]).map((entry, index) => {
    const at = `${where} source ${index + 1}`;
    check(typeof entry.url === "string" && entry.url.startsWith("https://"), at, "needs an https link");
    return { title: text(entry.title, 3, 140, at), url: entry.url };
  });
  // A story that leans on anything outside the Bible must say where it comes from.
  check(storyStatus === "scripture" || sources.length > 0, where, "a story from outside the Bible needs its sources");
  check(raw.voices === undefined || (Array.isArray(raw.voices) && raw.voices.length <= 4), where, "voices must be a list of at most four");
  const voices = ((raw.voices ?? []) as Raw[]).map((entry, index) => {
    const at = `${where} voice ${index + 1}`;
    const source = entry.source as Raw | undefined;
    // Someone else's words are only shown with the place where they can be read.
    check(source && typeof source.url === "string" && source.url.startsWith("https://"), at, "needs a source with an https link");
    const words = text(entry.words, 20, 400, `${at} words`);
    check(!quotations(words).length, at, "curly double quotes are for the WEB text; the page adds its own marks");
    return {
      name: text(entry.name, 3, 80, `${at} name`),
      about: text(entry.about, 10, 160, `${at} about`),
      words,
      source: { title: text(source.title, 3, 140, `${at} source`), url: source.url },
    };
  });
  return {
    slug,
    ...editorial(raw, where),
    verse: verse.ref,
    // The hook is also the page description, so it keeps to that length.
    hook: part("hook", 60, 160),
    ...(parts as Pick<ContextCheck, (typeof checkParts)[number][0]>),
    story: part("story", 200, 2000),
    storyStatus,
    sources,
    voices,
    basis: around.map((passage) => passage.ref),
  };
}

// npm scripts and tests run with site/ as the working directory.
const contentDir = join(process.cwd(), "content");

function readAll<T>(folder: string, parse: (raw: unknown, name: string, bible: BibleData) => T): T[] {
  const dir = join(contentDir, folder);
  if (!existsSync(dir)) return [];
  const { bible } = library();
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => parse(JSON.parse(readFileSync(join(dir, file), "utf8")), file.replace(/\.json$/, ""), bible));
}

let cache: { topics: TopicPage[]; articles: Article[]; checks: ContextCheck[] } | undefined;

/** Every topic page, article and context check on file, drafts included. */
export function content() {
  cache ??= {
    topics: readAll("topics", parseTopic),
    articles: readAll("articles", parseArticle),
    checks: readAll("context-checks", parseContextCheck),
  };
  return cache;
}

/** SHOW_DRAFTS=1 builds drafts too, to look at them before approval. Never set it on Vercel. */
export const showDrafts = () => process.env.SHOW_DRAFTS === "1";
const online = (item: Editorial) => item.review === "approved" || showDrafts();

/** Topic pages that may be shown, in the order of the launch topics. */
export const publishedTopics = () =>
  launchTopics.flatMap((topic) => content().topics.filter((page) => page.id === topic.id && online(page)));

/** Articles that may be shown, newest first. */
export const publishedArticles = () =>
  content()
    .articles.filter(online)
    .sort((a, b) => b.written.localeCompare(a.written) || a.title.localeCompare(b.title));

/** Context checks that may be shown, in the order of the Bible. */
export function publishedChecks(): ContextCheck[] {
  const books = library().bible.books.map((book) => book.slug);
  const place = (item: ContextCheck) =>
    books.indexOf(item.verse.book) * 1_000_000 + item.verse.chapter * 1_000 + item.verse.start;
  return content()
    .checks.filter(online)
    .sort((a, b) => place(a) - place(b));
}

/** The published context checks for one chapter, for the card on its page. */
export const checksFor = (book: string, chapter: number) =>
  publishedChecks().filter((item) => item.verse.book === book && item.verse.chapter === chapter);

/** The WEB verses of a reference, to show the text itself. */
export function verses(ref: PassageRef) {
  const chapter = library()
    .bible.books.find((book) => book.slug === ref.book)!
    .chapters.find((candidate) => candidate.number === ref.chapter)!;
  return chapter.verses.filter((verse) => verse.number >= ref.start && verse.number <= ref.end);
}

/** "Psalm 23:4" or "Matthew 6:25-34". */
export function refLabel(ref: PassageRef): string {
  const book = library().bible.books.find((candidate) => candidate.slug === ref.book)!;
  return `${chapterTitle(book, ref.chapter)}:${ref.start}${ref.end > ref.start ? `-${ref.end}` : ""}`;
}

/** The passage on this site, opened at its first verse. */
export const refHref = (ref: PassageRef) => `/bible/${ref.book}/${ref.chapter}#v${ref.start}`;
