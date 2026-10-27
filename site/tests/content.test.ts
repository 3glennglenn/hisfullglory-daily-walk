// Checks the topic pages, articles and context checks on file, and that drafts were not
// built (run `npm run build` first; `npm run check` does both). Context checks may also be
// "ai-unreviewed": built, and labelled as context written by AI. With SHOW_DRAFTS=1 set
// for both the build and the tests, drafts count as shown, so their pages can be checked too.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { launchTopics } from "../../src/topics/graph.ts";
import { library } from "../src/lib/bible.ts";
import { newestFirst, publicationDate, splitHook } from "../src/lib/editorial.ts";
import {
  aiUnreviewedCardLabel,
  aiUnreviewedLabel,
  arguedHeading,
  checkParts,
  content,
  echoesHeading,
  editorialNote,
  featuredChecks,
  parseArticle,
  parseContextCheck,
  parseTopic,
  publishedArticles,
  publishedChecks,
  publishedTopics,
  refLabel,
  showDrafts,
  storyStatuses,
  verses,
  withVoices,
} from "../src/lib/content.ts";

const { bible } = library();
const raw = (folder: string, name: string) =>
  JSON.parse(readFileSync(`content/${folder}/${name}.json`, "utf8"));
const page = (address: string) => `dist${address}/index.html`;
/** A built page as a reader sees its words: tags removed, entities turned back. */
const words = (address: string) =>
  readFileSync(page(address), "utf8")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ");
const flat = (value: string) => value.replace(/^- /gm, "").replace(/\s+/g, " ").trim();

test("every topic page and article on file is valid", () => {
  const { topics, articles } = content(); // throws on the first invalid file
  assert.ok(topics.length <= launchTopics.length);
  for (const item of [...topics, ...articles]) assert.match(item.review, /^(draft|approved)$/);
});

test("a misquoted verse, a reason without a quotation or a wrong reference is rejected", () => {
  const topic = raw("topics", "prayer");
  const withReason = (reason: string) => ({
    ...topic,
    passages: [{ ...topic.passages[0], reason }, ...topic.passages.slice(1)],
  });
  assert.throws(
    () => parseTopic(withReason("Jesus says the Father “knows everything you need before you ask”, which is close."), "prayer", bible),
    /not in the WEB text/,
  );
  assert.throws(
    () => parseTopic(withReason("A reason that explains the passage in our own words and never quotes it."), "prayer", bible),
    /must quote the passage/,
  );
  assert.throws(
    () => parseTopic({ ...topic, passages: [{ ...topic.passages[0], end: 999 }, ...topic.passages.slice(1)] }, "prayer", bible),
    /not all in the WEB text/,
  );
  assert.throws(() => parseTopic({ ...topic, id: "money" }, "money", bible), /launch topic/);
  assert.throws(() => parseTopic({ ...topic, review: "published" }, "prayer", bible), /review/);
  // Approval is recorded with its date, and a draft cannot carry one.
  assert.throws(() => parseTopic({ ...topic, review: "approved", approved: undefined }, "prayer", bible), /date of approval/);
  assert.throws(() => parseTopic({ ...topic, review: "draft", approved: "2026-10-13" }, "prayer", bible), /date of approval/);

  const article = raw("articles", "how-jesus-taught-prayer");
  const withText = (text: string) => ({
    ...article,
    sections: [{ ...article.sections[0], text }, ...article.sections.slice(1)],
  });
  assert.throws(
    () => parseArticle(withText("Many people know the prayer in older words: “Our Father, who art in heaven, hallowed be thy name”."), article.slug, bible),
    /not in the WEB text/,
  );
  assert.throws(
    () => parseArticle(withText("A section — with an em dash — that is otherwise long enough to pass the length check for a section."), article.slug, bible),
    /em dash/,
  );
  assert.throws(() => parseArticle({ ...article, sources: [] }, article.slug, bible), /source/);
});

