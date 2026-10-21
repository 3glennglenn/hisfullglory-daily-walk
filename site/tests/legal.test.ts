// Checks the privacy, terms, contact and delete-account pages, the footer and About links that
// lead to them, and the data file behind them (run `npm run build` first; `npm run check` does
// both).
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { appUrl, footerNav, shopUrl } from "../src/config.ts";
import * as legal from "../src/data/legal.ts";
import { gatedLegalPages } from "../src/lib/pages.ts";

const { approved, assertReleasable, supportEmail, supportEmailReady, termsVersion } = legal;
const legalPages = ["/privacy", "/terms", "/contact", "/delete-account"];
/** The pages that print the approval date (`lastUpdated`), the one value that stays a marker until the founder approves.
 *  /contact and /delete-account print no open fact. */
const pagesWithFacts = ["/privacy", "/terms"];

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

test("the privacy, terms, contact and delete-account pages exist, with one h1 and an id on every h2", () => {
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

test("until the founder approves, each legal page is a draft: banner, noindex, markers where facts are open, not in the sitemap", () => {
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
      if (pagesWithFacts.includes(address))
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
  for (const name of ["Supabase", "Google", "Vercel", "Shopify", "Browser and phone push services"])
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

test("one age rule: the terms and the privacy policy print it, and the app label starts the same way", () => {
  const squash = (text: string) => text.replace(/\s+/g, " ").trim();
  for (const address of ["/terms", "/privacy"]) {
    const text = squash(textOf(read(address)));
    assert.ok(text.includes(legal.ageNoAccount), `${address}: reading and the journal need no account`);
    assert.ok(text.includes(legal.ageRule), `${address}: the age rule`);
  }
  // The short label in the app names the same ages as the full rule.
  for (const part of ["at least 13", "at least 16", "13 to 15", "permission from a parent or guardian"]) {
    assert.ok(legal.ageRule.includes(part), `ageRule says "${part}"`);
    assert.ok(legal.ageLabel.includes(part), `ageLabel says "${part}"`);
  }
  const app = readFileSync("../src/platform/auth.tsx", "utf8");
  assert.ok(/\{ageLabel\}\. I accept the/.test(app), "the app's terms label starts with ageLabel");
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

test("the delete-account page gives the in-app route as three numbered steps and the way back to the app", () => {
  const html = read("/delete-account");
  const steps = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/);
  assert.ok(steps, "an ordered list of steps");
  assert.equal(html.match(/<ol[\s>]/g)?.length, 1, "one ordered list");
  assert.equal(steps[1].match(/<li[\s>]/g)?.length, 3, "exactly three steps");
  assert.ok(html.includes(`href="${appUrl}"`), "links to the app");
  assert.ok(/<a[^>]*class="button"[^>]*>Open the app<\/a>/.test(html), "an Open the app button");
  assert.ok(html.includes('href="/privacy"'), "links to the privacy policy");
  const text = textOf(html).replace(/\s+/g, " ");
  assert.ok(text.includes("HisFullGlory Daily Walk"), "names the app");
  assert.ok(text.includes("Your shop account and orders at shop.hisfullglory.com are separate."), "shop accounts are separate");
  assert.ok(html.includes(`href="${shopUrl}/pages/contact"`), "the shop contact page");
  assert.ok(text.includes("type DELETE"), "names the word to type");
});

test("the delete-account page keeps the wording the founder approved for what is deleted, kept and on the device", () => {
  const html = read("/delete-account");
  const text = textOf(html).replace(/\s+/g, " ");
  for (const phrase of [
    "Your account and your profile, including your display name.",
    "Your posts, reflections, prayers and chat messages in the community, and the replies other people wrote under your posts.",
    "Your reactions, votes and the reports you sent.",
    "The people you blocked or muted, and anyone's block of you.",
    "Your topic and Circle memberships, and the support requests you made.",
    "Circles you own. They close, with their posts.",
    "A record of moderation decisions can be kept to protect the community: what was decided about which post, Circle or request, and when. It holds no name, email address or post text. Reports other people sent about your posts stay with their accounts.",
    "Your private journal, prayers and reading are kept on your device, not on our server. Deleting your account in the app also removes what that account saved on that device. What you saved without signing in stays on the device until you clear it.",
  ])
    assert.ok(text.includes(phrase), `delete-account says: ${phrase}`);
  const list = html.match(/<h2[^>]*>What is deleted<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
  assert.ok(list, "the What is deleted list");
  assert.equal(list[1].match(/<li[\s>]/g)?.length, 6, "six items in What is deleted");
});

test("the delete-account page shows the email route only when it works", () => {
  const html = read("/delete-account");
  if (supportEmailReady) {
    assert.ok(html.includes(`href="mailto:${supportEmail}?subject=Delete%20my%20account"`), "mailto with subject");
    assert.ok(textOf(html).includes("within 30 days"), "the 30-day promise");
    assert.ok(!html.includes("Email deletion is being set up"));
  } else {
    assert.ok(html.includes("Email deletion is being set up. Until then, please use the app."), "not-ready text");
    assert.ok(!html.includes("mailto:"), "no mailto link");
    assert.ok(!html.includes(supportEmail), "no support address");
    assert.ok(!/or by email/.test(textOf(html)), "no promise of email while it is not set up");
  }
});

/**
 * Does a vercel.json redirect source capture this address? Segment by segment: a plain word must
 * be equal, ":name*" takes the rest of the address, ":name(regex)" must match the whole segment.
 */
function redirectCaptures(source: string, address: string): boolean {
  const want = address.split("/").slice(1);
  const have = source.split("/").slice(1);
  for (let index = 0; index < have.length; index++) {
    const part = have[index];
    if (/^:\w+\*$/.test(part)) return true;
    if (index >= want.length) return false;
    const pattern = part.match(/^:\w+\((.+)\)$/);
    const same = pattern ? new RegExp(`^(?:${pattern[1]})$`).test(want[index]) : /^:\w+$/.test(part) || part === want[index];
    if (!same) return false;
  }
  return have.length === want.length;
}

test("the footer lists About, Privacy, Terms, Contact, Delete account and Shop, all as links that work", () => {
  assert.deepEqual(
    footerNav.map((item) => item.label),
    ["About", "Privacy", "Terms", "Contact", "Delete account", "Shop"],
  );
  assert.deepEqual(
    footerNav.map((item) => item.href),
    ["/about", "/privacy", "/terms", "/contact", "/delete-account", shopUrl],
  );
  const home = read("/");
  const footer = home.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? "";
  for (const item of footerNav) {
    assert.ok(item.ready, `${item.label} is ready`);
    // A site path needs a built page; the shop is another site.
    if (item.href.startsWith("/")) assert.ok(existsSync(builtFile(item.href)), `${item.label}: built page ${item.href}`);
    assert.ok(footer.includes(`href="${item.href}"`), `${item.label}: linked in the footer`);
    assert.ok(!/^\/(pages|policies)\//.test(item.href), `${item.label}: no /pages/ or /policies/ path`);
  }
  assert.ok(!/policies\/privacy-policy|policies\/terms-of-service/.test(footer), "no link to the shop's policy pages");
});

test("no redirect in vercel.json captures Privacy, Terms, Contact or Delete account", () => {
  const rules: { source: string }[] = JSON.parse(readFileSync("vercel.json", "utf8")).redirects;
  // The matcher itself must see a capture where there is one, or the loop below proves nothing.
  assert.ok(redirectCaptures("/pages/:path*", "/pages/contact"));
  assert.ok(redirectCaptures("/account/:path*", "/account/orders"));
  assert.ok(redirectCaptures("/search", "/search"));
  assert.ok(!redirectCaptures("/account/:path*", "/delete-account"));
  for (const address of legalPages)
    for (const rule of rules) assert.ok(!redirectCaptures(rule.source, address), `${rule.source} captures ${address}`);
});

test("the About page leads to the contact page of this site", () => {
  const html = read("/about");
  assert.ok(html.includes('href="/contact"'), "Contact us leads to /contact");
  assert.ok(!html.includes("/pages/contact"), "no link to the shop's /pages/ address");
});
