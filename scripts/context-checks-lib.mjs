// The logic behind scripts/context-checks.mjs, kept free of side effects so tests/context-routine.test.ts
// can run it offline. Rules and background: docs/CONTEXT_CHECKS_ROUTINE.md.
//
// What these functions guarantee before a context check is published without anyone reading it:
//   - every source URL opens (HTTP 200 after redirects, a text page), otherwise it is a failure;
//   - every quoted person's words are found on the page their source links to;
//   - the verse is one the queue names, not covered by another check, one new check a day.
// Scripture quotations are checked against the WEB text by parseContextCheck (site/src/lib/content.ts).
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Text made comparable: quote marks, dashes, case and every kind of whitespace stop mattering.
 * Whitespace is removed entirely so a line break or a tag between two words cannot hide a match.
 */
export function normalizeForMatch(text) {
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[­​-‍﻿]/g, "")
    .replace(/\s+/g, "");
}

const entities = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  ndash: "–", mdash: "—", hellip: "…",
};

/** The words of an HTML page: scripts, styles and comments dropped, tags turned into spaces. */
export function htmlToText(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name) => {
      if (name[0] === "#") {
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
      }
      return entities[name.toLowerCase()] ?? whole;
    });
}

/** True when the words stand on the page, ignoring quote marks, dashes, case and whitespace. */
export function wordsOnPage(words, pageText) {
  const wanted = normalizeForMatch(words);
  return wanted.length > 0 && normalizeForMatch(pageText).includes(wanted);
}

const maxBytes = 15 * 1024 * 1024;
const textTypes = ["text/html", "application/xhtml+xml", "text/plain"];