test("only approved topic pages and articles are built", () => {
  const { topics, articles } = content();
  const shown = (item: { review: string }) => item.review === "approved" || showDrafts();
  assert.deepEqual(publishedTopics().map((topic) => topic.id).sort(), topics.filter(shown).map((topic) => topic.id).sort());
  for (const topic of topics)
    assert.equal(existsSync(page(`/topics/${topic.id}`)), shown(topic), `/topics/${topic.id}`);
  for (const article of articles)
    assert.equal(existsSync(page(`/articles/${article.slug}`)), shown(article), `/articles/${article.slug}`);
  assert.equal(existsSync(page("/topics")), topics.some(shown), "/topics");
  assert.equal(existsSync(page("/articles")), articles.some(shown), "/articles");
});

test("a built topic page or article shows its text as written and says how it was made", () => {
  for (const topic of publishedTopics()) {
    const text = words(`/topics/${topic.id}`);
    assert.ok(text.includes(topic.intro), `${topic.id}: intro`);
    for (const passage of topic.passages) {
      assert.ok(text.includes(refLabel(passage)), `${topic.id}: ${refLabel(passage)}`);
      assert.ok(text.includes(passage.reason), `${topic.id}: reason for ${refLabel(passage)}`);
    }
    if (topic.care) assert.ok(text.includes(topic.care), `${topic.id}: care note`);
    assert.ok(text.includes("Written with the help of an AI model") === (topic.drafted === "ai"), `${topic.id}: how it was made`);
    assert.equal(text.includes("Draft. Not approved"), topic.review === "draft", `${topic.id}: draft label`);
  }
  for (const article of publishedArticles()) {
    const text = words(`/articles/${article.slug}`);
    for (const section of article.sections) {
      assert.ok(text.includes(section.heading), `${article.slug}: ${section.heading}`);
      for (const paragraph of section.text.split("\n\n"))
        assert.ok(text.includes(flat(paragraph)), `${article.slug}: ${paragraph.slice(0, 40)}`);
    }
    for (const ref of article.basis) assert.ok(text.includes(refLabel(ref)), `${article.slug}: ${refLabel(ref)}`);
    for (const source of article.sources) assert.ok(text.includes(source.title), `${article.slug}: ${source.title}`);
    assert.equal(text.includes("Draft. Not approved"), article.review === "draft", `${article.slug}: draft label`);
  }
});

test("a context check must quote the verse or the passages around it exactly", () => {
  const item = raw("context-checks", "jeremiah-29-11");
  assert.throws(
    () => parseContextCheck({ ...item, around: "The verse before it promises that “after seventy years in Babylon I will visit you”, which is close to the text." }, item.slug, bible),
    /not in the WEB text/,
  );
  assert.throws(() => parseContextCheck({ ...item, basis: [] }, item.slug, bible), /passages around/);
  assert.throws(() => parseContextCheck({ ...item, hook: "Too short." }, item.slug, bible), /characters/);
  assert.throws(
    () => parseContextCheck({ ...item, verse: { ...item.verse, chapter: 99 } }, item.slug, bible),
    /unknown chapter/,
  );
  // A story from outside the Bible has to name where it comes from.
  assert.throws(() => parseContextCheck({ ...item, storyStatus: "history", sources: [] }, item.slug, bible), /needs its sources/);
  assert.throws(() => parseContextCheck({ ...item, storyStatus: "reading", sources: [] }, item.slug, bible), /needs its sources/);
  assert.throws(() => parseContextCheck({ ...item, storyStatus: "hearsay" }, item.slug, bible), /storyStatus/);
  // Someone else's words need a source, and may not borrow the marks reserved for Scripture.
  const voice = { name: "A reader", about: "someone who is quoted here", words: "This verse carried me through a hard year." };
  assert.throws(() => parseContextCheck({ ...item, voices: [voice] }, item.slug, bible), /needs a source/);
  assert.throws(
    () => parseContextCheck({ ...item, voices: [{ ...voice, words: "He called it “hope and a future” in his letter.", source: { title: "A page", url: "https://example.org/" } }] }, item.slug, bible),
    /curly double quotes/,
  );
  assert.throws(
    () => parseContextCheck({ ...item, story: `${item.story} Jeremiah then said: “You will all be home by spring.”` }, item.slug, bible),
    /not in the WEB text/,
  );
});

