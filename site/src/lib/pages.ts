// The addresses search engines may index, in one place for the sitemap.
// `tests/seo.test.ts` compares this list with the pages that were actually built.
import { library } from "./bible.ts";
import { content, showDrafts } from "./content.ts";

/** Pages outside the Bible. Add a page here in the same change that adds its file. */
const fixedPages = ["/", "/bible", "/resources", "/about", "/beta", "/delete-account"];

/**
 * A section's overview page and its published pages (approved ones, and for context checks
 * also the AI-unreviewed ones); nothing until the first one is published. A draft is never
 * indexable, and neither is an overview that lists one, which only happens in a build made
 * with SHOW_DRAFTS=1.
 */
function section(base: string, items: { review: string; name: string }[]) {
  const published = items.filter((item) => item.review !== "draft");
  if (!published.length) return [];
  const listsDraft = showDrafts() && published.length < items.length;
  return [...(listsDraft ? [] : [base]), ...published.map((item) => `${base}/${item.name}`)];
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
