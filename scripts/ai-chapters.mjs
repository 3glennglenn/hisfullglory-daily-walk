// Helper for writing the AI chapter explanations in portions.
// Rules and plan: docs/AI_EXPLANATIONS.md. Run from the repository root.
//
//   node scripts/ai-chapters.mjs status
//   node scripts/ai-chapters.mjs next 30
//       prints the next chapters that have no explanation of their own, with their WEB text
//   node scripts/ai-chapters.mjs add drafts.json --model "Claude Sonnet 5.5"
//       drafts.json: [{ "book": "matthew", "chapter": 1, "summary": "...", "background": "..." }]
//       checks every draft and writes nothing unless all of them pass
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const bible = JSON.parse(readFileSync("public/bible/web.json", "utf8"));
const oldTestamentBooks = 39;
// New Testament first, then the Old Testament, each in Bible order.
const order = [...bible.books.slice(oldTestamentBooks), ...bible.books.slice(0, oldTestamentBooks)];
const fileOf = (slug) => `public/ai/${slug}.json`;
const load = (slug) =>
  existsSync(fileOf(slug)) ? JSON.parse(readFileSync(fileOf(slug), "utf8")) : { book: slug, records: [] };
const missing = () =>
  order.flatMap((book) => {
    const have = new Set(load(book.slug).records.map((r) => r.chapter));
    return book.chapters.filter((c) => !have.has(c.number)).map((chapter) => ({ book, chapter }));
  });
const words = (text) => text.trim().split(/\s+/).length;
const licensed = /\b(NIV|ESV|NLT|NKJV|NASB|CSB|NRSV|NBV|New International|English Standard|New Living|New King James|The Message)\b/;

/** Returns the problems with one draft; an empty list means it may be added. */
function problems(draft) {
  const found = [];
  const book = bible.books.find((b) => b.slug === draft?.book);
  const chapter = book?.chapters.find((c) => c.number === draft?.chapter);
  if (!chapter) return ["unknown book or chapter"];
  if (load(book.slug).records.some((r) => r.chapter === chapter.number)) found.push("already has an explanation");
  const web = chapter.verses.map((v) => v.text).join(" ");
  for (const [kind, min, max] of [["summary", 70, 190], ["background", 35, 130]]) {
    const text = draft[kind];
    if (typeof text !== "string") { found.push(`${kind} is missing`); continue; }
    if (words(text) < min || words(text) > max) found.push(`${kind} has ${words(text)} words, expected ${min} to ${max}`);
    const prose = text.replace(/“[^”]*”/g, "");
    if (/["—]/.test(prose)) found.push(`${kind}: no straight double quotes or em dashes`);
    if (licensed.test(prose)) found.push(`${kind}: names a translation that is not public domain`);
    for (const [, quote] of text.matchAll(/“([^”]+)”/g))
      if (!web.includes(quote)) found.push(`${kind}: “${quote}” is not in the WEB text of this chapter`);
  }
  return found;
}

const [command, argument, ...rest] = process.argv.slice(2);
const total = bible.books.reduce((n, b) => n + b.chapters.length, 0);

if (command === "status") {
  const left = missing();
  console.log(`${total - left.length} of ${total} chapters have their own AI explanation; ${left.length} to go.`);
  if (left.length) console.log(`Next: ${left[0].book.name} ${left[0].chapter.number}`);
} else if (command === "next") {
  for (const { book, chapter } of missing().slice(0, Number(argument) || 30)) {
    console.log(`\n### ${book.slug} ${chapter.number}  (${book.name} ${chapter.number})`);
    for (const verse of chapter.verses) console.log(`${verse.number} ${verse.omitted ? "[verse omitted in this WEB edition]" : verse.text}`);
  }
} else if (command === "add") {
  const model = rest[rest.indexOf("--model") + 1];
  if (!rest.includes("--model") || !model) throw new Error('Name the model that wrote the drafts: --model "Claude Sonnet 5.5"');
  const drafts = JSON.parse(readFileSync(argument, "utf8"));
  if (!Array.isArray(drafts) || !drafts.length) throw new Error("The drafts file must be a non-empty array");
  const keys = drafts.map((d) => `${d?.book} ${d?.chapter}`);
  const failed = drafts.flatMap((draft, i) => [
    ...problems(draft),
    ...(keys.indexOf(keys[i]) !== i ? ["listed twice"] : []),
  ].map((problem) => `${keys[i]}: ${problem}`));
  if (failed.length) {
    console.error(failed.join("\n"));
    console.error(`\nNothing was written. Fix the ${failed.length} problem(s) above and run add again.`);
    process.exit(1);
  }
  const written = new Date().toISOString().slice(0, 10);
  for (const slug of new Set(drafts.map((d) => d.book))) {
    const file = load(slug);
    for (const draft of drafts.filter((d) => d.book === slug))
      file.records.push({
        id: `ai:${slug}/${draft.chapter}`,
        chapter: draft.chapter,
        model,
        written,
        review: "ai draft",
        sections: [
          { kind: "summary", text: draft.summary.trim() },
          { kind: "background", text: draft.background.trim() },
        ],
      });
    // The book record stays first; chapters follow in order.
    file.records.sort((a, b) => (a.chapter ?? 0) - (b.chapter ?? 0));
    writeFileSync(fileOf(slug), JSON.stringify(file, null, 2) + "\n");
  }
  console.log(`Added ${drafts.length} chapter explanation(s), written by ${model} on ${written}.`);
  console.log("Now run: node --experimental-strip-types --test tests/ai.test.ts");
} else {
  console.log("Usage: node scripts/ai-chapters.mjs status | next <count> | add <drafts.json> --model <name>");
  process.exit(1);
}
