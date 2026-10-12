// The addresses search engines may index, in one place for the sitemap.
// `tests/seo.test.ts` compares this list with the pages that were actually built.
import { library } from "./bible.ts";

/** Pages outside the Bible. Add a page here in the same change that adds its file. */
const fixedPages = ["/", "/bible", "/resources", "/about", "/beta"];

export const indexablePaths = (): string[] => [
  ...fixedPages,
  ...library().bible.books.flatMap((book) => [
    `/bible/${book.slug}`,
    ...book.chapters.map((chapter) => `/bible/${book.slug}/${chapter.number}`),
  ]),
];
