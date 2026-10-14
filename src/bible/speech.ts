import type { Chapter } from "./provider";

/** What "Listen" reads aloud: the reference first, then each verse that is in this edition. */
export function speechParts(reference: string, chapter: Chapter): { verse?: number; text: string }[] {
  return [
    { text: `${reference}.` },
    ...chapter.verses.filter((v) => !v.omitted && v.text.trim()).map((v) => ({ verse: v.number, text: v.text })),
  ];
}