test("a context check tells what happened next, what it means for you, and other verses that say it too", () => {
  // The founder's request of 2026-10-27, after his John 21 video: the whole arc, a lesson, other verses.
  const item = raw("context-checks", "john-21-15-17");
  const parse = (changes: Record<string, unknown>) => () => parseContextCheck({ ...item, ...changes }, item.slug, bible);
  assert.doesNotThrow(parse({}));
  assert.throws(parse({ after: undefined }), /after: must be text/);
  assert.throws(parse({ lesson: "Too short." }), /lesson: must be 200 to 1400/);
  assert.throws(parse({ echoes: undefined }), /2 to 4 echoes/);
  assert.throws(parse({ echoes: [item.echoes[0]] }), /2 to 4 echoes/);
  assert.throws(parse({ echoes: [...item.echoes, item.echoes[0]] }), /2 to 4 echoes/);
  // An echo is short, so a page can show all of it, and it is another verse.
  const [first, second] = item.echoes;
  assert.throws(parse({ echoes: [{ ...first, ref: { book: "psalms", chapter: 103, start: 8, end: 12 } }, second] }), /at most three verses/);
  assert.throws(parse({ echoes: [{ ...first, ref: item.verse }, second] }), /not the verse itself/);
  assert.throws(parse({ echoes: [{ ...first, note: "Too short." }, second] }), /echo 1 note: must be 40 to 280/);
  // A note quotes only its own verse, word for word.
  assert.throws(parse({ echoes: [{ ...first, note: "The psalm answers Jesus, who said “Feed my lambs.” on the beach, with mercy." }, second] }), /not in the WEB text of psalms 103:12/);
  // The new parts may quote an echo, and nothing that is not in the WEB text.
  assert.doesNotThrow(parse({ lesson: `${item.lesson} Remember: “As far as the east is from the west”.` }));
  assert.throws(parse({ lesson: `${item.lesson} The Bible says “God helps those who help themselves”.` }), /not in the WEB text/);
  assert.throws(parse({ after: `${item.after} He said ‘never again’.` }), /only quotation marks allowed/);
});

test("people quoted in “Who has argued over it” are real voices, each with its source", () => {
  const item = raw("context-checks", "matthew-5-39");
  const parse = (changes: Record<string, unknown>) => () => parseContextCheck({ ...item, ...changes }, item.slug, bible);
  assert.ok(item.argued && item.voices.some((voice: { id?: string }) => voice.id), "the example on file uses the part");
  assert.throws(parse({ argued: `${item.argued} Someone else said: [[nobody]]` }), /names no voice/);
  assert.throws(parse({ argued: item.argued.replace("[[tolstoy]]", "") }), /quoted exactly once/);
  assert.throws(parse({ argued: `${item.argued} [[tolstoy]]` }), /quoted exactly once/);
  assert.throws(parse({ sources: item.sources.filter((source: { url: string }) => !source.url.includes("tolstoy")) }), /also be in sources/);
  // Words of people go through a voice; quotation marks in the text stay for Scripture.
  assert.throws(parse({ argued: `${item.argued} He said "never".` }), /curly quotes/);
  assert.throws(parse({ argued: `${item.argued} Jesus said “never hit back”.` }), /not in the WEB text/);
});

/** psalm-46-10 as the routine would write it: AI-unreviewed, no approval, the model named. */
function unreviewed(changes: Record<string, unknown> = {}) {
  const { approved, ...rest } = raw("context-checks", "psalm-46-10");
  return { ...rest, review: "ai-unreviewed", model: "Test model", ...changes };
}
const parseUnreviewed = (changes: Record<string, unknown>) => () =>
  parseContextCheck(unreviewed(changes), "psalm-46-10", bible);

