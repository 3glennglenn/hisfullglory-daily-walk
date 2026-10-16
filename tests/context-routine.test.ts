// Offline tests for the daily context-check routine (docs/CONTEXT_CHECKS_ROUTINE.md): the
// matching of quoted words, the source checks with an injected fetch and a local stub
// server, the routine rules, the queue and the command line. Nothing here uses the internet.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkSources,
  covers,
  fetchPage,
  htmlToText,
  nextCandidates,
  normalizeForMatch,
  prepareDraft,
  refProblems,
  routineProblems,
  slugFor,
  verifyAll,
  wordsOnPage,
  writeCheckFile,
} from "../scripts/context-checks-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checksDir = join(root, "site/content/context-checks");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const onFile = readdirSync(checksDir).filter((file) => file.endsWith(".json")).map((file) => read(join(checksDir, file)));
const queue = read(join(root, "scripts/context-check-queue.json"));
const web = read(join(root, "public/bible/web.json"));

// content.ts and bible.ts read their files relative to site/. Each test file runs in its own process.
process.chdir(join(root, "site"));
const { parseContextCheck } = await import("../site/src/lib/content.ts");
const { library } = await import("../site/src/lib/bible.ts");
const { bible } = library();

const today = "2026-10-20";
const html = (body: string) => `<!doctype html><html><head><title>x</title><style>p{}</style><script>var a = "ignored words";</script></head><body>${body}</body></html>`;
const page = (body: string, type = "text/html; charset=utf-8", status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": type, ...headers } });
/** A fetch that answers from a table and records every address it was asked for. */
function fakeFetch(table: Record<string, () => Response | Promise<Response>>) {
  const asked: string[] = [];
  const fetch = async (url: string) => {
    asked.push(url);
    const answer = table[url];
    if (!answer) throw new TypeError("fetch failed");
    return answer();
  };
  return { fetch, asked };
}

test("quote marks, dashes, case and whitespace do not hide a match", () => {
  assert.equal(normalizeForMatch("He said: “Don’t  go” — now"), normalizeForMatch("he said:\n\"Don't go\" - NOW"));
  assert.equal(normalizeForMatch("a–b−c­d​e"), normalizeForMatch("a-b-cde"));
  assert.equal(normalizeForMatch("It’s"), normalizeForMatch("it's"));
  assert.notEqual(normalizeForMatch("one word"), normalizeForMatch("one world"));
});

test("a page is turned into the words a reader sees", () => {
  const text = htmlToText(html("<!-- a comment --><h1>Title</h1><p>Don&rsquo;t&nbsp;stop &#8217;now&#x2019; &amp; go &mdash; on</p><p>one<b>two</b></p>"));
  assert.ok(text.includes("Don’t stop ’now’ & go — on"));
  assert.ok(!text.includes("ignored words") && !text.includes("a comment") && !text.includes("p{}"));
  assert.ok(wordsOnPage("one two", text), "an inline tag between words is only a space");
});

test("a voice's words are found despite different quote marks, dashes, case and line breaks, and not when a word differs", () => {
  const text = htmlToText(html("<p>He wrote:&nbsp;&ldquo;Hold off your hands,\n ye enemies &ndash; sit down!&rdquo;</p>"));
  assert.ok(wordsOnPage("Hold off your hands, ye enemies - SIT down!", text));
  assert.ok(wordsOnPage("hold off your hands, ye enemies — sit down!", text));
  assert.ok(!wordsOnPage("Hold off your hands, ye foes - sit down!", text));
  assert.ok(!wordsOnPage("Hold off your hands, ... sit down!", text), "an ellipsis skips text, so it is not a match");
  assert.ok(!wordsOnPage("", text));
});

test("a page that opens as text passes; everything else is a clear failure", async () => {
  const ok = await fetchPage("https://a.test/", fakeFetch({ "https://a.test/": () => page(html("<p>Hello there</p>")) }));
  assert.equal(ok.ok, true);
  assert.ok(wordsOnPage("hello there", ok.text));
  const plain = await fetchPage("https://a.test/", fakeFetch({ "https://a.test/": () => page("<b>raw</b> text", "text/plain") }));
  assert.ok(plain.text.includes("<b>raw</b>"));

  const missing = await fetchPage("https://a.test/", fakeFetch({ "https://a.test/": () => page("gone", "text/html", 404) }));
  assert.equal(missing.ok, false);
  assert.match(missing.problem, /answered 404 after redirects/);

  const denied = await fetchPage("https://a.test/", fakeFetch({ "https://a.test/": () => page("no", "text/plain", 403, { "x-deny-reason": "host_not_allowed" }) }));
  assert.match(denied.problem, /403/);
  assert.match(denied.problem, /host_not_allowed/);
  assert.match(denied.problem, /needs network access/);

  const pdf = await fetchPage("https://a.test/", fakeFetch({ "https://a.test/": () => page("%PDF", "application/pdf") }));
  assert.match(pdf.problem, /not a text page/);

  const broken = await fetchPage("https://a.test/", { fetch: async () => { throw new TypeError("fetch failed"); } });
  assert.match(broken.problem, /^Could not reach https:\/\/a\.test\/ \(fetch failed\)/);

  // A server that never answers: the request is given up on after the timeout.
  const slow = await fetchPage("https://a.test/", {
    timeoutMs: 30,
    fetch: (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))),
  });
  assert.match(slow.problem, /Could not reach .*no answer within/);
});

