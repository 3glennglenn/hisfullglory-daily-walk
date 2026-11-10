// The books that have public study notes (a file in public/study), in the order of the Bible. Bible, Study lists
// them and opens each at the book's first chapter, where the book note shows. The app cannot list a folder at run
// time, and importing the notes here would bundle them twice, so this list is written out and
// tests/study-books.test.ts keeps it equal to the folder: adding a study file without adding its slug here fails
// the tests.
export const STUDY_BOOKS: readonly string[] = ["psalms", "matthew", "mark", "luke", "john", "romans"];

// The order the reader sees, as the design canvas draws it: the Gospels first, in Gospel order, then the other books in
// the order of the Bible ("Matthew, Mark, Luke, John, Psalms, Romans"). It is derived from STUDY_BOOKS, so a book added
// there shows up here without a second edit.
const gospels = ["matthew", "mark", "luke", "john"];
export const STUDY_BOOKS_SHOWN: readonly string[] = [
  ...gospels.filter((slug) => STUDY_BOOKS.includes(slug)),
  ...STUDY_BOOKS.filter((slug) => !gospels.includes(slug)),
];
