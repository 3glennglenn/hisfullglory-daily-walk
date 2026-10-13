// Helper for writing the AI explanations in portions.
// Rules and plan: docs/AI_EXPLANATIONS.md. Run from the repository root.
//
//   node scripts/ai-chapters.mjs status
//   node scripts/ai-chapters.mjs next 30
//       prints the next chapters that have no explanation of their own, with their WEB text
//   node scripts/ai-chapters.mjs add drafts.json --model "Claude Sonnet 5.5"
//       drafts.json: [{ "book": "matthew", "chapter": 1, "summary": "...", "background": "..." }]
//       checks every draft and writes nothing unless all of them pass
//
// Retelling explanations that were written before the storytelling voice (2026-10-13):
//   node scripts/ai-chapters.mjs retell-next 8
//       prints the next explanations still in the earlier voice: the 66 books first, then
//       the chapters. Each comes with its present text; a chapter also with its WEB text
//   node scripts/ai-chapters.mjs retell drafts.json --model "Claude Sonnet 5.5"
//       a book:    { "book": "genesis", "summary": "...", "background": "...", "interpretations": "..." }
//       a chapter: { "book": "matthew", "chapter": 1, "summary": "...", "background": "..." }
//       replaces those texts and marks the record as retold; writes nothing unless all pass
//   node scripts/ai-chapters.mjs text matthew 5
//       prints the WEB text of one chapter, to check a scene or a quotation before using it
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
const webOf = (chapters) => chapters.flatMap((c) => c.verses.map((v) => v.text)).join(" ");

// Word limits per part. A book's explanation is shown on every chapter that has none of
// its own, so it may run a little longer than a chapter's. The lower limits stay low: a
// retelling adds no facts, so it must never have to pad.
const chapterParts = [["summary", 70, 190], ["background", 35, 130]];
const bookParts = [["summary", 70, 220], ["background", 35, 140], ["interpretations", 50, 170]];