test("each distinct source is fetched once; every unreachable source and every missing quote is reported", async () => {
  const check = {
    sources: [
      { title: "A", url: "https://a.test/" },
      { title: "B", url: "https://b.test/" },
      { title: "C", url: "https://c.test/" },
    ],
    voices: [
      { name: "Ann", words: "the first words are here", source: { title: "A", url: "https://a.test/" } },
      { name: "Bo", words: "these words are missing", source: { title: "A", url: "https://a.test/" } },
      { name: "Cy", words: "never read", source: { title: "C", url: "https://c.test/" } },
    ],
  };
  const { fetch, asked } = fakeFetch({
    "https://a.test/": () => page(html("<p>Here: the first words are here, and more.</p>")),
    "https://b.test/": () => page(html("<p>other</p>")),
    "https://c.test/": () => page("missing", "text/html", 404),
  });
  const result = await checkSources(check, { fetch });
  assert.deepEqual(asked, ["https://a.test/", "https://b.test/", "https://c.test/"]);
  assert.deepEqual(result.voicesFound, ["Ann"]);
  assert.equal(result.problems.length, 2);
  assert.ok(result.problems.some((problem) => /answered 404/.test(problem) && problem.includes("https://c.test/")));
  assert.ok(result.problems.some((problem) => problem.includes("The words of Bo were not found on https://a.test/")));
});

test("with the real fetch: a redirect to a page passes, a missing page fails, a closed port cannot be reached", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/moved") response.writeHead(302, { location: "/page" }).end();
    else if (request.url === "/page") response.writeHead(200, { "content-type": "text/html" }).end(html("<p>Words that stand here.</p>"));
    else response.writeHead(404, { "content-type": "text/html" }).end("nothing");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  try {
    const moved = await fetchPage(`http://127.0.0.1:${port}/moved`);
    assert.equal(moved.ok, true);
    assert.ok(wordsOnPage("words that stand here", moved.text));
    const gone = await fetchPage(`http://127.0.0.1:${port}/gone`);
    assert.match(gone.problem, /answered 404/);
  } finally {
    await new Promise((done) => server.close(done));
  }
  const closed = await fetchPage(`http://127.0.0.1:${port}/page`);
  assert.equal(closed.ok, false);
  assert.match(closed.problem, /Could not reach/);
});

// The routine's draft: psalm-46-10 written as the routine would, without its approval.
const others = onFile.filter((check) => check.slug !== "psalm-46-10");
const original = onFile.find((check) => check.slug === "psalm-46-10");
const { approved: _approved, ...draftBase } = original;
const draft = { ...draftBase, review: "ai-unreviewed" };
const psalm = original.verse;
const pagesFor = (check: typeof draft, skip: string[] = []) => {
  const table: Record<string, () => Response> = {};
  for (const source of check.sources) table[source.url] = () => page(html("<p>An ordinary source page.</p>"));
  // Voices can share a source: its page holds the words of each of them.
  const bodies = new Map<string, string>();
  for (const voice of check.voices) {
    const body = skip.includes(voice.name) ? "<p>This page says something else.</p>" : `<p>${voice.words.replace(/'/g, "&rsquo;")}</p>`;
    bodies.set(voice.source.url, (bodies.get(voice.source.url) ?? "") + body);
  }
  for (const [url, body] of bodies) table[url] = () => page(html(body));
  return table;
};
const run = (changes: Record<string, unknown> = {}, extra: Record<string, unknown> = {}, table = pagesFor(draft)) => {
  const spy = fakeFetch(table);
  const promise = verifyAll({ ...draft, ...changes }, { parse: parseContextCheck, bible, checks: others, queue: [psalm], today, model: "Test model", fetch: spy.fetch, ...extra });
  return { spy, promise };
};

