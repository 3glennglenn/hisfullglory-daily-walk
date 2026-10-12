// Checks the built site as a whole (run `npm run build` first; `npm run check` does both).
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { mainNav } from "../src/config.ts";
import { resources } from "../src/data/resources.ts";

/** Where a site address lives in the build: "/" and "/bible" are both an index.html. */
function builtFile(address: string) {
  const path = address.split("#")[0].split("?")[0].replace(/\/$/, "");
  return /\.[a-z0-9]+$/i.test(path) ? `dist${path}` : `dist${path}/index.html`;
}
const read = (address: string) => readFileSync(builtFile(address), "utf8");

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : path.endsWith(".html") ? [path] : [];
  });
}
const pages = htmlFiles("dist");

test("the pages outside the Bible exist", () => {
  for (const address of ["/", "/about", "/beta", "/resources", "/styleguide"])
    assert.ok(existsSync(builtFile(address)), `${address} page`);
});

test("every page loads the site's styles", () => {
  // A page without its stylesheet still passes every text check, so this is checked on its own.
  const bare = pages.filter((file) => !/rel="stylesheet"|<style/.test(readFileSync(file, "utf8")));
  assert.deepEqual(bare.slice(0, 5), [], `${bare.length} pages have no styles`);
});

test("every internal link on every page leads to a page or file that exists", () => {
  const missing = new Set<string>();
  for (const file of pages)
    for (const [, href] of readFileSync(file, "utf8").matchAll(/\shref="(\/[^"]*)"/g))
      if (!existsSync(builtFile(href))) missing.add(`${href} (on ${file})`);
  assert.deepEqual([...missing].slice(0, 10), []);
});

test("page addresses have no trailing slash and no file ending", () => {
  for (const [address, canonical] of [
    ["/", "https://hisfullglory.com/"],
    ["/about", "https://hisfullglory.com/about"],
    ["/bible", "https://hisfullglory.com/bible"],
    ["/bible/psalms", "https://hisfullglory.com/bible/psalms"],
    ["/bible/psalms/23", "https://hisfullglory.com/bible/psalms/23"],
  ])
    assert.ok(read(address).includes(`rel="canonical" href="${canonical}"`), `${address} canonical`);
  assert.ok(read("/styleguide").includes('name="robots" content="noindex"'), "styleguide is not indexed");
});

test("navigation items marked ready have a page, and the rest are not links", () => {
  const home = read("/");
  for (const item of mainNav) {
    assert.equal(existsSync(builtFile(item.href)), item.ready, `${item.label} page`);
    assert.equal(home.includes(`href="${item.href}"`), item.ready, `${item.label} link`);
  }
});

test("site copy follows the copy rules it can be checked against", () => {
  // The Bible pages carry the WEB text, which is not ours to edit, so they are left out.
  for (const address of ["/", "/about", "/beta", "/resources"]) {
    const text = read(address).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    assert.ok(!text.includes("—"), `${address}: no em dashes`);
    assert.ok(!/download (the|our) app/i.test(text), `${address}: the app is a web app`);
  }
});

test("every resource links to its product in the shop", () => {
  const html = read("/resources");
  for (const resource of resources)
    assert.ok(
      html.includes(`/products/${resource.handle}"`),
      `${resource.title} links to the shop`,
    );
});
