// The addresses search engines may index, in one place for the sitemap.
// `tests/seo.test.ts` compares this list with the pages that were actually built.
import { library } from "./bible.ts";
import { content } from "./content.ts";

/** Pages outside the Bible. Add a page here in the same change that adds its file. */
const fixedPages = ["/", "/bible", "/resources", "/about", "/beta"];

/** A section's overview page and its own pages; nothing until the first one is approved. */
const section = (base: string, names: string[]) =>
  names.length ? [base, ...names.map((name) => `${base}/${name}`)] : [];

export const indexablePaths = (): string[] => {
  // Only approved pages: a draft shown with SHOW_DRAFTS=1 is never indexable.
  const approved = <T extends { review: string }>(items: T[]) =>
    items.filter((item) => item.review === "approved");
  return [
    ...fixedPages,
    ...section("/topics", approved(content().topics).map((topic) => topic.id)),
    ...section("/articles", approved(content().articles).map((article) => article.slug)),
    ...library().bible.books.flatMap((book) => [
      `/bible/${book.slug}`,
      ...book.chapters.map((chapter) => `/bible/${book.slug}/${chapter.number}`),
    ]),
  ];
};