test("a context check may be AI-unreviewed, with rules that make up for the missing review", () => {
  const item = unreviewed();
  const parsed = parseContextCheck(item, "psalm-46-10", bible);
  assert.equal(parsed.review, "ai-unreviewed");
  assert.equal(parsed.model, "Test model");
  // The approved checks parse as before, without a model.
  assert.equal("model" in parseContextCheck(raw("context-checks", "psalm-46-10"), "psalm-46-10", bible), false);
  assert.throws(parseUnreviewed({ approved: "2026-10-16" }), /date of approval/);
  assert.throws(parseUnreviewed({ drafted: "human" }), /drafted "ai"/);
  assert.throws(parseUnreviewed({ model: undefined }), /names the model/);
  assert.throws(parseUnreviewed({ model: "x" }), /3 to 60/);
  // One source that every voice uses, so only the number of sources is wrong.
  const spurgeon = item.sources[2];
  assert.throws(
    parseUnreviewed({ sources: [spurgeon], voices: item.voices.map((voice: Record<string, unknown>) => ({ ...voice, source: spurgeon })) }),
    /at least two sources/,
  );
  // A voice without an id is shown on its own card, and its source must be listed too.
  const stranger = { name: "A reader", about: "someone who is quoted here", words: "This verse carried me through a hard year.", source: { title: "A page", url: "https://example.org/page" } };
  assert.throws(parseUnreviewed({ voices: [...item.voices, stranger] }), /also be in sources/);
  assert.doesNotThrow(() => parseContextCheck({ ...unreviewed(), review: "approved", approved: "2026-10-16", model: undefined, voices: [...item.voices, stranger] }, "psalm-46-10", bible));
  // People's words go in voices: no other quotation marks in the text.
  assert.throws(parseUnreviewed({ story: `${item.story} He called it ‘the quiet’ once.` }), /only quotation marks allowed/);
  assert.throws(parseUnreviewed({ readings: `${item.readings} People say 'be still' today.` }), /only quotation marks allowed/);
  assert.throws(parseUnreviewed({ argued: `${item.argued} Spurgeon wrote ‘wait’.` }), /only quotation marks allowed/);
  assert.throws(parseUnreviewed({ hook: item.hook.replace("But did you know", "But »did you know«") }), /only quotation marks allowed/);
  assert.doesNotThrow(parseUnreviewed({ readings: `${item.readings} People don't always stop.` }));
  // A curly quote that never closes would let anything follow it; a single quote inside a WEB quotation is WEB text.
  assert.throws(parseUnreviewed({ story: `${item.story} He wrote “wait` }), /only quotation marks allowed/);
  const nested = { book: "john", chapter: 3, start: 7, end: 7 };
  assert.doesNotThrow(parseUnreviewed({ basis: [...item.basis, nested], around: `${item.around} Elsewhere: “Don’t marvel that I said to you, ‘You must all be born anew.’”` }));
  // Scripture quotations are still checked against the WEB text, and no other translation is named.
  assert.throws(parseUnreviewed({ around: `${item.around} It says “stand still and see” elsewhere.` }), /not in the WEB text/);
  assert.throws(parseUnreviewed({ point: `${item.point} Some read the NIV differently.` }), /not public domain/);
  // Topic pages and articles cannot be AI-unreviewed.
  assert.throws(() => parseTopic({ ...raw("topics", "prayer"), review: "ai-unreviewed", approved: undefined }, "prayer", bible), /review/);
  const article = raw("articles", "how-jesus-taught-prayer");
  assert.throws(() => parseArticle({ ...article, review: "ai-unreviewed", approved: undefined }, article.slug, bible), /review/);
});

