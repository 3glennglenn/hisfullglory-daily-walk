// Checks the topic pages and articles on file, and that only approved ones were built
// (run `npm run build` first; `npm run check` does both). With SHOW_DRAFTS=1 set for both
// the build and the tests, drafts count as shown, so their pages can be checked too.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { launchTopics } from "../../src/topics/graph.ts";
import { library } from "../src/lib/bible.ts";
import {
  checkParts,
  content,
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
  assert.throws(() => parseContextCheck({ ...item, storyStatus: "reading" }, item.slug, bible), /needs its sources/);
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

test("only approved context checks are built, and a built one shows the verse and its text as written", () => {
  const shown = (item: { review: string }) => item.review === "approved" || showDrafts();
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
    assert.equal(text.includes("Draft. Not approved"), item.review === "draft", `${item.slug}: draft label`);
    // The chapter page of the verse points to its context check.
    const chapter = readFileSync(page(`/bible/${item.verse.book}/${item.verse.chapter}`), "utf8");
    assert.ok(chapter.includes(`href="/context-checks/${item.slug}"`), `${item.slug}: link on the chapter page`);
  }
});
