// The addresses search engines may index, in one place for the sitemap.
// `tests/seo.test.ts` compares this list with the pages that were actually built.
import { library } from "./bible.ts";
import { content, showDrafts } from "./content.ts";

/** Pages outside the Bible. Add a page here in the same change that adds its file. */
const fixedPages = ["/", "/bible", "/resources", "/about", "/beta"];

/**
 * A section's overview page and its approved pages; nothing until the first one is
 * approved. A draft is never indexable, and neither is an overview that lists one, which
 * only happens in a build made with SHOW_DRAFTS=1.
 */
function section(base: string, items: { review: string; name: string }[]) {
  const approved = items.filter((item) => item.review === "approved");
  if (!approved.length) return [];
  const listsDraft = showDrafts() && approved.length < items.length;
  return [...(listsDraft ? [] : [base]), ...approved.map((item) => `${base}/${item.name}`)];
}

export const indexablePaths = (): string[] => {
  const { checks, topics, articles } = content();
  return [
    ...fixedPages,
    ...section("/context-checks", checks.map((item) => ({ review: item.review, name: item.slug }))),
    ...section("/topics", topics.map((item) => ({ review: item.review, name: item.id }))),
    ...section("/articles", articles.map((item) => ({ review: item.review, name: item.slug }))),
    ...library().bible.books.flatMap((book) => [
      `/bible/${book.slug}`,
      ...book.chapters.map((chapter) => `/bible/${book.slug}/${chapter.number}`),
    ]),
  ];
};