test("the note under a page says how it was made, and an AI-unreviewed page says an AI wrote the context, not the Bible", () => {
  const made = "Scripture quotations are checked against the World English Bible.";
  assert.equal(editorialNote("approved", "ai"), `Written with the help of an AI model. ${made} Approved by HisFullGlory. Not reviewed by a theological reader.`);
  assert.equal(editorialNote("approved", "human"), `Written by HisFullGlory. ${made} Approved by HisFullGlory. Not reviewed by a theological reader.`);
  assert.equal(editorialNote("draft", "ai"), `Written with the help of an AI model. ${made} Not approved yet.`);
  assert.equal(editorialNote("draft", "human"), `Written by HisFullGlory. ${made} Not approved yet.`);
  for (const label of [aiUnreviewedLabel, aiUnreviewedCardLabel]) {
    assert.match(label, /written by AI/i);
  }
  const note = editorialNote("ai-unreviewed", "ai");
  assert.match(note, /written by an AI model/);
  assert.match(note, /can contain mistakes/);
  for (const line of [aiUnreviewedLabel, aiUnreviewedCardLabel, note]) {
    assert.ok(!/not checked by a person/i.test(line), line + ": the founder took that sentence out (2026-10-20)");
    assert.ok(!line.includes("—") && !line.includes("!"), line);
  }
});

test("drafts are never built; approved and AI-unreviewed context checks are, and the latter say so", () => {
  const shown = (item: { review: string }) => item.review !== "draft" || showDrafts();
  const { checks } = content();
  for (const item of checks)
    assert.equal(existsSync(page(`/context-checks/${item.slug}`)), shown(item), `/context-checks/${item.slug}`);
  assert.equal(existsSync(page("/context-checks")), checks.some(shown), "/context-checks");
  for (const item of publishedChecks()) {
    const text = words(`/context-checks/${item.slug}`);
    assert.ok(text.includes(item.hook), `${item.slug}: hook`);
    for (const verse of verses(item.verse)) assert.ok(text.includes(verse.text), `${item.slug}: the verse itself`);
    for (const [name, heading] of checkParts) {
      assert.ok(text.includes(heading), `${item.slug}: ${heading}`);
      for (const paragraph of item[name].split("\n\n"))
        assert.ok(text.includes(flat(paragraph)), `${item.slug}: ${name}, ${paragraph.slice(0, 40)}`);
    }
    for (const ref of item.basis) assert.ok(text.includes(refLabel(ref)), `${item.slug}: ${refLabel(ref)}`);
    // Other verses that say it too: each with its WEB text, its reference and its note, after the lesson.
    assert.ok(text.includes(echoesHeading), `${item.slug}: ${echoesHeading}`);
    for (const echo of item.echoes) {
      assert.ok(text.includes(refLabel(echo.ref)) && text.includes(flat(echo.note)), `${item.slug}: echo ${refLabel(echo.ref)}`);
      for (const verse of verses(echo.ref)) assert.ok(text.includes(verse.text), `${item.slug}: the text of ${refLabel(echo.ref)}`);
    }
    {
      const html = readFileSync(page(`/context-checks/${item.slug}`), "utf8");
      const at = (name: string) => html.indexOf(`data-part="${name}"`);
      assert.ok(at("around") < at("after") && at("after") < at("readings"), `${item.slug}: what happened next follows the text around it`);
      assert.ok(at("point") < at("lesson") && at("lesson") < at("echoes"), `${item.slug}: the lesson and the other verses come last`);
    }
    // The story is shown as written, with the line that says what it rests on and its sources.
    for (const paragraph of item.story.split("\n\n"))
      assert.ok(text.includes(flat(paragraph)), `${item.slug}: story, ${paragraph.slice(0, 40)}`);
    assert.ok(text.includes(storyStatuses[item.storyStatus]), `${item.slug}: what the story rests on`);
    for (const source of item.sources) assert.ok(text.includes(source.title), `${item.slug}: ${source.title}`);
    // Other people's words are shown word for word, with their name and a link to the source.
    const html = readFileSync(page(`/context-checks/${item.slug}`), "utf8");
    for (const voice of item.voices) {
      assert.ok(text.includes(voice.words) && text.includes(voice.name), `${item.slug}: ${voice.name}`);
      assert.ok(html.includes(`href="${voice.source.url}"`), `${item.slug}: source of ${voice.name}`);
    }
    // Voices quoted in "Who has argued over it" stand in its text, not again as cards.
    const cards = html.match(/class="card voice"/g)?.length ?? 0;
    assert.equal(cards, item.voices.filter((voice) => !voice.id).length, `${item.slug}: voice cards`);
    if (item.argued) {
      assert.ok(text.includes(arguedHeading), `${item.slug}: ${arguedHeading}`);
      // A quotation ends in a tag, which the text of the page turns into a space before
      // the punctuation that follows it.
      const tight = (value: string) => value.replace(/\s+([,.;:!?])/g, "$1");
      for (const paragraph of item.argued.split("\n\n")) {
        const told = withVoices(paragraph, item.voices).map((piece) => (typeof piece === "string" ? piece : piece.words)).join("");
        assert.ok(tight(text).includes(tight(flat(told))), `${item.slug}: argued, ${paragraph.slice(0, 40)}`);
      }
      for (const voice of item.voices.filter((entry) => entry.id))
        assert.ok(html.includes(`<q cite="${voice.source.url}"`), `${item.slug}: ${voice.name} quoted in the story`);
      const at = (name: string) => html.indexOf(`data-part="${name}"`);
      assert.ok(at("readings") < at("argued") && at("argued") < at("point"), `${item.slug}: argued follows the readings`);
    }
    assert.equal(text.includes("Draft. Not approved"), item.review === "draft", `${item.slug}: draft label`);
    // How it was made: a page nobody has checked says so at the top and in its closing note.
    assert.equal(text.includes(aiUnreviewedLabel), item.review === "ai-unreviewed", `${item.slug}: AI-unreviewed label`);
    assert.ok(text.includes(editorialNote(item.review, item.drafted)), `${item.slug}: closing note`);
    assert.equal(html.includes('<meta name="robots" content="noindex"'), item.review === "draft", `${item.slug}: noindex`);
    if (item.review === "ai-unreviewed") {
      const at = (needle: string) => html.indexOf(needle);
      assert.ok(at('role="note"') > -1 && at(aiUnreviewedLabel) < at("<h1"), `${item.slug}: the label stands above the title`);
    }
    // The chapter page of the verse points to its context check.
    const chapter = readFileSync(page(`/bible/${item.verse.book}/${item.verse.chapter}`), "utf8");
    assert.ok(chapter.includes(`href="/context-checks/${item.slug}"`), `${item.slug}: link on the chapter page`);
  }
});

