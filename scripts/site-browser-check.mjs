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
    for (const size of badges) assert.ok(size >= 13, "the AI badge is at least 13px");
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
