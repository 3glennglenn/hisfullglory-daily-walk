// Checks the privacy, terms and contact pages and the data file behind them
// (run `npm run build` first; `npm run check` does both). The footer and About links to
// these pages, and the delete-account page, are checked from plan 07 on.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import * as legal from "../src/data/legal.ts";
import { gatedLegalPages } from "../src/lib/pages.ts";

const { approved, assertReleasable, supportEmail, supportEmailReady, termsVersion } = legal;
const legalPages = ["/privacy", "/terms", "/contact"];

/** Where a site address lives in the build: "/privacy" is dist/privacy/index.html. */
const builtFile = (address: string) => `dist${address.replace(/\/$/, "")}/index.html`;
const read = (address: string) => readFileSync(builtFile(address), "utf8");
/** The words a reader sees: no styles, no scripts, no tags. */
const textOf = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ");
const first = (html: string, pattern: RegExp) => html.match(pattern)?.[1];

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : path.endsWith(".html") ? [path] : [];
  });
}

test("the privacy, terms and contact pages exist, with one h1 and an id on every h2", () => {
  for (const address of legalPages) {
    assert.ok(existsSync(builtFile(address)), `${address} page`);
    const html = read(address);
    assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${address}: one h1`);
    for (const [tag] of html.matchAll(/<h2[^>]*>/g))
      assert.match(tag, /\sid="[^"]+"/, `${address}: every h2 has an id (${tag})`);
  }
});

test("the legal pages are listed once in gatedLegalPages and are not under /pages/ or /policies/", () => {
  assert.deepEqual([...gatedLegalPages].sort(), [...legalPages].sort());
  for (const address of legalPages) assert.ok(!/^\/(pages|policies)\//.test(address), address);
  // The shop redirects of vercel.json must not capture any of them.
  const rules: { source: string }[] = JSON.parse(readFileSync("vercel.json", "utf8")).redirects;
  const redirected = new Set(rules.map((rule) => rule.source.split("/")[1]));
  for (const address of legalPages) assert.ok(!redirected.has(address.split("/")[1]), `${address} is redirected to the shop`);
});

test("until the founder approves, each legal page is a draft: banner, noindex, markers, not in the sitemap", () => {
  const sitemap = readFileSync("dist/sitemap.xml", "utf8");
  for (const address of legalPages) {
    const html = read(address);
    const listed = sitemap.includes(`<loc>https://hisfullglory.com${address}</loc>`);
    if (approved) {
      assert.ok(!html.includes("[CONFIRM"), `${address} still contains a [CONFIRM marker`);
      assert.ok(!html.includes("Draft."), `${address} still shows the draft banner`);
      assert.ok(!html.includes('<meta name="robots" content="noindex"'), `${address} is still noindex`);
      assert.ok(listed, `${address} is missing from the sitemap`);
    } else {
      assert.ok(/<strong[^>]*>Draft\.<\/strong>/.test(html), `${address}: draft banner`);
      assert.ok(html.includes('<meta name="robots" content="noindex"'), `${address}: noindex`);
      assert.ok(html.includes("[CONFIRM"), `${address}: unconfirmed facts show as markers`);
      assert.ok(!html.includes('rel="canonical"'), `${address}: no canonical address`);
      assert.ok(!listed, `${address}: kept out of the sitemap`);
    }
  }
});