function decode(bytes, contentType) {
  let charset = /charset=["']?([^;"'\s]+)/i.exec(contentType)?.[1];
  // A page without a charset in its headers may name one in its first lines.
  charset ??= /<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder("latin1").decode(bytes.subarray(0, 2048)))?.[1];
  try {
    return new TextDecoder(charset ?? "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/**
 * Opens one source page. A page counts only when it answers 200 after redirects with a text
 * type. Returns { ok: true, text } (HTML already turned into text) or { ok: false, problem }.
 */
export async function fetchPage(url, { fetch: fetchFn = globalThis.fetch, timeoutMs = 20000 } = {}) {
  let response;
  try {
    response = await fetchFn(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "HisFullGloryContextCheck/1.0 (+https://hisfullglory.com)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    const cause = timedOut ? `no answer within ${Math.round(timeoutMs / 1000)} seconds` : (error?.cause?.code ?? error?.message ?? "unknown error");
    return { ok: false, problem: `Could not reach ${url} (${cause}).` };
  }
  const drop = () => response.body?.cancel?.().catch?.(() => {});
  if (response.status !== 200) {
    drop();
    const denied = response.headers.get("x-deny-reason");
    const hint = denied
      ? ` The network refused this site (${denied}); the routine's environment needs network access to it.`
      : "";
    return { ok: false, problem: `${url} answered ${response.status} after redirects; a source must open with 200.${hint}` };
  }
  const contentType = response.headers.get("content-type") ?? "";
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (!textTypes.includes(type)) {
    drop();
    return { ok: false, problem: `${url} is not a text page (${type || "no content type"}). Use a page that opens as text.` };
  }
  try {
    const chunks = [];
    let size = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false, problem: `${url} is larger than 15 MB; use a smaller page.` };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.length;
    }
    const body = decode(bytes, contentType);
    return { ok: true, text: type === "text/plain" ? body : htmlToText(body) };
  } catch (error) {
    return { ok: false, problem: `Could not reach ${url} (${error?.cause?.code ?? error?.message ?? "the page broke off"}).` };
  }
}

/**
 * Opens every distinct source URL once, one after the other, and looks for each voice's words
 * on the page its own source links to. Returns { problems, opened, voicesFound }.
 */
export async function checkSources(check, options = {}) {
  const sources = check.sources ?? [];
  const voices = check.voices ?? [];
  const urls = [...new Set([...sources.map((source) => source.url), ...voices.map((voice) => voice.source?.url)].filter(Boolean))];
  const pages = new Map();
  const problems = [];
  for (const url of urls) {
    const page = await fetchPage(url, options);
    if (page.ok) pages.set(url, page.text);
    else problems.push(page.problem);
  }
  const voicesFound = [];
  for (const voice of voices) {
    const page = pages.get(voice.source?.url);
    if (page === undefined) continue; // the page itself is already reported above
    if (wordsOnPage(voice.words, page)) voicesFound.push(voice.name);
    else
      problems.push(
        `The words of ${voice.name} were not found on ${voice.source.url}. Quote only words that stand on that page, as one continuous run without ellipses, or drop the voice.`,
      );
  }
  return { problems, opened: [...pages.keys()], voicesFound };
}

/** "psalm-46-10", "john-3-16", "1-corinthians-13-4-7": the slug the file and address of a verse use. */
export function slugFor(ref) {
  const book = ref.book === "psalms" ? "psalm" : ref.book;
  return `${book}-${ref.chapter}-${ref.start}${ref.end > ref.start ? `-${ref.end}` : ""}`;
}

const sameRef = (a, b) => a?.book === b?.book && a?.chapter === b?.chapter && a?.start === b?.start && a?.end === b?.end;

/** True when the check's verse overlaps the reference (same chapter, overlapping verses). */
export function covers(check, ref) {
  const verse = check.verse;
  return verse.book === ref.book && verse.chapter === ref.chapter && verse.start <= ref.end && ref.start <= verse.end;
}

/** The first references of the queue that no check on file covers. */
export function nextCandidates(queue, checks, count = 3) {
  return queue.filter((ref) => !checks.some((check) => covers(check, ref))).slice(0, count);
}

/** What is wrong with a reference, against the raw public/bible/web.json. Empty when it is fine. */
export function refProblems(ref, bible) {
  const book = bible.books.find((candidate) => candidate.slug === ref?.book);
  if (!book) return [`unknown book ${ref?.book}`];
  const chapter = book.chapters.find((candidate) => candidate.number === ref.chapter);
  if (!chapter) return [`${ref.book} has no chapter ${ref.chapter}`];
  if (!Number.isInteger(ref.start) || !Number.isInteger(ref.end) || ref.end < ref.start)
    return [`${ref.book} ${ref.chapter}: start and end must be verse numbers in order`];
  const verses = chapter.verses.filter((verse) => verse.number >= ref.start && verse.number <= ref.end && !verse.omitted);
  return verses.length === ref.end - ref.start + 1 ? [] : [`${ref.book} ${ref.chapter}:${ref.start}-${ref.end} is not all in the WEB text`];
}

/**
 * The rules for a check that is published without review, beyond what the build checks.
 * `checks` are the other checks on file; a check with the same slug is ignored, so the same
 * rules also pass on the file after `add` has written it.
 */
export function routineProblems(raw, { checks, queue, today }) {
  const problems = [];
  if (raw?.review !== "ai-unreviewed") problems.push('review must be "ai-unreviewed"');
  if (raw?.drafted !== "ai") problems.push('drafted must be "ai"');
  if (raw?.approved !== undefined) problems.push("an AI-unreviewed check has no approved date");
  if (typeof raw?.model !== "string" || !raw.model.trim()) problems.push("name the model that wrote it with --model");
  const others = checks.filter((check) => check.slug !== raw?.slug);
  if (raw?.verse && raw.slug !== slugFor(raw.verse)) problems.push(`the slug must be ${slugFor(raw.verse)}, the slug of its verse`);
  if (!queue.some((ref) => sameRef(ref, raw?.verse))) problems.push("the verse is not in scripts/context-check-queue.json; write about the verse `next` names");
  const covering = raw?.verse && others.find((check) => covers(check, raw.verse));
  if (covering) problems.push(`the verse is already covered by the context check ${covering.slug}`);
  if (others.some((check) => check.review === "ai-unreviewed" && check.written === today))
    problems.push(`an AI-unreviewed check was already written on ${today}; one a day`);
  const hook = typeof raw?.hook === "string" ? raw.hook : "";
  if (!hook.startsWith("You know") || !hook.includes("But did you know"))
    problems.push('the hook must read "You know ... But did you know ..."');
  // The hook is the page description, and every page needs its own.
  if (hook && others.some((check) => check.hook === hook)) problems.push("another check has the same hook; every page needs its own");
  return problems;
}

const keyOrder = ["slug", "review", "drafted", "model", "written", "verse", "hook", "story", "storyStatus", "sources", "voices", "moment", "around", "after", "readings", "argued", "point", "lesson", "echoes", "basis"];

/** The draft as a file would hold it: review ai-unreviewed, written today, keys in the usual order. */
export function prepareDraft(draft, { model, today }) {
  const filled = {
    ...draft,
    slug: draft?.slug ?? (draft?.verse ? slugFor(draft.verse) : undefined),
    review: "ai-unreviewed",
    drafted: "ai",
    written: today,
    model: model ?? draft?.model,
  };
  delete filled.approved;
  return Object.fromEntries(keyOrder.filter((key) => filled[key] !== undefined).map((key) => [key, filled[key]]));
}

/**
 * Every check that decides whether a draft may be published: the build's own parser (offline),
 * the routine rules, and then the network checks. Offline problems are returned without any fetch.
 */
export async function verifyAll(draft, { parse, bible, checks, queue, today, model, fetch, timeoutMs }) {
  const check = prepareDraft(draft, { model, today });
  const problems = [];
  try {
    parse(check, check.slug, bible);
  } catch (error) {
    problems.push(error.message);
  }
  problems.push(...routineProblems(check, { checks, queue, today }));
  if (problems.length) return { check, problems, opened: [], voicesFound: [] };
  const online = await checkSources(check, { fetch, timeoutMs });
  return { check, ...online };
}

/** Writes <slug>.json into the folder and refuses to overwrite a file. */
export function writeCheckFile(dir, check) {
  const path = join(dir, `${check.slug}.json`);
  if (existsSync(path)) throw new Error(`${path} already exists; a check is never overwritten.`);
  writeFileSync(path, JSON.stringify(check, null, 2) + "\n", { flag: "wx" });
  return path;
}
