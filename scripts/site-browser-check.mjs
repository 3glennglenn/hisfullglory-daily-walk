// Local browser check of the website's header, footer, appearance switch and first paint
// (phase 01.1, plan 02). Run against `npm --prefix site run preview` (default port 4321):
//   BROWSER_CHANNEL=chrome node scripts/site-browser-check.mjs
// DOM and behaviour checks only; deliberately no screenshots. It uses the root Playwright, which
// the site's own CI job does not install, so it is a local check and not part of CI.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.SITE_URL ?? "http://127.0.0.1:4321";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
});
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
let checks = 0;

async function check(label, fn) {
  await fn();
  checks++;
  console.log("PASS", label);
}

/** A page in a fresh context; `seed` entries are written to localStorage before the page's own scripts run. */
async function open(path, { width = 390, height = 844, colorScheme = "light", seed = {}, rootPx } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme });
  if (Object.keys(seed).length)
    await context.addInitScript((entries) => {
      // Only on the first load of the tab, so a reload shows what the page itself stored.
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    }, seed);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${path}: ${message.text()}`);
  });
  page.on("pageerror", (error) => pageErrors.push(`${path}: ${error.message}`));
  page.on("requestfailed", (request) => failedRequests.push(`${path}: ${request.url()}`));
  await page.goto(base + path, { waitUntil: "load" });
  if (rootPx) await page.addStyleTag({ content: `html { font-size: ${rootPx}px !important; }` });
  return { context, page };
}

const overflow = (page) =>
  page.evaluate(() => ({
    scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    width: document.documentElement.clientWidth,
  }));
const stored = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const attrs = (page) =>
  page.evaluate(() => ({
    look: document.documentElement.dataset.look,
    mode: document.documentElement.dataset.mode,
    // The built stylesheet is minified, so a colour read back from it may be lower case.
    color: document.querySelector('meta[name="theme-color"]')?.getAttribute("content")?.toUpperCase(),
  }));

/** The first context check that the site publishes, named by its file in site/content/context-checks. */
async function contextCheckPath() {
  const dir = "site/content/context-checks";
  const names = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).sort() : [];
  for (const name of names) {
    const path = `/context-checks/${name.replace(/\.json$/, "")}`;
    const response = await fetch(base + path);
    if (response.ok) return path;
  }
  throw new Error("no context check page is served by the preview");
}

/** The page of a published check by review status ("ai-unreviewed" or "approved"), or undefined. */
async function contextCheckPathBy(review) {
  const dir = "site/content/context-checks";
  const names = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).sort() : [];
  for (const name of names) {
    if (JSON.parse(readFileSync(`${dir}/${name}`, "utf8")).review !== review) continue;
    const path = `/context-checks/${name.replace(/[.]json$/, "")}`;
    if ((await fetch(base + path)).ok) return path;
  }
  return undefined;
}

/** The first topic page the site serves, or undefined. */
async function topicPath() {
  const dir = "site/content/topics";
  const names = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".json")).sort() : [];
  for (const name of names) {
    const path = `/topics/${name.replace(/[.]json$/, "")}`;
    if ((await fetch(base + path)).ok) return path;
  }
  return undefined;
}

try {
  const checkPath = await contextCheckPath();
  const pages = ["/", "/bible/john/3", checkPath, "/privacy"];

  await check("no page scrolls sideways at 320, 360, 390, 768 and 1280px (4 pages)", async () => {
    for (const width of [320, 360, 390, 768, 1280])
      for (const path of pages) {
        const { context, page } = await open(path, { width });
        const { scroll, width: client } = await overflow(page);
        assert.ok(scroll <= client, `${path} at ${width}px scrolls sideways (${scroll} > ${client})`);
        await context.close();
      }
  });

  await check("the header has the logo and the name, no tagline; the footer has the tagline once", async () => {
    const { context, page } = await open("/");
    const header = page.locator("header.site-header");
    assert.equal(await header.locator("img[src='/icon.svg']").count(), 1);
    assert.ok(await header.locator("img").evaluate((img) => img.complete && img.naturalWidth > 0), "the logo loads");
    assert.equal(await header.locator("img").getAttribute("alt"), "");
    assert.match(await header.locator("a.brand").innerText(), /^HisFullGlory$/);
    assert.ok(!(await header.innerText()).includes("Jesus at the Center"), "no tagline in the header");
    assert.equal(await page.locator("footer").getByText("Jesus at the Center", { exact: true }).count(), 1);
    const size = await page.locator("footer .tagline").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    assert.equal(Math.round(size), 13, "the tagline is 13px");
    assert.equal(await page.locator("header, footer").locator("text=Jesus at the Center").count(), 1);
    await context.close();
  });

  await check("390px: Menu opens and lists six links, each at least 44px tall, after Open the app", async () => {
    const { context, page } = await open("/", { width: 390 });
    assert.equal(await page.locator("header .main-nav").isVisible(), false, "the desktop links are not shown on a phone");
    assert.equal(await page.locator("header .cta").isVisible(), false, "Open the app is in the menu, not in the bar, at 390px");
    const summary = page.locator("header summary");
    assert.equal(await summary.innerText(), "Menu");
    const box = await summary.boundingBox();
    assert.ok(box.height >= 44, `Menu is ${box.height}px tall`);
    await summary.click();
    assert.equal(await page.locator("header details").getAttribute("open"), "");
    const links = page.locator("header details nav li:not(.menu-app) a");
    assert.equal(await links.count(), 6, "six links");
    for (const link of await links.all()) {
      const rect = await link.boundingBox();
      assert.ok(rect.height >= 44, `${await link.innerText()} is ${rect.height}px tall`);
      assert.ok(await link.isVisible());
    }
    const first = page.locator("header details nav li").first();
    assert.equal(await first.getAttribute("class"), "menu-app");
    assert.equal(await first.locator("a").innerText(), "Open the app");
    assert.ok((await first.locator("a").boundingBox()).height >= 44);
    assert.ok((await overflow(page)).scroll <= 390);
    await context.close();
  });

  await check("the bar is one row from 320 to 440px; from 440px the quiet Open the app sits in it; below, it is the menu's first row", async () => {
    for (const width of [320, 360, 375, 390, 414, 440, 600]) {
      const { context, page } = await open("/", { width });
      const bar = await page.locator("header .header-bar").boundingBox();
      assert.ok(bar.height <= 64, `the bar is ${bar.height}px tall at ${width}px (one row)`);
      const cta = page.locator("header .cta");
      if (width >= 440) assert.equal(await cta.isVisible(), true, `Open the app is in the bar at ${width}px`);
      else {
        assert.equal(await cta.isVisible(), false, `Open the app is not in the bar at ${width}px`);
        await page.locator("header summary").click();
        const link = page.locator("header details .menu-app a");
        assert.equal(await link.isVisible(), true, `Open the app is the menu's first row at ${width}px`);
      }
      assert.ok((await overflow(page)).scroll <= width);
      await context.close();
    }
  });

  await check("1280px: six links and one Open the app in the header, no Menu", async () => {
    const { context, page } = await open("/", { width: 1280 });
    const links = page.locator("header .main-nav a");
    assert.equal(await links.count(), 6);
    for (const link of await links.all()) assert.equal(await link.isVisible(), true);
    assert.equal(await page.locator("header summary").isVisible(), false);
    const openApp = page.locator("header a:visible", { hasText: "Open the app" });
    assert.equal(await openApp.count(), 1, "one visible Open the app");
    await context.close();
  });

  await check("768px: the links take their own row and nothing overflows", async () => {
    const { context, page } = await open("/", { width: 768 });
    assert.equal(await page.locator("header .main-nav a").count(), 6);
    assert.equal(await page.locator("header summary").isVisible(), false);
    assert.equal(await page.locator("header a:visible", { hasText: "Open the app" }).count(), 1);
    assert.ok((await overflow(page)).scroll <= 768);
    await context.close();
  });

  await check("the current page is marked in the menu and in the bar", async () => {
    let { context, page } = await open("/bible/john/3", { width: 1280 });
    assert.equal(await page.locator("header .main-nav a[aria-current='page']").innerText(), "Bible");
    await context.close();
    ({ context, page } = await open("/bible/john/3", { width: 390 }));
    await page.locator("header summary").click();
    assert.equal(await page.locator("header details a[aria-current='page']").innerText(), "Bible");
    await context.close();
  });

  await check("the Appearance group: choosing Marked page and On applies at once and survives a reload", async () => {
    const { context, page } = await open("/", { width: 390 });
    const group = page.locator("[data-appearance]");
    await group.waitFor({ state: "visible" });
    assert.equal(await group.locator("h2").innerText(), "Appearance");
    assert.equal(await group.getByRole("group", { name: "Theme" }).count(), 1);
    assert.equal(await group.getByRole("group", { name: "Lamplight" }).count(), 1);
    for (const button of await group.locator("button").all())
      assert.ok((await button.boundingBox()).height >= 44, `${await button.innerText()} is 44px or taller`);
    assert.deepEqual(await attrs(page), { look: "cover", mode: "light", color: "#F3F1EE" });
    await group.getByRole("button", { name: "Marked page", exact: true }).click();
    await group.getByRole("button", { name: "On", exact: true }).click();
    const now = await attrs(page);
    assert.equal(now.look, "marked");
    assert.equal(now.mode, "lamplight");
    assert.equal(now.color, "#1A120E", "theme-color follows the look and mode");
    assert.equal(await group.getByRole("button", { name: "Marked page", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await group.getByRole("button", { name: "Cover and story", exact: true }).getAttribute("aria-pressed"), "false");
    assert.equal(await group.getByRole("button", { name: "On", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await stored(page, "hfg-look"), "marked");
    assert.equal(await stored(page, "hfg-lamplight"), "on");
    assert.equal(await group.locator("[data-lamplight-status]").innerText(), "", "the effect line is empty unless Automatic");
    await page.reload();
    await group.waitFor({ state: "visible" });
    const after = await attrs(page);
    assert.deepEqual(after, { look: "marked", mode: "lamplight", color: "#1A120E" });
    assert.equal(await group.getByRole("button", { name: "Marked page", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await group.getByRole("button", { name: "On", exact: true }).getAttribute("aria-pressed"), "true");
    // The page really is dark: the root background is the Lamplight page colour.
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(26, 18, 14)");
    await context.close();
  });

  await check("Automatic shows the current effect: dark device, then light device", async () => {
    let { context, page } = await open("/", { width: 390, colorScheme: "dark" });
    let group = page.locator("[data-appearance]");
    await group.waitFor({ state: "visible" });
    await group.getByRole("button", { name: "Automatic", exact: true }).click();
    assert.equal(await group.locator("[data-lamplight-status]").innerText(), "On now, because your device is set to dark.");
    assert.equal((await attrs(page)).mode, "lamplight");
    assert.equal(await group.locator("[data-lamplight-status]").getAttribute("role"), "status");
    // Following the device while Automatic: the device turns light.
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForFunction(() => document.documentElement.dataset.mode === "light");
    assert.equal(await group.locator("[data-lamplight-status]").innerText(), "Off now, because your device is set to light.");
    await group.getByRole("button", { name: "Off", exact: true }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(200);
    assert.equal((await attrs(page)).mode, "light", "Off ignores the device");
    assert.equal(await group.locator("[data-lamplight-status]").innerText(), "");
    await context.close();
    ({ context, page } = await open("/", { width: 390, colorScheme: "light" }));
    group = page.locator("[data-appearance]");
    await group.waitFor({ state: "visible" });
    await group.getByRole("button", { name: "Automatic", exact: true }).click();
    assert.equal(await group.locator("[data-lamplight-status]").innerText(), "Off now, because your device is set to light.");
    await context.close();
  });

  await check("an old hfg-theme choice is carried into hfg-lamplight once and the old key removed", async () => {
    const { context, page } = await open("/", { width: 390, seed: { "hfg-theme": "dark" } });
    await page.locator("[data-appearance]").waitFor({ state: "visible" });
    assert.equal((await attrs(page)).mode, "lamplight", "the legacy choice applied at first paint");
    assert.equal(await stored(page, "hfg-lamplight"), "on");
    assert.equal(await stored(page, "hfg-theme"), null);
    assert.equal(await page.getByRole("button", { name: "On", exact: true }).getAttribute("aria-pressed"), "true");
    await context.close();
  });

  await check("first paint: a stored look is on <html> at DOMContentLoaded, before any later script", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
    await context.addInitScript(() => {
      localStorage.setItem("hfg-look", "marked");
      document.addEventListener("DOMContentLoaded", () => {
        const root = document.documentElement;
        window.__paint = {
          look: root.dataset.look,
          mode: root.dataset.mode,
          background: getComputedStyle(root).backgroundColor,
        };
      });
    });
    const page = await context.newPage();
    await page.goto(base + "/", { waitUntil: "load" });
    const paint = await page.evaluate(() => window.__paint);
    assert.deepEqual(paint, { look: "marked", mode: "light", background: "rgb(255, 253, 249)" });
    await context.close();
  });

  await check("blocked storage: the page still opens in Cover Light and the switch still works for the visit", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/", { waitUntil: "load" });
    assert.deepEqual(await attrs(page), { look: "cover", mode: "light", color: "#F3F1EE" });
    const group = page.locator("[data-appearance]");
    await group.waitFor({ state: "visible" });
    await group.getByRole("button", { name: "Marked page", exact: true }).click();
    assert.equal((await attrs(page)).look, "marked");
    assert.deepEqual(errors, [], "no uncaught error without storage");
    await context.close();
  });

  await check("the switch stays hidden without JavaScript", async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(base + "/", { waitUntil: "load" });
    assert.equal(await page.locator("[data-appearance]").isVisible(), false);
    assert.equal(await page.locator("header details").count(), 1, "the Menu is a details element");
    await page.locator("header summary").click();
    assert.equal(await page.locator("header details").getAttribute("open"), "", "the Menu opens without JavaScript");
    await context.close();
  });

  await check("without JavaScript a dark device still gets the dark page (media-query fallback)", async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "dark", viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(base + "/", { waitUntil: "load" });
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(26, 18, 14)");
    await context.close();
  });

  await check("at a 34px root (200%) the header, the open menu and the footer do not overflow at 390 and 320px", async () => {
    // The header and the footer are checked element by element, and then the whole page.
    const beyond = (page) =>
      page.evaluate(() => {
        const client = document.documentElement.clientWidth;
        return [...document.querySelectorAll("header *, footer *")]
          .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().right > client + 1)
          .map((el) => el.tagName + "." + el.className);
      });
    for (const width of [390, 320])
      for (const path of ["/", checkPath, "/bible/john/3"]) {
        const { context, page } = await open(path, { width, rootPx: 34 });
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), "34px");
        assert.deepEqual(await beyond(page), [], `${path} at ${width}px: header or footer reaches past the screen`);
        await page.locator("header summary").click();
        assert.deepEqual(await beyond(page), [], `${path} at ${width}px: the open menu reaches past the screen`);
        const { scroll, width: client } = await overflow(page);
        assert.ok(scroll <= client, `${path} at ${width}px and a 34px root scrolls sideways (${scroll} > ${client})`);
        await context.close();
      }
  });

  await check("home on a phone: the body's Open the app starts below the first screen, and is the only filled one (W1)", async () => {
    const { context, page } = await open("/", { width: 390 });
    const filled = page.locator("main a.button", { hasText: "Open the app" });
    assert.equal(await filled.count(), 1, "one filled Open the app in the body");
    const box = await filled.boundingBox();
    const scrollY = await page.evaluate(() => window.scrollY);
    assert.ok(box.y + scrollY >= 844, `the button starts at ${Math.round(box.y + scrollY)}px, inside the first 844px screen`);
    assert.equal(await page.locator("header a:visible", { hasText: "Open the app" }).count(), 0, "none in the bar at 390px");
    await context.close();
  });

  await check("home at 1280px: the bookcase stands beside the cover, six spines, the AI one marked", async () => {
    const { context, page } = await open("/", { width: 1280, height: 800 });
    const cover = await page.locator(".cover").boundingBox();
    const bookcase = await page.locator(".bookcase").boundingBox();
    assert.ok(bookcase.x >= cover.x + cover.width, "the bookcase is to the right of the cover");
    assert.ok(bookcase.y < cover.y + cover.height, "and beside it, not below it");
    assert.equal(await page.locator(".bookcase a.spine").count(), 6);
    for (const spine of await page.locator(".bookcase a.spine").all()) {
      const rect = await spine.boundingBox();
      assert.ok(rect.width >= 44 && rect.height >= 128 && rect.height <= 160, `a spine is ${rect.width} x ${rect.height}`);
    }
    const badges = await page.locator(".bookcase .ai-badge").evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    for (const size of badges) assert.ok(size >= 12.99, "the AI badge is at least 13px");
    await context.close();
    const phone = await open("/", { width: 390 });
    assert.equal(await phone.page.locator(".bookcase").isVisible(), false, "no bookcase on a phone: the All context checks row stands in");
    await phone.context.close();
  });

  await check("home at 320px and a 34px root: no sideways scroll, and the h1 is not clipped", async () => {
    const { context, page } = await open("/", { width: 320, rootPx: 34 });
    const { scroll, width } = await overflow(page);
    assert.ok(scroll <= width, `scrolls sideways (${scroll} > ${width})`);
    const clipped = await page.locator("h1").evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > document.documentElement.clientWidth);
    assert.equal(clipped, false, "the h1 fits");
    const cover = await page.locator(".cover").evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    assert.equal(cover, true, "the cover holds its content");
    await context.close();
  });

  await check("a context-check page: the AI note is a dashed frame, the share buttons use the interface face, no sideways scroll at 320px and a 34px root", async () => {
    const aiPath = await contextCheckPathBy("ai-unreviewed");
    if (aiPath) {
      const { context, page } = await open(aiPath, { width: 390 });
      const note = page.locator("p.ai-unreviewed");
      assert.equal(await note.count(), 1, "the AI note");
      assert.equal(await note.evaluate((el) => getComputedStyle(el).borderTopStyle), "dashed");
      assert.ok(parseFloat(await note.evaluate((el) => getComputedStyle(el).fontSize)) >= 17, "the note is Body 17");
      const noteBox = await note.boundingBox();
      const h1Box = await page.locator("main h1").boundingBox();
      assert.ok(noteBox.y < h1Box.y, "the note stands above the title");
      await context.close();
    }
    const approved = await contextCheckPathBy("approved");
    if (approved) {
      const { context, page } = await open(approved, { width: 390 });
      assert.equal(await page.locator("p.ai-unreviewed").count(), 0, "an approved check has no AI note");
      await context.close();
    }
    const { context, page } = await open(checkPath, { width: 390 });
    const faces = await page.locator(".share .button").evaluateAll((els) => els.map((el) => getComputedStyle(el).fontFamily));
    assert.ok(faces.length >= 4);
    for (const face of faces) assert.ok(face.startsWith("Manrope"), `a share button is set in ${face}`);
    await context.close();
    for (const width of [390, 320]) {
      const phone = await open(checkPath, { width, rootPx: 34 });
      const { scroll, width: client } = await overflow(phone.page);
      assert.ok(scroll <= client, `${checkPath} at ${width}px and a 34px root scrolls sideways (${scroll} > ${client})`);
      await phone.context.close();
    }
  });

  await check("the context-checks index: the bookcase beside nothing, rows are at least 52px, no sideways scroll", async () => {
    const { context, page } = await open("/context-checks", { width: 1280 });
    assert.equal(await page.locator(".bookcase a.spine").count(), 6);
    for (const row of await page.locator("a.row").all()) assert.ok((await row.boundingBox()).height >= 52);
    assert.ok((await overflow(page)).scroll <= 1280);
    await context.close();
    const phone = await open("/context-checks", { width: 320, rootPx: 34 });
    const { scroll, width } = await overflow(phone.page);
    assert.ok(scroll <= width, "no sideways scroll at 320px and a 34px root");
    await phone.context.close();
  });

  await check("a chapter page: the text column is centred on the page, the AI badge is 13px or more, verse numbers are 13px", async () => {
    const { context, page } = await open("/bible/john/3", { width: 1280, height: 800 });
    const box = await page.locator("article.scripture").boundingBox();
    const left = box.x;
    const right = 1280 - (box.x + box.width);
    assert.ok(Math.abs(left - right) < 0.1 * 1280, `the text column hugs one side (left ${Math.round(left)}px, right ${Math.round(right)}px)`);
    const number = await page.locator(".verse sup").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    assert.ok(number >= 13 && number <= 14, `verse numbers are Footnote 13 (13.8px on the 18px root), not ${number}`);
    const scripture = await page.locator(".verse").first().evaluate((el) => getComputedStyle(el).fontFamily);
    assert.ok(scripture.startsWith("Gelasio"), `Scripture is set in ${scripture}`);
    await context.close();
    const withAi = await open("/bible/psalms/23", { width: 390 });
    const sizes = await withAi.page.locator("[data-layer=ai] .ai-badge").evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    assert.ok(sizes.length > 0, "Psalm 23 has an AI explanation with its badge");
    for (const size of sizes) assert.ok(size >= 12.99, `the AI badge is ${size}px`);
    const frame = await withAi.page.locator("section[data-layer=ai]").evaluate((el) => getComputedStyle(el).borderTopStyle);
    assert.equal(frame, "dashed", "the AI layer keeps its dashed frame");
    await withAi.context.close();
  });

  await check("200% sweep: at a 34px root on 390 and 320px nothing scrolls sideways, no heading is clipped, controls are 44px or taller", async () => {
    const topic = await topicPath();
    const sweep = ["/", "/bible/john/3", checkPath, ...(topic ? [topic] : []), "/privacy", "/about", "/context-checks", "/bible", "/bible/john", "/beta", "/resources"];
    for (const width of [390, 320])
      for (const path of sweep) {
        const { context, page } = await open(path, { width, rootPx: 34 });
        const { scroll, width: client } = await overflow(page);
        assert.ok(scroll <= client, `${path} at ${width}px and a 34px root scrolls sideways (${scroll} > ${client})`);
        const clipped = await page.evaluate(() =>
          [...document.querySelectorAll("main h1, main h2, main h3")]
            .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
            .map((el) => el.textContent.trim().slice(0, 40)),
        );
        assert.deepEqual(clipped, [], `${path} at ${width}px: clipped headings`);
        const small = await page.evaluate(() =>
          [...document.querySelectorAll("main a.button, main button, main summary")]
            .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height < 43.5)
            .map((el) => el.textContent.trim().slice(0, 40)),
        );
        assert.deepEqual(small, [], `${path} at ${width}px: controls under 44px`);
        await context.close();
      }
  });

  await check("Lamplight (direction B, plan 16): the home cover has no slab, a lamp glow and the salmon pill; from 900px the hero is one centred column with the bookcase below it; check cards are raised cards; the verse cover has no slab; the light modes keep their block", async () => {
    const lamplight = { "hfg-look": "cover", "hfg-lamplight": "on" };
    const style = (locator, property, pseudo) => locator.evaluate((el, [p, ps]) => getComputedStyle(el, ps)[p], [property, pseudo]);
    for (const width of [390, 1280]) {
      const { context, page } = await open("/", { width, height: 900, colorScheme: "dark", seed: lamplight });
      const where = `home at ${width}px`;
      const cover = page.locator(".hero-cover .cover");
      assert.equal(await style(cover, "backgroundColor"), "rgba(0, 0, 0, 0)", `${where}: no leather slab`);
      for (const part of [".orn", ".ribbon"])
        for (const el of await cover.locator(part).all()) assert.equal(await style(el, "display"), "none", `${where}: ${part} is not drawn`);
      assert.equal(await style(cover, "display", "::before"), "none", `${where}: no gilt rule`);
      const glow = await style(page.locator(".hero-cover .cover-wrap"), "backgroundImage", "::before");
      assert.match(glow, /radial-gradient\(closest-side/, `${where}: a radial pool of light`);
      assert.match(glow, /rgba\(240, 201, 135, 0\.17\)/, `${where}: B's glow`);
      const pill = page.locator(".hero-cover .cover-button");
      assert.equal(await style(pill, "backgroundColor"), "rgb(185, 120, 98)", `${where}: the pill is #B97862`);
      assert.equal(await style(pill, "color"), "rgb(26, 18, 14)", `${where}: the pill text is #1A120E`);
      assert.ok(parseFloat(await style(pill, "borderTopLeftRadius")) >= 24, `${where}: a pill`);
      assert.ok((await pill.boundingBox()).height >= 48, `${where}: 48px or more`);
      assert.equal(await style(page.locator(".hero-cover .ref"), "color"), "rgb(226, 174, 150)", `${where}: the reference is #E2AE96`);
      const coverBox = await page.locator(".hero-cover").boundingBox();
      if (width === 1280) {
        const caseBox = await page.locator(".hero-case").boundingBox();
        assert.ok(caseBox.y > coverBox.y + coverBox.height - 1, "the bookcase stands below the hero, not beside it");
        const mid = coverBox.x + coverBox.width / 2;
        assert.ok(Math.abs(mid - 640) <= 4, `the hero is centred (${mid})`);
        const text = await page.locator(".hero-cover .cover").evaluate((el) => ({ max: el.getBoundingClientRect().width, size: parseFloat(getComputedStyle(document.documentElement).fontSize) }));
        assert.ok(text.max <= 34.5 * text.size, `the text column is about 34rem at most (${text.max}px)`);
        assert.equal(await style(cover, "textAlign"), "center");
        assert.ok((await pill.boundingBox()).width < 520, "the pill is as wide as its words on a desktop");
      } else {
        assert.equal(await page.locator(".hero-case").isVisible(), false, "a phone stays one column, with no bookcase");
        assert.ok(Math.abs((await pill.boundingBox()).width - (await cover.boundingBox()).width) <= 1, "full width on a phone");
      }
      const { scroll, width: client } = await overflow(page);
      assert.ok(scroll <= client, `${where}: no sideways scroll`);
      await context.close();
    }
    // 200 % text in Lamplight: nothing scrolls sideways and no heading is clipped on the pages that changed.
    for (const width of [390, 320])
      for (const path of ["/", "/context-checks", "/bible/john/3", checkPath]) {
        const { context, page } = await open(path, { width, colorScheme: "dark", seed: lamplight, rootPx: 34 });
        const { scroll, width: client } = await overflow(page);
        assert.ok(scroll <= client, `${path} in Lamplight at ${width}px, 34px root scrolls sideways (${scroll} > ${client})`);
        const clipped = await page.locator("h1").evaluateAll((list) => list.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
        assert.equal(clipped, 0, `${path}: no clipped h1`);
        await context.close();
      }
    // The light modes keep the leather block and the two columns.
    {
      const { context, page } = await open("/", { width: 1280, height: 900, seed: { "hfg-look": "cover", "hfg-lamplight": "off" } });
      assert.notEqual(await style(page.locator(".hero-cover .cover"), "backgroundColor"), "rgba(0, 0, 0, 0)", "Cover Light keeps its block");
      const coverBox = await page.locator(".hero-cover").boundingBox();
      const caseBox = await page.locator(".hero-case").boundingBox();
      assert.ok(caseBox.x > coverBox.x + coverBox.width - 1, "Cover Light keeps the bookcase beside the cover");
      await context.close();
    }
    // Check cards: the overview and a chapter page.
    for (const [path, rows] of [["/context-checks", ".list .row"], ["/bible/john/3", ".checks .row"]]) {
      const { context, page } = await open(path, { width: 390, colorScheme: "dark", seed: lamplight });
      const row = page.locator(rows).first();
      if ((await row.count()) === 0) {
        await context.close();
        continue;
      }
      assert.equal(await style(row, "backgroundColor"), "rgb(37, 25, 20)", `${path}: the raised card #251914`);
      assert.ok(parseFloat(await style(row, "borderTopLeftRadius")) >= 20, `${path}: the radius of the design system`);
      assert.equal(await style(row.locator(".row-ref"), "fontStyle"), "italic", `${path}: the reference is italic`);
      assert.equal(await style(row.locator(".row-ref"), "color"), "rgb(226, 174, 150)", `${path}: in --link`);
      assert.match(await style(row.locator(".row-ref"), "fontFamily"), /Gelasio/, `${path}: in the serif`);
      assert.equal(await style(row.locator(".row-hook"), "color"), "rgb(246, 240, 231)", `${path}: the hook is cream`);
      assert.equal(await style(row.locator(".row-text"), "content", "::after"), '"Read the story"', `${path}: "Read the story" as a salmon link`);
      assert.equal(await style(row.locator(".row-text"), "color", "::after"), "rgb(226, 174, 150)");
      assert.ok((await row.boundingBox()).height >= 52, `${path}: 52px or taller`);
      await context.close();
    }
    // The verse cover on a check page: no slab, the same glow.
    {
      const { context, page } = await open(checkPath, { width: 390, colorScheme: "dark", seed: lamplight });
      const verse = page.locator(".cover-wrap.is-verse .cover");
      assert.equal(await style(verse, "backgroundColor"), "rgba(0, 0, 0, 0)", "the verse cover has no slab");
      assert.match(await style(page.locator(".cover-wrap.is-verse"), "backgroundImage", "::before"), /rgba\(240, 201, 135, 0\.17\)/, "and the lamp glow");
      await context.close();
    }
  });

  await check("the shop is prominent and calm (founder, 2026-10-22): Shop in the header and the phone menu, the primary Visit the shop on /resources, the Study Bibles band on the home in Light and Lamplight, nothing next to Start here", async () => {
    // Header at 1280px: "Shop" replaces "Resources", same address, still six links.
    let { context, page } = await open("/", { width: 1280 });
    const nav = page.locator("header .main-nav a");
    assert.deepEqual(await nav.allInnerTexts(), ["Bible", "Context checks", "Topics", "Articles", "Shop", "About"]);
    assert.equal(await nav.filter({ hasText: "Shop" }).getAttribute("href"), "/resources", "old /resources links keep working");
    await context.close();
    // The phone menu shows it the same way, 44px tall.
    ({ context, page } = await open("/", { width: 390 }));
    await page.locator("header summary").click();
    const link = page.locator("header details nav li:not(.menu-app) a", { hasText: "Shop" });
    assert.equal(await link.getAttribute("href"), "/resources");
    assert.ok((await link.boundingBox()).height >= 44);
    await context.close();
    // /resources is now the Shop page: H1, one primary button to the shop above the Bibles, each Bible keeps its button.
    ({ context, page } = await open("/resources", { width: 390 }));
    assert.equal(await page.locator("main h1").innerText(), "Shop");
    assert.equal(await page.title(), "Shop | HisFullGlory");
    const primary = page.locator("main a.button:not(.secondary)", { hasText: "Visit the shop" });
    assert.equal(await primary.count(), 1, "one primary Visit the shop");
    assert.equal(await primary.getAttribute("href"), "https://shop.hisfullglory.com");
    const primaryBox = await primary.boundingBox();
    const firstBible = await page.locator("main ul.list li").first().boundingBox();
    assert.ok(primaryBox.y + primaryBox.height <= firstBible.y, "the button is above the three Bibles");
    assert.ok(primaryBox.height >= 44);
    const buttons = page.locator("main ul.list a.button", { hasText: "View in the shop" });
    assert.equal(await buttons.count(), 3);
    for (const href of await buttons.evaluateAll((list) => list.map((a) => a.getAttribute("href"))))
      assert.match(href, /^https:[/][/]shop[.]hisfullglory[.]com[/]products[/][a-z0-9-]+$/);
    await context.close();
    // The home band, in Light and Lamplight, phone and desktop.
    for (const [seed, label] of [[{}, "Light"], [{ "hfg-lamplight": "on" }, "Lamplight"]])
      for (const width of [390, 1280]) {
        ({ context, page } = await open("/", { width, seed }));
        const band = page.locator("section.shop-band");
        assert.equal(await band.locator("h2").innerText(), "Study Bibles for your walk");
        const order = await page.locator("main section.block").evaluateAll((els) => els.map((el) => ["intro", "shop-band", "layers-block", "start"].find((c) => el.classList.contains(c))));
        assert.deepEqual(order, ["intro", "shop-band", "layers-block", "start"], `${label} ${width}: the band sits after the intro and before the four layers`);
        const cards = band.locator("a.bible-card");
        assert.equal(await cards.count(), 3);
        for (const card of await cards.all()) {
          assert.match(await card.getAttribute("href"), /^https:[/][/]shop[.]hisfullglory[.]com[/]products[/][a-z0-9-]+$/);
          assert.match(await card.innerText(), /[$][0-9]+[.][0-9][0-9] USD/, "each card shows its price");
          assert.ok((await card.boundingBox()).height >= 52);
        }
        assert.match(await band.innerText(), /From [$]49[.]99 USD/);
        const visit = band.getByRole("link", { name: "Visit the shop", exact: true });
        assert.equal(await visit.getAttribute("href"), "https://shop.hisfullglory.com");
        assert.equal(await visit.evaluate((el) => el.classList.contains("secondary")), true, "the page keeps its one filled button");
        assert.equal(await page.locator("main a.button:not(.secondary)").count(), 1, "only Open the app is filled");
        // Nothing from the shop sits next to the Start here topics.
        assert.equal(await page.locator("section.start a[href*='shop.hisfullglory.com'], section.start img").count(), 0);
        if (label === "Lamplight") {
          const raised = await cards.first().evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor }));
          const layer = await page.locator("section.start .topics a").first().evaluate((el) => getComputedStyle(el).backgroundColor);
          assert.equal(raised.bg, layer, "a raised card, like the others");
          assert.equal(raised.border, "rgba(0, 0, 0, 0)", "no edge line in Lamplight");
        }
        if (width === 1280) {
          const tops = await cards.evaluateAll((list) => list.map((el) => el.getBoundingClientRect().y));
          assert.ok(Math.max(...tops) - Math.min(...tops) < 2, "side by side from 768px");
        }
        const { scroll, width: client } = await overflow(page);
        assert.ok(scroll <= client, `${label} ${width}: no sideways scroll`);
        await context.close();
      }
    // 200 % text at 320px: the band holds.
    ({ context, page } = await open("/", { width: 320, rootPx: 34 }));
    const { scroll, width: client } = await overflow(page);
    assert.ok(scroll <= client, "the band scrolls sideways at 320px and 34px");
    await context.close();
  });

  await check("the skip link is off-screen until focused, at a 34px root too", async () => {
    const { context, page } = await open("/", { width: 390, rootPx: 34 });
    const skip = page.locator("a.skip-link");
    let box = await skip.boundingBox();
    assert.ok(box.y + box.height <= 0, "off-screen");
    await page.keyboard.press("Tab");
    box = await skip.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height > 0, "on-screen when focused");
    await context.close();
  });

  assert.deepEqual(pageErrors, [], "no uncaught page errors");
  assert.deepEqual(consoleErrors, [], "no console errors");
  assert.deepEqual(failedRequests, [], "no failed requests");
  console.log(`${checks} site browser checks passed; no page or console errors; no screenshots captured.`);
} finally {
  await browser.close();
}
