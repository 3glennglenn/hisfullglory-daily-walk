// The books that have public study notes (a file in public/study), in the order of the Bible. Bible, Study lists
// them and opens each at the book's first chapter, where the book note shows. The app cannot list a folder at run
// time, and importing the notes here would bundle them twice, so this list is written out and
// tests/study-books.test.ts keeps it equal to the folder: adding a study file without adding its slug here fails
// the tests.
export const STUDY_BOOKS: readonly string[] = ["psalms", "matthew", "mark", "luke", "john", "romans"];