test("a value left empty in legal.ts fails here instead of rendering an empty sentence", () => {
  const empty: string[] = [];
  const walk = (name: string, value: unknown) => {
    if (typeof value === "string") {
      if (value.trim() === "") empty.push(name);
    } else if (Array.isArray(value)) value.forEach((item, index) => walk(`${name}[${index}]`, item));
    else if (value && typeof value === "object")
      for (const [key, inner] of Object.entries(value)) walk(`${name}.${key}`, inner);
  };
  for (const [name, value] of Object.entries(legal)) if (typeof value !== "function") walk(name, value);
  assert.deepEqual(empty, []);
  assert.equal(legal.processors.length, 5);
  for (const address of legalPages) {
    const text = textOf(read(address));
    assert.ok(!/\bundefined\b|\[object /.test(text), `${address} renders a missing value`);
  }
});

test("the privacy page names the five processors in cards, with a contents list that is collapsed", () => {
  const html = read("/privacy");
  for (const name of ["Supabase", "Vercel", "Resend", "Shopify", "Browser and phone push services"])
    assert.ok(new RegExp(`<h3[^>]*>${name}</h3>`).test(html), `${name} card`);
  assert.equal(html.match(/<article class="card processor"/g)?.length, 5, "five processor cards");
  assert.ok(/<details[^>]*>\s*<summary[^>]*>On this page<\/summary>/.test(html), "On this page is a details element");
  assert.ok(!/<details[^>]*\sopen/.test(html), "On this page starts collapsed");
  // Every link in the contents list leads to a section of the page.
  const ids = new Set([...html.matchAll(/<h2[^>]*\sid="([^"]+)"/g)].map(([, id]) => id));
  const links = [...html.matchAll(/<summary[^>]*>On this page<\/summary>[\s\S]*?<\/details>/g)][0][0];
  const anchors = [...links.matchAll(/href="#([^"]+)"/g)].map(([, id]) => id);
  assert.equal(anchors.length, 10, "ten sections in the contents list");
  for (const id of anchors) assert.ok(ids.has(id), `#${id} exists`);
});

test("with the support email not ready, no page of the site prints or links the support address", () => {
  if (supportEmailReady) return;
  const found = htmlFiles("dist").filter((file) => {
    const html = readFileSync(file, "utf8");
    return html.includes(supportEmail) || /mailto:support@/i.test(html);
  });
  assert.deepEqual(found, []);
});

test("the contact page shows the email route only when it works, and always the shop contact page", () => {
  const html = read("/contact");
  assert.ok(html.includes('href="https://shop.hisfullglory.com/pages/contact"'), "questions about an order");
  if (supportEmailReady) {
    assert.ok(html.includes(`href="mailto:${supportEmail}?subject=HisFullGlory%20support"`), "mailto with subject");
    assert.ok(!html.includes("Email contact is being set up"));
  } else {
    assert.ok(html.includes("Email contact is being set up"), "empty state heading");
    assert.ok(!html.includes("mailto:"), "no mailto link");
  }
  assert.ok(html.includes("Something else?"), "other routes are always shown");
});

test("the terms page shows the same version as the app", () => {
  const app = readFileSync("../src/platform/auth.tsx", "utf8");
  const appVersion = first(app, /export const TERMS_VERSION = "([^"]+)"/);
  assert.ok(appVersion, "TERMS_VERSION found in src/platform/auth.tsx");
  assert.equal(termsVersion, appVersion);
  assert.ok(textOf(read("/terms")).includes(`Version ${termsVersion}`), "the terms page names its version");
});

test("a production build is refused while the text is not approved, and nothing else is", () => {
  assert.throws(() => assertReleasable("production", false), /legal\.ts/);
  assert.doesNotThrow(() => assertReleasable("preview", false));
  assert.doesNotThrow(() => assertReleasable("development", false));
  assert.doesNotThrow(() => assertReleasable(undefined, false));
  assert.doesNotThrow(() => assertReleasable("production", true));
});

test("legal page titles and descriptions fit what search results and previews show", () => {
  for (const address of legalPages) {
    const html = read(address);
    const title = first(html, /<title>([^<]*)<\/title>/);
    const description = first(html, /<meta name="description" content="([^"]*)"/);
    assert.ok(title, `${address}: title`);
    assert.ok(title.endsWith(" | HisFullGlory"), `${address}: title suffix`);
    // JavaScript string length, the same measure as seo.test.ts.
    assert.ok(title.length <= 60, `${address}: title of ${title.length} characters`);
    assert.ok(description, `${address}: description`);
    assert.ok(description.length >= 30 && description.length <= 160, `${address}: description of ${description.length} characters`);
  }
});

test("legal page copy follows the copy rules", () => {
  for (const address of legalPages) {
    const text = textOf(read(address));
    assert.ok(!text.includes("—"), `${address}: no em dashes`);
    assert.ok(!/download (the|our) app/i.test(text), `${address}: the app is a web app`);
    assert.ok(!text.includes("!"), `${address}: no exclamation marks`);
  }
});

test("the terms repeat the community rules of the app and the Scripture sentences of the About page", () => {
  const squash = (text: string) => text.replace(/\s+/g, " ").trim();
  const terms = squash(textOf(read("/terms")));
  // The list the terms must always carry (the rules a person accepts before posting).
  const rules =
    "no harassment, threats, hate, sexual content, scams, spam, impersonation, illegal activity, dangerous advice or private information";
  assert.ok(terms.includes(rules), "the community rules are listed");
  // While the app's acceptance label still spells the list out, the two must be the same words.
  const label = squash(readFileSync("../src/platform/auth.tsx", "utf8"));
  const inApp = first(label, /community rules, version \{TERMS_VERSION\}: ([^.]*?)\./);
  if (inApp) assert.equal(inApp, rules, "the app and the terms list the same rules");
  assert.ok(terms.includes("Do not share other people's private information."));
  assert.ok(terms.includes("Do not ask for money or payment details in posts."));
  // The four Scripture sentences are the ones /about already carries, word for word.
  const about = squash(textOf(readFileSync("dist/about/index.html", "utf8")));
  for (const sentence of [
    "Scripture comes first. We use the World English Bible, a public-domain translation.",
    "Context notes name their sources. A note that has not yet been reviewed by a theological reader is labelled “Editorial draft”.",
    "Where we show an AI explanation, it is labelled as AI and kept apart from Scripture and from sourced notes. It can contain mistakes.",
    "Community voices are labelled as community. Popularity does not make something true.",
  ]) {
    assert.ok(about.includes(sentence), `About says: ${sentence}`);
    assert.ok(terms.includes(sentence), `Terms say: ${sentence}`);
  }
});