/** The problems with the parts of one draft, checked against the WEB text it explains. */
function partProblems(draft, parts, web, where) {
  const found = [];
  for (const [kind, min, max] of parts) {
    const text = draft[kind];
    if (typeof text !== "string") { found.push(`${kind} is missing`); continue; }
    if (words(text) < min || words(text) > max) found.push(`${kind} has ${words(text)} words, expected ${min} to ${max}`);
    const prose = text.replace(/“[^”]*”/g, "");
    if (/["—]/.test(prose)) found.push(`${kind}: no straight double quotes or em dashes`);
    if (licensed.test(prose)) found.push(`${kind}: names a translation that is not public domain`);
    for (const [, quote] of text.matchAll(/“([^”]+)”/g))
      if (!web.includes(quote)) found.push(`${kind}: “${quote}” is not in the WEB text of ${where}`);
  }
  return found;
}

/** Returns the problems with one new chapter draft; an empty list means it may be added. */
function problems(draft) {
  const book = bible.books.find((b) => b.slug === draft?.book);
  const chapter = book?.chapters.find((c) => c.number === draft?.chapter);
  if (!chapter) return ["unknown book or chapter"];
  const taken = load(book.slug).records.some((r) => r.chapter === chapter.number) ? ["already has an explanation"] : [];
  return [...taken, ...partProblems(draft, chapterParts, webOf([chapter]), "this chapter")];
}

// A record written in the storytelling voice says so; everything else is still to retell.
// The routine has written in that voice since its run of 2026-10-14, also if that run
// still used a copy of this script that did not add the marker.
const told = (record) => record.voice === "story" || record.written >= "2026-10-14";
const untold = () => [
  ...order.flatMap((book) => load(book.slug).records.filter((r) => r.scope === "book" && !told(r)).map((record) => ({ book, record }))),
  ...order.flatMap((book) => load(book.slug).records.filter((r) => r.scope !== "book" && !told(r)).map((record) => ({ book, record }))),
];

/** Returns the problems with one retold draft; an empty list means it may replace the old text. */
function retellProblems(draft) {
  const book = bible.books.find((b) => b.slug === draft?.book);
  if (!book) return ["unknown book"];
  const isBook = draft.chapter === undefined;
  const record = load(book.slug).records.find((r) => (isBook ? r.scope === "book" : r.chapter === draft.chapter));
  if (!record) return ["there is no explanation to retell; use add for a new chapter"];
  if (told(record)) return ["is already in the storytelling voice"];
  const parts = isBook ? bookParts : chapterParts;
  const lacking = parts.filter(([kind]) => !record.sections.some((section) => section.kind === kind));
  if (lacking.length) return [`the present explanation has no ${lacking.map(([kind]) => kind).join(" or ")} to replace`];
  return isBook
    ? partProblems(draft, parts, webOf(book.chapters), "this book")
    : partProblems(draft, parts, webOf([book.chapters.find((c) => c.number === draft.chapter)]), "this chapter");
}

const [command, argument, ...rest] = process.argv.slice(2);
const total = bible.books.reduce((n, b) => n + b.chapters.length, 0);
const today = () => new Date().toISOString().slice(0, 10);
function modelFrom(args) {
  const model = args[args.indexOf("--model") + 1];
  if (!args.includes("--model") || !model) throw new Error('Name the model that wrote the drafts: --model "Claude Sonnet 5.5"');
  return model;
}
function draftsFrom(path, key) {
  const drafts = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(drafts) || !drafts.length) throw new Error("The drafts file must be a non-empty array");
  return { drafts, keys: drafts.map(key) };
}
function printVerses(chapter) {
  for (const verse of chapter.verses) console.log(`${verse.number} ${verse.omitted ? "[verse omitted in this WEB edition]" : verse.text}`);
}
function stopOn(failed, again) {
  if (!failed.length) return;
  console.error(failed.join("\n"));
  console.error(`\nNothing was written. Fix the ${failed.length} problem(s) above and run ${again} again.`);
  process.exit(1);
}

if (command === "status") {
  const left = missing();
  console.log(`${total - left.length} of ${total} chapters have their own AI explanation; ${left.length} to go.`);
  if (left.length) console.log(`Next: ${left[0].book.name} ${left[0].chapter.number}`);
  const old = untold();
  const books = old.filter((entry) => entry.record.scope === "book").length;
  console.log(`Still in the earlier voice: ${books} of 66 book explanations and ${old.length - books} chapter explanations.`);
} else if (command === "next") {
  for (const { book, chapter } of missing().slice(0, Number(argument) || 30)) {
    console.log(`\n### ${book.slug} ${chapter.number}  (${book.name} ${chapter.number})`);
    printVerses(chapter);
  }
} else if (command === "text") {
  const chapter = bible.books.find((b) => b.slug === argument)?.chapters.find((c) => c.number === Number(rest[0]));
  if (!chapter) throw new Error("Name a book and one of its chapters: text matthew 5");
  printVerses(chapter);
} else if (command === "add") {
  const model = modelFrom(rest);
  const { drafts, keys } = draftsFrom(argument, (d) => `${d?.book} ${d?.chapter}`);
  stopOn(drafts.flatMap((draft, i) => [
    ...problems(draft),
    ...(keys.indexOf(keys[i]) !== i ? ["listed twice"] : []),
  ].map((problem) => `${keys[i]}: ${problem}`)), "add");
  const written = today();
  for (const slug of new Set(drafts.map((d) => d.book))) {
    const file = load(slug);
    for (const draft of drafts.filter((d) => d.book === slug))
      file.records.push({
        id: `ai:${slug}/${draft.chapter}`,
        chapter: draft.chapter,
        model,
        written,
        review: "ai draft",
        voice: "story",
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
} else if (command === "retell-next") {
  const batch = untold().slice(0, Number(argument) || 8);
  if (!batch.length) console.log("Nothing left to retell: every explanation is in the storytelling voice.");
  for (const { book, record } of batch) {
    const isBook = record.scope === "book";
    console.log(isBook
      ? `\n### book ${book.slug}  (${book.name}, ${book.chapters.length} chapters)`
      : `\n### chapter ${book.slug} ${record.chapter}  (${book.name} ${record.chapter})`);
    console.log("Present text, to retell. Keep its facts from outside the Bible (dates, authors, history, how it is read) as they are, and add none.");
    for (const section of record.sections) console.log(`[${section.kind}] ${section.text}`);
    if (isBook) {
      console.log(`Whatever you add from ${book.name} itself, read first: node scripts/ai-chapters.mjs text ${book.slug} <chapter>`);
    } else {
      console.log("WEB text of the chapter:");
      printVerses(book.chapters.find((c) => c.number === record.chapter));
    }
  }
} else if (command === "retell") {
  const model = modelFrom(rest);
  const { drafts, keys } = draftsFrom(argument, (d) => (d?.chapter === undefined ? `book ${d?.book}` : `${d?.book} ${d?.chapter}`));
  stopOn(drafts.flatMap((draft, i) => [
    ...retellProblems(draft),
    ...(keys.indexOf(keys[i]) !== i ? ["listed twice"] : []),
  ].map((problem) => `${keys[i]}: ${problem}`)), "retell");
  const written = today();
  for (const slug of new Set(drafts.map((d) => d.book))) {
    const file = load(slug);
    for (const draft of drafts.filter((d) => d.book === slug)) {
      const isBook = draft.chapter === undefined;
      const record = file.records.find((r) => (isBook ? r.scope === "book" : r.chapter === draft.chapter));
      // Only the parts that were retold change; a pilot chapter keeps its other sections
      // and its translation notes.
      for (const [kind] of isBook ? bookParts : chapterParts)
        record.sections.find((section) => section.kind === kind).text = draft[kind].trim();
      Object.assign(record, { model, written, voice: "story" });
    }
    writeFileSync(fileOf(slug), JSON.stringify(file, null, 2) + "\n");
  }
  console.log(`Retold ${drafts.length} explanation(s), written by ${model} on ${written}.`);
  console.log("Now run: node --experimental-strip-types --test tests/ai.test.ts");
} else {
  console.log("Usage: node scripts/ai-chapters.mjs status | next <count> | add <drafts.json> --model <name> | retell-next <count> | retell <drafts.json> --model <name> | text <book> <chapter>");
  process.exit(1);
}
