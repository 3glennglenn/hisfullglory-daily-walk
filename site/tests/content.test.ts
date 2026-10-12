// Checks the topic pages and articles on file, and that only approved ones were built
// (run `npm run build` first; `npm run check` does both). With SHOW_DRAFTS=1 set for both
// the build and the tests, drafts count as shown, so their pages can be checked too.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { launchTopics } from "../../src/topics/graph.ts";
import { library } from "../src/lib/bible.ts";
import {
  content,
  parseArticle,
  parseTopic,
  publishedArticles,
  publishedTopics,
  refLabel,
  showDrafts,
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
