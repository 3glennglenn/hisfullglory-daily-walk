// Helper for the daily context-check routine. Rules, safeguards and the routine prompt:
// docs/CONTEXT_CHECKS_ROUTINE.md. Run from the repository root, with the flag that lets Node
// read the site's TypeScript:
//
//   node --experimental-strip-types scripts/context-checks.mjs status
//       how many checks are on file and how many verses are left in the queue
//   node --experimental-strip-types scripts/context-checks.mjs next
//       the next verse of scripts/context-check-queue.json that no check covers, with two
//       alternates, the WEB text of the verse and of its whole chapter, and the models to read
//   node --experimental-strip-types scripts/context-checks.mjs text john 3
//       the WEB text of one chapter, to check a scene or a quotation before using it
//   node --experimental-strip-types scripts/context-checks.mjs sources <file>
//       network check only, for any check file: every source opens (200, text) and every
//       voice's words stand on their source page. Writes nothing. Also the routine's network test.
//   node --experimental-strip-types scripts/context-checks.mjs verify <draft.json> --model "Claude Sonnet 5.5"
//       every check there is, as `add` would run them, without writing anything
//   node --experimental-strip-types scripts/context-checks.mjs add <draft.json> --model "Claude Sonnet 5.5"
//       runs the same checks and only then writes site/content/context-checks/<slug>.json
//       with review "ai-unreviewed". Never overwrites, never writes "approved".
//
// The only option is --model. No option skips a check.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkSources, nextCandidates, slugFor, verifyAll, writeCheckFile } from "./context-checks-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const startDir = process.cwd();
const usage =
  'Usage: node --experimental-strip-types scripts/context-checks.mjs status | next | text <book> <chapter> | sources <file> | verify <file> --model <name> | add <file> --model <name>';
const fail = (...lines) => {
  console.error(lines.join("\n"));
  process.exit(1);
};

// Arguments: positional words, and --model <name> as the only option.
const words = [];
let model;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--model") {
    model = args[++i];
    if (!model || model.startsWith("--")) fail('--model needs the name of the model that wrote the check, for example --model "Claude Sonnet 5.5".');
  } else if (args[i].startsWith("-")) {
    fail(`Unknown option ${args[i]}. The only option is --model; no option skips a check.`, usage);
  } else words.push(args[i]);
}
const [command, argument, extra] = words;
if (!["status", "next", "text", "sources", "verify", "add"].includes(command)) fail(usage);

const bible = JSON.parse(readFileSync(join(root, "public/bible/web.json"), "utf8"));
const queue = JSON.parse(readFileSync(join(root, "scripts/context-check-queue.json"), "utf8"));
const today = new Date().toISOString().slice(0, 10);
const modelsToRead = ["site/content/context-checks/matthew-5-39.json", "site/content/context-checks/psalm-46-10.json"];

function printVerses(chapter, only) {
  for (const verse of chapter.verses)
    if (!only || (verse.number >= only.start && verse.number <= only.end))
      console.log(`${verse.number} ${verse.omitted ? "[verse omitted in this WEB edition]" : verse.text}`);
}
const chapterOf = (ref) => bible.books.find((book) => book.slug === ref.book).chapters.find((chapter) => chapter.number === ref.chapter);
const labelOf = (ref) => {
  const book = bible.books.find((candidate) => candidate.slug === ref.book);
  return `${book.name} ${ref.chapter}:${ref.start}${ref.end > ref.start ? `-${ref.end}` : ""}`;
};

if (command === "text") {
  const chapter = bible.books.find((book) => book.slug === argument)?.chapters.find((entry) => entry.number === Number(extra));
  if (!chapter) fail("Name a book and one of its chapters: text john 3");
  printVerses(chapter);
  process.exit(0);
}

