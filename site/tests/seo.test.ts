// Checks what search engines and link previews get from the built site
// (run `npm run build` first; `npm run check` does both).
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { content, showDrafts } from "../src/lib/content.ts";
import { indexablePaths } from "../src/lib/pages.ts";

const origin = "https://hisfullglory.com";

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : path.endsWith(".html") ? [path] : [];
  });
}
const first = (html: string, pattern: RegExp) => html.match(pattern)?.[1];
const pages = htmlFiles("dist").map((file) => {
  const html = readFileSync(file, "utf8");
  return {
    file,
    html,
    canonical: first(html, /<link rel="canonical" href="([^"]*)"/),
    title: first(html, /<title>([^<]*)<\/title>/),
    description: first(html, /<meta name="description" content="([^"]*)"/),
  };
});
// A page is indexable when it names its canonical address; the others carry noindex.
const indexable = pages.filter((page) => page.canonical);
const hidden = pages.filter((page) => !page.canonical);

test("the sitemap lists every indexable page once, and nothing else", () => {
  const listed = [...readFileSync("dist/sitemap.xml", "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    ([, loc]) => loc,
  );
  assert.equal(new Set(listed).size, listed.length, "no address twice");
  assert.deepEqual([...listed].sort(), indexable.map((page) => page.canonical).sort());
  assert.deepEqual(listed, indexablePaths().map((path) => new URL(path, origin).href));
  // Five fixed pages, 66 books and 1,189 chapters, plus approved topic pages and articles.
  assert.ok(listed.length >= 5 + 66 + 1189);
});

test("robots.txt allows crawling and names the sitemap", () => {
  const robots = readFileSync("dist/robots.txt", "utf8");
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/);
  assert.ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`));
  assert.ok(!/Disallow/i.test(robots));
});

test("pages kept out of search results say so and are not in the sitemap", () => {
  // A build made with SHOW_DRAFTS=1 also hides its draft pages and the two overviews.
  const { topics, articles } = content();
  const drafts = showDrafts()
    ? [
        ...(topics.length ? ["dist/topics/index.html"] : []),
        ...(articles.length ? ["dist/articles/index.html"] : []),
        ...topics.filter((topic) => topic.review === "draft").map((topic) => `dist/topics/${topic.id}/index.html`),
        ...articles.filter((article) => article.review === "draft").map((article) => `dist/articles/${article.slug}/index.html`),
      ]
    : [];
  assert.deepEqual(
    hidden.map((page) => page.file.replaceAll("\\", "/")).sort(),
    ["dist/404.html", "dist/styleguide/index.html", ...drafts].sort(),
  );
  for (const page of hidden)
    assert.ok(page.html.includes('<meta name="robots" content="noindex"'), page.file);
});

test("every indexable page has its own title and description", () => {
  for (const field of ["title", "description"] as const) {
    const seen = new Map<string, string>();
    for (const page of indexable) {
      const value = page[field];
      assert.ok(value, `${page.file}: ${field}`);
      assert.equal(seen.get(value), undefined, `${page.file} repeats the ${field} of ${seen.get(value)}`);
      seen.set(value, page.file);
    }
  }
  for (const page of indexable) {
    assert.ok(page.title!.length <= 60, `${page.file}: title of ${page.title!.length} characters`);
    const length = page.description!.length;
    assert.ok(length >= 30 && length <= 160, `${page.file}: description of ${length} characters`);
  }
});

test("every indexable page describes itself for link previews", () => {
  for (const page of indexable) {
    const og = (name: string) =>
      first(page.html, new RegExp(`<meta property="og:${name}" content="([^"]*)"`));
    assert.ok(og("title"), `${page.file}: og:title`);
    assert.equal(og("description"), page.description, `${page.file}: og:description`);
    assert.equal(og("url"), page.canonical, `${page.file}: og:url`);
    assert.equal(og("image"), `${origin}/og.png`, `${page.file}: og:image`);
    assert.ok(page.html.includes('<meta name="twitter:card" content="summary_large_image"'), page.file);
  }
});

test("the share image is a 1200 by 630 PNG", () => {
  const image = readFileSync("dist/og.png");
  assert.equal(image.subarray(1, 4).toString("latin1"), "PNG");
  assert.deepEqual([image.readUInt32BE(16), image.readUInt32BE(20)], [1200, 630]);
});

test("an unknown address gets a not-found page that leads back into the site", () => {
  assert.ok(existsSync("dist/404.html"));
  const html = readFileSync("dist/404.html", "utf8");
  assert.ok(html.includes('href="/"') && html.includes('href="/bible"'));
  assert.ok(!html.replace(/<style[\s\S]*?<\/style>/g, "").includes("—"), "no em dashes");
});
