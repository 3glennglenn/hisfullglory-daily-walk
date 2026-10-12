// AI explanations: a separate, labelled layer beside Scripture and the sourced notes.
// They are written ahead of time and served as static files, /ai/<book>.json. Nothing is
// generated at runtime. Shared by the app and the website. Rules: docs/AI_EXPLANATIONS.md.
import type { BibleData } from "./provider.ts";

export const sectionTitles = {
  summary: "What this chapter says",
  background: "Background",
  interpretations: "How Christians read it",
} as const;
export type SectionKind = keyof typeof sectionTitles;

// Only public-domain translations may be quoted beside the WEB.
export const publicDomainTranslations = {
  KJV: "King James Version",
  ASV: "American Standard Version (1901)",
} as const;
export type TranslationCode = keyof typeof publicDomainTranslations;

export interface AiSection { kind: SectionKind; text: string; }
export interface TranslationNote {
  verse: number; note: string;
  renderings: { translation: TranslationCode; text: string }[];
}
export interface AiExplanation {
  id: string; book: string; chapter: number; model: string; written: string;
  review: "ai draft" | "reviewed";
  sections: AiSection[]; translations: TranslationNote[];
}

const text = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" && value.trim().length >= min && value.length <= max;

/**
 * Validates one AI file against the Bible it explains. Anything invalid throws, so a
 * faulty file is rejected whole instead of showing an unchecked explanation.
 */
export function parseAiFile(raw: unknown, book: string, bible: BibleData): AiExplanation[] {
  const file = raw as { book?: unknown; records?: unknown };
  if (!file || typeof file !== "object" || file.book !== book) throw new Error(`AI file must declare book "${book}"`);
  const chapters = bible.books.find((b) => b.slug === book)?.chapters;
  if (!chapters) throw new Error(`Unknown book "${book}"`);
  if (!Array.isArray(file.records) || !file.records.length || file.records.length > chapters.length)
    throw new Error(`${book}: AI file needs records`);
  const seen = new Set<number>();
  return file.records.map((r: Record<string, unknown>) => {
    const chapter = chapters.find((c) => c.number === r?.chapter);
    const where = `ai:${book}/${String(r?.chapter)}`;
    if (!chapter || seen.has(chapter.number)) throw new Error(`${where}: chapter must exist once`);
    seen.add(chapter.number);
    if (r.id !== where) throw new Error(`${where}: id must be "${where}"`);
    if (!text(r.model, 3, 80)) throw new Error(`${where}: model must name the AI model`);
    if (typeof r.written !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.written)) throw new Error(`${where}: written must be a date`);
    if (r.review !== "ai draft" && r.review !== "reviewed") throw new Error(`${where}: review must be "ai draft" or "reviewed"`);

    const sections = r.sections as AiSection[];
    if (!Array.isArray(sections) || !sections.length || sections.length > 3) throw new Error(`${where}: one to three sections`);
    const kinds = new Set(sections.map((s) => s?.kind));
    if (kinds.size !== sections.length || [...kinds].some((k) => !(k in sectionTitles)))
      throw new Error(`${where}: section kinds must be known and used once`);
    if (sections.some((s) => !text(s.text, 80, 3000))) throw new Error(`${where}: section length`);

    const translations = (r.translations ?? []) as TranslationNote[];
    if (!Array.isArray(translations) || translations.length > 6) throw new Error(`${where}: at most six translation notes`);
    for (const t of translations) {
      if (!chapter.verses.some((v) => v.number === t?.verse && !v.omitted)) throw new Error(`${where}: translation note needs an existing verse`);
      if (!text(t.note, 40, 800)) throw new Error(`${where}: translation note length`);
      if (!Array.isArray(t.renderings) || !t.renderings.length || t.renderings.length > 3 ||
        t.renderings.some((x) => !(x?.translation in publicDomainTranslations) || !text(x.text, 2, 300)))
        throw new Error(`${where}: renderings must come from public-domain translations`);
    }

    // Curly double quotes are reserved for the WEB text of this chapter.
    const web = chapter.verses.map((v) => v.text).join(" ");
    for (const prose of [...sections.map((s) => s.text), ...translations.map((t) => t.note)])
      for (const [, quote] of prose.matchAll(/“([^”]+)”/g))
        if (!web.includes(quote)) throw new Error(`${where}: “${quote}” is not in the WEB text of this chapter`);

    return {
      id: where, book, chapter: chapter.number, model: r.model as string, written: r.written, review: r.review,
      sections: sections.map((s) => ({ kind: s.kind, text: s.text })),
      translations: translations.map((t) => ({ verse: t.verse, note: t.note, renderings: t.renderings.map((x) => ({ translation: x.translation, text: x.text })) })),
    };
  });
}

/** Splits explanation text into paragraphs and simple lists ("- " lines). */
export function blocks(prose: string): ({ list: string[] } | { paragraph: string })[] {
  return prose.split(/\n\s*\n/).map((part) => {
    const lines = part.split("\n").map((line) => line.trim());
    return lines.every((line) => line.startsWith("- "))
      ? { list: lines.map((line) => line.slice(2)) }
      : { paragraph: lines.join(" ") };
  });
}

const aiCache = new Map<string, Promise<AiExplanation[]>>();
/** Loads a book's AI explanations; a missing, offline or invalid file yields [] (no AI block). */
export function loadAiExplanations(book: string, bible: BibleData, fetcher: typeof fetch = (...a) => fetch(...a)): Promise<AiExplanation[]> {
  if (!/^[a-z0-9-]+$/.test(book)) return Promise.resolve([]);
  let pending = aiCache.get(book);
  if (!pending) {
    pending = fetcher(`/ai/${book}.json`)
      .then(async (r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? parseAiFile(await r.json(), book, bible) : []))
      .catch(() => { aiCache.delete(book); return []; });
    aiCache.set(book, pending);
  }
  return pending;
}
export function clearAiCache() { aiCache.clear(); }