test("a check whose sources open and whose voices are on their pages passes", async () => {
  const { spy, promise } = run();
  const result = await promise;
  assert.deepEqual(result.problems, []);
  assert.equal(result.check.review, "ai-unreviewed");
  assert.equal(result.check.model, "Test model");
  assert.equal(result.check.written, today);
  assert.equal("approved" in result.check, false);
  assert.equal(result.voicesFound.length, draft.voices.length);
  assert.equal(spy.asked.length, new Set(draft.sources.map((source: { url: string }) => source.url)).size);
});

test("it fails when a page lacks a voice's words or a source cannot be reached", async () => {
  const lacking = await run({}, {}, pagesFor(draft, ["Rashi"])).promise;
  assert.ok(lacking.problems.some((problem: string) => /words of Rashi were not found/.test(problem)));
  const table = pagesFor(draft);
  table[draft.sources[3].url] = () => page("gone", "text/html", 404);
  const unreachable = await run({}, {}, table).promise;
  assert.ok(unreachable.problems.some((problem: string) => problem.includes(draft.sources[3].url) && /404/.test(problem)));
  const nothing = await verifyAll(draft, { parse: parseContextCheck, bible, checks: others, queue: [psalm], today, model: "Test model", fetch: async () => { throw new TypeError("fetch failed"); } });
  assert.ok(nothing.problems.length >= draft.sources.length, "a run without network access cannot pass");
});

test("offline problems are reported without any fetch", async () => {
  const cases: [string, Record<string, unknown>, Record<string, unknown>, RegExp][] = [
    ["hook", { hook: "Be still, and know that I am God is spoken over raging nations and broken weapons." }, {}, /You know \.\.\. But did you know/],
    ["verse not in the queue", {}, { queue: [{ book: "john", chapter: 3, start: 16, end: 16 }] }, /not in scripts\/context-check-queue\.json/],
    ["already covered", {}, { checks: [...others, { ...original, slug: "psalm-46-other", hook: "x" }] }, /already covered by the context check psalm-46-other/],
    ["slug", { slug: "psalm-46-11" }, {}, /slug must be psalm-46-10/],
    ["one a day", {}, { checks: [...others, { ...others[0], slug: "later", review: "ai-unreviewed", written: today, verse: { book: "john", chapter: 3, start: 16, end: 16 } }] }, /one a day/],
    ["same hook", {}, { checks: [...others, { ...others[0], hook: draft.hook }] }, /same hook/],
    ["other quotes", { story: `${draft.story} He called it ‘the quiet’ once.` }, {}, /only quotation marks allowed/],
    ["misquoted Scripture", { around: `${draft.around} It also says “stand still and see”.` }, {}, /not in the WEB text/],
    ["one source", { sources: [draft.sources[2]], voices: draft.voices.map((voice: object) => ({ ...voice, source: draft.sources[2] })) }, {}, /at least two sources/],
  ];
  for (const [name, changes, extra, expected] of cases) {
    const { spy, promise } = run(changes, extra);
    const result = await promise;
    assert.ok(result.problems.some((problem: string) => expected.test(problem)), `${name}: ${result.problems.join(" | ")}`);
    assert.deepEqual(spy.asked, [], `${name}: no fetch`);
  }
});

test("prepareDraft makes a file of the usual shape and never keeps an approval", () => {
  const prepared = prepareDraft({ ...draft, review: "approved", approved: "2026-10-14", model: "In the file", extra: 1 }, { model: "From the flag", today });
  assert.equal(prepared.review, "ai-unreviewed");
  assert.equal(prepared.model, "From the flag");
  assert.equal(prepared.written, today);
  assert.ok(!("approved" in prepared) && !("extra" in prepared));
  assert.deepEqual(Object.keys(prepared).slice(0, 7), ["slug", "review", "drafted", "model", "written", "verse", "hook"]);
  assert.equal(prepareDraft({ ...draft, model: "In the file" }, { today }).model, "In the file");
  assert.equal(slugFor(psalm), "psalm-46-10");
  assert.equal(slugFor({ book: "1-corinthians", chapter: 13, start: 4, end: 7 }), "1-corinthians-13-4-7");
});

test("writeCheckFile writes one new file and never overwrites", () => {
  const dir = mkdtempSync(join(tmpdir(), "hfg-check-"));
  const path = writeCheckFile(dir, { slug: "one-1-1", a: 1 });
  assert.equal(readFileSync(path, "utf8"), '{\n  "slug": "one-1-1",\n  "a": 1\n}\n');
  assert.throws(() => writeCheckFile(dir, { slug: "one-1-1", a: 2 }), /already exists/);
  assert.deepEqual(readdirSync(dir), ["one-1-1.json"]);
});