test("lists of context checks say which ones no person has checked", () => {
  // The founder decided on 2026-10-19 (D-06, "Ja, elke dag de nieuwste") that the front door
  // shows the newest check, AI-unreviewed ones included, always labelled. This replaces the
  // earlier assertion that the front door leaves them out. The label is asserted here on the
  // overview and the chapter pages; the home page itself is asserted in redesign.test.ts.
  const unchecked = publishedChecks().filter((item) => item.review === "ai-unreviewed");
  const count = (html: string, needle: string) => html.split(needle).length - 1;
  // The overview labels every such row, and its bookcase adds one legend line when one of the six
  // newest spines carries the AI badge (W5).
  const legend = featuredChecks().slice(0, 6).some((item) => item.review === "ai-unreviewed") ? 1 : 0;
  if (existsSync(page("/context-checks")))
    assert.equal(count(readFileSync(page("/context-checks"), "utf8"), aiUnreviewedCardLabel), unchecked.length + legend, "overview");
  // Every chapter page that lists an AI-unreviewed check shows the label once per such check.
  for (const item of publishedChecks()) {
    const { book, chapter } = item.verse;
    const html = readFileSync(page(`/bible/${book}/${chapter}`), "utf8");
    const here = unchecked.filter((entry) => entry.verse.book === book && entry.verse.chapter === chapter).length;
    assert.equal(count(html, aiUnreviewedCardLabel), here, `/bible/${book}/${chapter}`);
  }
});