// A routine behind a proxy: Node 24 makes fetch use HTTP(S)_PROXY only when NODE_USE_ENV_PROXY=1.
// Start again with it set. This changes how the network is reached, never which checks run.
const proxied = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"].some((name) => process.env[name]);
if (["sources", "verify", "add"].includes(command) && proxied && !process.env.NODE_USE_ENV_PROXY) {
  const again = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
  });
  process.exit(again.status ?? 1);
}

// content.ts and bible.ts read their files relative to site/, so go there before importing them.
const draftPath = argument ? resolve(startDir, argument) : undefined;
process.chdir(join(root, "site"));
let content, parseContextCheck, library;
try {
  ({ content, parseContextCheck } = await import(pathToFileURL(join(root, "site/src/lib/content.ts")).href));
  ({ library } = await import(pathToFileURL(join(root, "site/src/lib/bible.ts")).href));
} catch (error) {
  fail(`Could not load the site's checks (${error.message}).`, "Run this command with the flag: node --experimental-strip-types scripts/context-checks.mjs ...");
}
const checks = content().checks;
const checksDir = join(root, "site/content/context-checks");

function readJson(path) {
  if (!path || !existsSync(path)) fail(`Name a JSON file that exists: ${command} <file>`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return fail(`${path} is not valid JSON (${error.message}).`);
  }
}

function stopOn(problems, closing) {
  if (!problems.length) return;
  console.error(problems.map((problem) => `- ${problem}`).join("\n"));
  console.error(`\n${problems.length} problem(s). ${closing}`);
  process.exit(1);
}

if (command === "status") {
  const count = (review) => checks.filter((check) => check.review === review).length;
  const left = nextCandidates(queue, checks, Infinity).length;
  console.log(`Context checks on file: ${count("approved")} approved, ${count("ai-unreviewed")} AI-unreviewed, ${count("draft")} draft.`);
  console.log(`Queue: ${left} left of ${queue.length}.`);
} else if (command === "next") {
  const [first, ...alternates] = nextCandidates(queue, checks, 3);
  if (!first) fail("The queue is empty: every verse in scripts/context-check-queue.json is covered. Write nothing and report it.");
  console.log(`### Next: ${labelOf(first)}  (slug ${slugFor(first)})`);
  printVerses(chapterOf(first), first);
  console.log(`\nWEB text of the whole chapter, ${bible.books.find((b) => b.slug === first.book).name} ${first.chapter}:`);
  printVerses(chapterOf(first));
  for (const ref of alternates) {
    console.log(`\n### Alternate, if the next one cannot be done: ${labelOf(ref)}  (slug ${slugFor(ref)})`);
    printVerses(chapterOf(ref), ref);
  }
  console.log(`\nRead these two checks as models before writing: ${modelsToRead.join(" and ")}`);
} else if (command === "sources") {
  const result = await checkSources(readJson(draftPath));
  console.log(`Sources opened: ${result.opened.length}. Voices found on their pages: ${result.voicesFound.length}.`);
  stopOn(result.problems, "Nothing was written.");
  console.log("Every source opened and every voice's words were found.");
} else {
  const draft = readJson(draftPath);
  if (command === "add" && !model) fail('Name the model that wrote the check: add <file> --model "Claude Sonnet 5.5"');
  const result = await verifyAll(draft, { parse: parseContextCheck, bible: library().bible, checks, queue, today, model });
  stopOn(result.problems, command === "add" ? "Nothing was written." : "Nothing may be published.");
  console.log(`${result.check.slug} passes every check: Scripture matches the WEB text, ${result.opened.length} source(s) opened, ${result.voicesFound.length} voice(s) found on their pages.`);
  if (command === "add") {
    const path = writeCheckFile(checksDir, result.check);
    console.log(`Wrote ${path}`);
    console.log(`It will be at https://hisfullglory.com/context-checks/${result.check.slug}`);
    console.log("Now run: node --experimental-strip-types --test tests/context.test.ts tests/context-routine.test.ts");
  }
}