test("the queue holds 60 valid, unique references in order, none covered by an approved check", () => {
  assert.equal(queue.length, 60);
  assert.deepEqual(queue[0], { book: "john", chapter: 3, start: 16, end: 16 });
  assert.equal(new Set(queue.map(slugFor)).size, 60);
  for (const ref of queue) {
    assert.deepEqual(refProblems(ref, web), [], slugFor(ref));
    assert.deepEqual(Object.keys(ref), ["book", "chapter", "start", "end"]);
    for (const check of onFile.filter((entry) => entry.review === "approved")) assert.ok(!covers(check, ref), `${slugFor(ref)} overlaps ${check.slug}`);
  }
  assert.ok(refProblems({ book: "john", chapter: 3, start: 99, end: 99 }, web).length);
  assert.ok(refProblems({ book: "nope", chapter: 1, start: 1, end: 1 }, web).length);
  // Covered verses are skipped.
  const covering = [{ ...onFile[0], verse: queue[0] }];
  assert.deepEqual(nextCandidates(queue, covering, 2), [queue[1], queue[2]]);
  assert.deepEqual(nextCandidates(queue, [], 1), [queue[0]]);
});

test("the approved checks are exactly the eleven the founder approved", () => {
  // A person who approves a check adds its slug here in the same change (docs/CONTEXT_CHECKS_ROUTINE.md).
  const approvedByFounder = [
    "1-corinthians-10-13", "1-timothy-6-10", "jeremiah-29-11", "john-8-32", "matthew-18-20", "matthew-5-39",
    "matthew-7-1", "philippians-4-13", "psalm-46-10", "revelation-3-20", "romans-8-28",
  ];
  const approved = onFile.filter((check) => check.review === "approved");
  assert.deepEqual(approved.map((check) => check.slug).sort(), [...approvedByFounder].sort());
  for (const check of approved) assert.match(check.approved, /^\d{4}-\d{2}-\d{2}$/, check.slug);
  // The routine only ever writes this status.
  for (const check of onFile.filter((entry) => !approvedByFounder.includes(entry.slug))) {
    assert.equal(check.review, "ai-unreviewed", check.slug);
    assert.equal(check.approved, undefined, check.slug);
    assert.equal(routineProblems(check, { checks: onFile, queue: [check.verse], today: check.written }).filter((problem) => !/one a day/.test(problem)).length, 0, check.slug);
  }
});

// The command line, with a misquoted fixture. Nothing may reach the network: a proxy that
// nothing listens on makes any request fail with "Could not reach", which must not appear.
const cli = (args: string[], env: Record<string, string> = {}) => {
  const run = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/context-checks.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1", HTTPS_PROXY: "http://127.0.0.1:9", HTTP_PROXY: "http://127.0.0.1:9", ...env },
  });
  return { status: run.status, out: `${run.stdout}${run.stderr}` };
};
const filesNow = () => readdirSync(checksDir).sort();

test("the command line refuses what it should and writes nothing for a misquoted check", () => {
  assert.equal(cli([]).status, 1);
  assert.match(cli([]).out, /Usage/);
  const option = cli(["status", "--force"]);
  assert.equal(option.status, 1);
  assert.match(option.out, /Unknown option --force/);
  assert.equal(cli(["verify", "x.json", "--skip-network"]).status, 1);
  assert.equal(cli(["status"]).status, 0);
  assert.match(cli(["status"]).out, /approved/);
  const verse = cli(["text", "john", "3"]);
  assert.equal(verse.status, 0);
  assert.match(verse.out, /^16 For God so loved the world/m);

  const dir = mkdtempSync(join(tmpdir(), "hfg-cli-"));
  const file = join(dir, "bad.json");
  writeFileSync(file, JSON.stringify({ ...draft, around: `${draft.around} It also says “stand still and see”.` }));
  const before = filesNow();
  const verify = cli(["verify", file, "--model", "Test model"]);
  assert.equal(verify.status, 1);
  assert.match(verify.out, /not in the WEB text/);
  assert.match(verify.out, /Nothing may be published/);
  assert.doesNotMatch(verify.out, /Could not reach/);
  const add = cli(["add", file, "--model", "Test model"]);
  assert.equal(add.status, 1);
  assert.match(add.out, /Nothing was written/);
  assert.doesNotMatch(add.out, /Could not reach/);
  assert.equal(cli(["add", file]).status, 1, "add needs --model");
  assert.deepEqual(filesNow(), before, "no file appeared");
});
