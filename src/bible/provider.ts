export interface Verse {
  number: number;
  text: string;
  omitted?: boolean;
}
export interface Chapter {
  number: number;
  verses: Verse[];
}
export interface BibleBook {
  id: string;
  slug: string;
  name: string;
  chapters: Chapter[];
}
export interface BibleData {
  translation: "WEB";
  source: string;
  license: string;
  books: BibleBook[];
}
export interface BibleProvider {
  load(): Promise<BibleData>;
  search(
    query: string,
  ): Promise<{ path: string; reference: string; text: string }[]>;
}
let loaded: Promise<BibleData> | undefined;
export function searchBible(data: BibleData, query: string, limit = 60) {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const result: { path: string; reference: string; text: string }[] = [];
  for (const book of data.books)
    for (const chapter of book.chapters)
      for (const verse of chapter.verses)
        if (!verse.omitted && verse.text.toLowerCase().includes(q)) {
          result.push({
            path: `/bible/${book.slug}/${chapter.number}/${verse.number}`,
            reference: `${book.name} ${chapter.number}:${verse.number}`,
            text: verse.text,
          });
          if (result.length === limit) return result;
        }
  return result;
}
export const webProvider: BibleProvider = {
  load() {
    if (!loaded)
      loaded = fetch("/bible/web.json")
        .then(async (r) => {
          if (!r.ok)
            throw new Error(
              "The WEB library could not be loaded. Connect once to download it.",
            );
          const data = (await r.json()) as BibleData;
          if (data.books.length !== 66)
            throw new Error("Incomplete Bible library.");
          return data;
        })
        .catch((e) => {
          loaded = undefined;
          throw e;
        });
    return loaded;
  },
  async search(query) {
    return searchBible(await this.load(), query);
  },
};
export const contextNotes: Record<string, { text: string; source: string }> = {
  "psalms/23": {
    text: "The psalm uses two images: the LORD as shepherd (verses 1–4) and a welcoming host (verses 5–6). Read the comfort of verse 4 alongside its valley, rather than as a promise that hardship disappears. The source heading identifies this as a psalm by David.",
    source: "https://ebible.org/engwebp/PSA023.htm",
  },
  "psalms/121": {
    text: "This Song of Ascents moves from a question about help to repeated assurance that the LORD keeps his people. Notice the repetition of keeping and the movement from day and night to going out and coming in.",
    source: "https://ebible.org/engwebp/PSA121.htm",
  },
  "romans/8": {
    text: "Read this chapter as an argument that moves from life in the Spirit to suffering, hope, prayer, and the love of God in Christ. Verse 28 belongs with verses 29–30; verses 35–39 explicitly name hardship. These are observations of the passage, not a reconstruction of its historical setting.",
    source: "https://ebible.org/engwebp/ROM08.htm",
  },
};
export const studyNote =
  "Editorial reflection · Consider what the passage says about God, what it asks of its readers, and how the surrounding verses shape its meaning. Christians may differ in application; personal stories do not establish the meaning of Scripture. No original-language or historical claims are supplied here.";