test("the front door features the published checks newest first, AI-unreviewed ones included (D-06)", () => {
  const featured = featuredChecks();
  const published = publishedChecks();
  assert.equal(featured.length, published.length, "every published check is featured");
  for (const item of published.filter((entry) => entry.review === "ai-unreviewed"))
    assert.ok(featured.some((entry) => entry.slug === item.slug), `${item.slug}: AI-unreviewed checks lead the front door too`);
  for (let i = 1; i < featured.length; i++)
    assert.ok(newestFirst(featured[i - 1], featured[i]) < 0, `${featured[i - 1].slug} before ${featured[i].slug}`);
  const newest = featured[0];
  assert.ok(
    published.every((item) => publicationDate(item) <= publicationDate(newest)),
    "nothing on file is published later than the first",
  );
  // An approved check keeps the date of approval; an AI-unreviewed one never has one.
  for (const item of content().checks)
    assert.equal(item.approved !== undefined, item.review === "approved", `${item.slug}: approved date`);
});

test("the newest-check rule: approved date for approved checks, written date for AI-unreviewed ones", () => {
  const check = (slug: string, review: "approved" | "ai-unreviewed", written: string, approved?: string) => ({
    slug,
    review,
    written,
    ...(approved === undefined ? {} : { approved }),
  });
  assert.equal(publicationDate(check("a", "approved", "2026-10-01", "2026-10-14")), "2026-10-14");
  assert.equal(publicationDate(check("a", "ai-unreviewed", "2026-10-19")), "2026-10-19");
  const sorted = [
    check("b", "approved", "2026-10-13", "2026-10-14"),
    check("c", "ai-unreviewed", "2026-10-19"),
    check("a", "ai-unreviewed", "2026-10-14"),
    check("d", "approved", "2026-10-12", "2026-10-14"),
    check("e", "approved", "2026-10-13", "2026-10-14"),
  ].sort(newestFirst);
  // Newest publication date first; the same date goes to the later written date, then the slug.
  assert.deepEqual(
    sorted.map((item) => item.slug),
    ["c", "a", "b", "e", "d"],
  );
});

test("a hook is split where its turn is, and a hook without a turn stays whole", () => {
  assert.deepEqual(splitHook("You know “Be still”. But did you know it is spoken over raging nations?"), {
    first: "You know “Be still”.",
    second: "But did you know it is spoken over raging nations?",
  });
  assert.deepEqual(splitHook("A hook with no turn in it."), { first: "A hook with no turn in it." });
  for (const item of content().checks) {
    const { first, second } = splitHook(item.hook);
    assert.equal(second === undefined ? first : `${first} ${second}`, item.hook, `${item.slug}: nothing lost`);
  }
});

test("the shared label words are free of Node imports and say what they said before", () => {
  const source = readFileSync("src/lib/editorial.ts", "utf8");
  assert.ok(!/from\s+["']node:/.test(source) && !/require\(/.test(source), "the app imports this file, so it needs no Node");
  assert.equal(aiUnreviewedLabel, "Context written by AI, from the sources below. The Bible text is the World English Bible.");
  assert.equal(aiUnreviewedCardLabel, "Context written by AI, from named sources.");
  assert.equal(editorialNote("ai-unreviewed", "ai"), "This context was written by an AI model to help you see the verse in its setting. The Bible text is the World English Bible. Before publishing, an automatic check made sure every source below opens and every quotation matches its source. It can contain mistakes. If a source says otherwise, tell us.");
  assert.equal(
    editorialNote("approved", "human"),
    "Written by HisFullGlory. Scripture quotations are checked against the World English Bible. Approved by HisFullGlory. Not reviewed by a theological reader.",
  );
});

test("context checks, topic pages and articles can be shared, with their own address", () => {
  const addresses = [
    ...publishedChecks().map((item) => `/context-checks/${item.slug}`),
    ...publishedTopics().map((topic) => `/topics/${topic.id}`),
    ...publishedArticles().map((article) => `/articles/${article.slug}`),
  ];
  for (const address of addresses) {
    const html = readFileSync(page(address), "utf8");
    const url = encodeURIComponent(`https://hisfullglory.com${address}`);
    assert.ok(html.includes(`https://www.facebook.com/sharer/sharer.php?u=${url}`), `${address}: share link with its own address`);
    assert.ok(html.includes("https://wa.me/?text="), `${address}: WhatsApp`);
  }
});
