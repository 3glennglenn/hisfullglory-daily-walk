import assert from "node:assert/strict";
import { products } from "../src/config.ts";

// Phase 01.2, plan 01: the navigation, in a real browser (D-01 to D-03, N-01 to N-03). Three tabs (Today, Bible,
// Community) in the floating capsule, the round You button in the title row of each tab's root, You as a sheet over
// the tab the reader was on (a phone) and as a page under the sidebar (from 768px), and every old address.
// Each case opens a context of its own (the harness seeds a reader who already answered the welcome questions).

async function open(browser, base, path, { width = 390, height = 844 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    serviceWorkers: "block",
    timezoneId: "Europe/Amsterdam",
    colorScheme: "light",
  });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(base + path);
  await page.locator("main h1").first().waitFor();
  return { context, page, problems };
}

const youSheet = (page) => page.getByRole("dialog", { name: "You", exact: true });
const pathOf = (page) => new URL(page.url()).pathname;
const hashOf = (page) => new URL(page.url()).pathname + new URL(page.url()).hash;
const youFocused = (page) =>
  page.waitForFunction(() => document.activeElement?.classList.contains("you-button"), undefined, { timeout: 3000 });

/** Opens the sheet with the You button of the page and waits until it is settled and has its focus. */
async function openYou(page) {
  await page.locator("main .title-row").getByRole("link", { name: "You", exact: true }).click();
  await page.waitForURL("**/you");
  const sheet = youSheet(page);
  await sheet.waitFor();
  await page.waitForFunction(() => document.getAnimations().length === 0);
  return sheet;
}

/** Each way of closing the sheet: the URL is back on the tab root, no dialog is open and focus is on the You button. */
async function assertClosed(page, root, how) {
  await page.waitForURL((url) => url.pathname === root, { timeout: 5000 }).catch(() => assert.fail(`${how}: the address is ${root}`));
  await youSheet(page).waitFor({ state: "detached" });
  await youFocused(page).catch(() => assert.fail(`${how}: focus is back on the You button`));
}

/** A swipe down on the sheet head: the large detent first settles at the medium one on a short swipe, a long one dismisses. */
async function swipeDown(page, sheet) {
  const handle = await sheet.locator(".sheet-grabber").evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  for (const f of [0.3, 0.6, 1]) {
    await page.mouse.move(handle.x, handle.y + 320 * f);
    await page.waitForTimeout(110);
  }
  await page.mouse.up();
}

// a, b, c, d, e: a phone, the tab bar, Today's You button and the sheet with its contents and its four ways out.
async function phoneTabsAndSheet(browser, base) {
  const { context, page, problems } = await open(browser, base, "/");
  try {
    // (a) Three tabs, links, in the capsule inset 40px from each side.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    assert.equal(await nav.count(), 1, "one main navigation");
    assert.deepEqual(await nav.getByRole("link").allInnerTexts(), ["Today", "Bible", "Community"], "three visible links");
    assert.equal(await nav.getByRole("button").count(), 0, "tabs are links, not buttons");
    assert.deepEqual(
      await nav.getByRole("link").evaluateAll((list) => list.map((a) => a.getAttribute("href"))),
      ["/", "/bible", "/community"],
    );
    const capsule = await nav.boundingBox();
    assert.ok(Math.abs(capsule.x - 40) <= 1, `the capsule's left edge is 40px (${capsule.x})`);
    assert.ok(Math.abs(capsule.x + capsule.width - 350) <= 1, `the capsule's right edge is 350px (${capsule.x + capsule.width})`);
    assert.deepEqual(await nav.locator('a[aria-current="page"]').allInnerTexts(), ["Today"]);

    // (b) The You button: one link named You in Today's title row, at least 44 x 44, to the right of the h1.
    const row = page.locator("main .title-row");
    const you = row.getByRole("link", { name: "You", exact: true });
    assert.equal(await you.count(), 1, "one You link in Today's title row");
    assert.equal(await you.getAttribute("href"), "/you");
    const box = await you.boundingBox();
    const h1 = await page.locator("main h1").boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `the You button is at least 44 x 44 (${box.width} x ${box.height})`);
    assert.ok(box.x >= h1.x + 1 && box.x > h1.x + h1.width * 0.2, "the You button is right of the title");
    assert.equal(await page.locator("main h1").count(), 1, "one h1 in main");

    // (c) It opens the sheet: URL /you, a dialog named You, focus on its title, the contents of D-02 in order.
    const sheet = await openYou(page);
    await page.waitForFunction(
      () => document.activeElement?.tagName === "H2" && document.activeElement.textContent === "You" && !!document.activeElement.closest("dialog"),
      undefined,
      { timeout: 3000 },
    ).catch(() => assert.fail("focus is on the sheet's title"));
    assert.equal(await page.locator("main h1").innerText(), "Today", "Today stays under the sheet");
    const text = await sheet.innerText();
    let at = 0;
    for (const part of [
      "Sign in",
      "Join the community and keep your account safe.",
      "Your walk",
      "My walk",
      "0 days",
      "My prayers",
      "Journal",
      "Give where it helps most",
      "Charities chosen by independent evaluators",
      "Settings",
      "Appearance",
      "Automatic",
      "Day",
      "Night light",
      "Follows your device: Night light when it is dark.",
      "Theme",
      "Cover and story",
      "Daily reminder",
      "Off",
      "Privacy and your data",
      "Help, privacy and terms",
      "Scripture: World English Bible, public domain.",
    ]) {
      const found = text.indexOf(part, at);
      assert.ok(found >= 0, `"${part}" comes in order in the sheet: ${JSON.stringify(text)}`);
      at = found + part.length;
    }
    assert.equal(await sheet.locator('a[href="/shop"], a[href*="shop.hisfullglory"]').count(), 0, "no link to the shop in the sheet");
    assert.equal(await sheet.locator(".shop-feature, .give-feature").count(), 0, "no Give or Shop card in the sheet");
    assert.equal(await sheet.getByText("Days walked", { exact: true }).count(), 0);
    assert.equal(await sheet.getByText("Your shelf").count(), 0);
    assert.equal(await sheet.getByText("Daily rhythm").count(), 0);
    const done = sheet.getByRole("button", { name: "Done, close You", exact: true });
    assert.equal(await done.innerText(), "Done", "the Done button reads Done and is named Done, close You");
    assert.equal(await sheet.getByRole("button", { name: "Done", exact: true }).count(), 0, "no button is named only Done (01.1 UI-SPEC 15 item 9)");

    // (d) Four ways out: Done, Escape, a swipe down, the browser's Back.
    await done.click();
    await assertClosed(page, "/", "Done");
    await openYou(page);
    await page.keyboard.press("Escape");
    await assertClosed(page, "/", "Escape");
    const swiped = await openYou(page);
    await swipeDown(page, swiped);
    await assertClosed(page, "/", "a swipe down");
    await openYou(page);
    await page.goBack();
    await assertClosed(page, "/", "Back");

    // (e) Each row leads where D-02 says, and Back returns to the sheet.
    for (const [name, path] of [
      [/^Sign in/, "/profile"],
      [/^My walk/, "/my-walk"],
      [/^My prayers/, "/pray"],
      [/^Journal/, "/journal"],
      [/^Give where it helps most/, "/give"],
      [/^Theme/, "/settings/appearance"],
      [/^Daily reminder/, "/settings/reminders"],
      [/^Privacy and your data/, "/settings#privacy"],
      [/^Help, privacy and terms/, "/settings#about"],
    ]) {
      const open = await openYou(page);
      const link = open.getByRole("link", { name });
      assert.equal(await link.getAttribute("href"), path, String(name));
      const rowBox = await link.boundingBox();
      assert.ok(rowBox.height >= 44, `${name} is at least 44px tall`);
      await link.click();
      await page.waitForURL((url) => url.pathname + url.hash === path);
      await page.locator("main h1").first().waitFor();
      if (path === "/settings#privacy" || path === "/settings#about") {
        const id = path.split("#")[1];
        await page.waitForFunction(
          (id) => {
            const r = document.getElementById(id)?.getBoundingClientRect();
            return !!r && r.top < innerHeight && r.bottom > 0;
          },
          id,
        ).catch(() => assert.fail(`#${id} is scrolled into view`));
      }
      if (path === "/settings#about")
        for (const legal of ["Privacy policy", "Terms of use"]) {
          const l = page.getByRole("link", { name: new RegExp("^" + legal) });
          const lb = await l.boundingBox();
          assert.ok(lb && lb.y < 844 && lb.y + lb.height > 0, `${legal} is in view at /settings#about`);
        }
      await page.goBack();
      await youSheet(page).waitFor();
      assert.equal(pathOf(page), "/you", `Back from ${path} returns to the sheet`);
      assert.equal(await page.locator("main h1").innerText(), "Today", "over Today");
      await page.goBack();
      await youSheet(page).waitFor({ state: "detached" });
    }
    assert.deepEqual(problems, [], "no page errors");
  } finally {
    await context.close();
  }
}

// f: /you opened directly shows the sheet over Today, and Done replaces /you with /.
async function directYou(browser, base) {
  const { context, page, problems } = await open(browser, base, "/");
  try {
    await page.goto(base + "/you");
    const sheet = youSheet(page);
    await sheet.waitFor();
    assert.equal(await page.locator("main h1").innerText(), "Today", "the sheet stands over Today");
    await sheet.getByRole("button", { name: "Done, close You", exact: true }).click();
    await youSheet(page).waitFor({ state: "detached" });
    assert.equal(pathOf(page), "/");
    await page.goBack();
    assert.equal(pathOf(page), "/", "Back does not return to the closed sheet: /you was replaced by /");
    assert.equal(await youSheet(page).count(), 0);
    assert.deepEqual(problems, [], "no page errors");
  } finally {
    await context.close();
  }
}

// g: what the older navigation check pinned and still holds.
async function carriedOver(browser, base) {
  const { context, page, problems } = await open(browser, base, "/");
  try {
    assert.equal(await page.locator("header.brand, .brand-name").count(), 0, "no wordmark-and-slogan header");
    assert.equal(await page.getByRole("button", { name: "Open settings" }).count(), 0, "no heart button that opens settings");
    assert.equal(await page.getByText("JESUS AT THE CENTER").count(), 0, "no slogan row");
    // An old /more link is replaced by /you in place, so Back does not return to it.
    await page.goto(base + "/");
    await page.goto(base + "/more");
    await page.locator("main h1").first().waitFor();
    assert.equal(pathOf(page), "/you");
    await youSheet(page).waitFor();
    await page.goBack();
    assert.equal(pathOf(page), "/", "Back from /you returns to where the old link was opened, not to /more");
    // The sub-path allowlist: anything else is not found.
    await page.goto(base + "/settings/other");
    await page.locator("main h1").first().waitFor();
    assert.equal(await page.locator("main h1").innerText(), "Page not found");
    // Account and Settings are named for what they are.
    await page.goto(base + "/profile");
    await page.locator("main h1").first().waitFor();
    assert.equal(await page.locator("main h1").innerText(), "Account");
    assert.ok((await page.locator("main h2").allInnerTexts()).includes("Account and privacy"));
    assert.equal(await page.getByText("daily walks completed").count(), 0, "the stats card left Account");
    await page.goto(base + "/settings");
    await page.locator("main h1").first().waitFor();
    assert.equal(await page.locator("main h1").innerText(), "Settings");
    const sections = await page.locator("main h2").allInnerTexts();
    for (const name of ["Daily rhythm", "Privacy and your data", "About and legal"]) assert.ok(sections.includes(name), name);
    assert.equal(await page.getByText("Your rhythm, your settings.").count(), 0);
    assert.equal(await page.getByText(/Browser storage\s+is unencrypted/).count(), 0, "the long privacy paragraph is gone");
    assert.equal(await page.getByText("Your journal, prayers and reading progress stay on this device.").count(), 1);
    await page.goto(base + "/settings/reminders");
    await page.locator("main h1").first().waitFor();
    assert.equal(await page.locator("main h1").innerText(), "Daily reminder");
    assert.deepEqual(problems, [], "no page errors");
  } finally {
    await context.close();
  }
}

const marked = (page) => page.locator('nav.tabbar a[aria-current="page"]').allInnerTexts();
const youLinks = (page) => page.locator("a.you-button").count();

// Roots and Back (D-02, D-03): the You button is on the root of each tab and nowhere else; on a phone the sheet stands
// over the tab the reader was on, a screen reached from it keeps that tab marked, and Back and Done return there.
async function rootsAndBack(browser, base, published) {
  const { context, page, problems } = await open(browser, base, "/bible");
  try {
    for (const [path, name] of [["/bible", "Bible"], ["/community", "Community"]]) {
      await page.goto(base + path);
      await page.locator("main h1").first().waitFor();
      assert.equal(await page.locator("main .title-row").getByRole("link", { name: "You", exact: true }).count(), 1, `${path}: one You link in the title row`);
      assert.equal(await page.locator("main h1").innerText(), name);
      const box = await page.locator("main .title-row a.you-button").boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `${path}: the You button is at least 44 x 44`);
    }
    // Pushed screens and the full-screen flows have none.
    const newest = published[0].slug;
    for (const path of ["/bible/john/3", "/community/grief", "/community/circles", "/settings", "/my-walk", "/walk", "/context/" + newest]) {
      await page.goto(base + path);
      await page.locator("main h1").first().waitFor();
      assert.equal(await youLinks(page), 0, `${path}: no You button`);
    }
    for (const path of ["/walk", "/context/" + newest]) {
      await page.goto(base + path);
      await page.locator("main h1").first().waitFor();
      assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).count(), 0, `${path}: no tab bar`);
    }

    // A phone: the sheet over the tab the reader was on, with that tab marked; the same from Bible and from Community.
    for (const [path, tab] of [["/bible", "Bible"], ["/community", "Community"]]) {
      await page.goto(base + path);
      await page.locator("main h1").first().waitFor();
      const sheet = await openYou(page);
      assert.equal(await page.locator("main h1").innerText(), tab, `the sheet stands over ${tab}`);
      assert.deepEqual(await marked(page), [tab], `${tab} stays marked under the sheet`);
      await sheet.getByRole("link", { name: /^My walk/ }).click();
      await page.waitForURL("**/my-walk");
      await page.locator("main h1", { hasText: "My walk" }).waitFor();
      assert.deepEqual(await marked(page), [tab], `${tab} stays marked on a screen reached from You`);
      await page.getByRole("button", { name: "Back to You", exact: true }).click();
      await page.waitForURL("**/you");
      await youSheet(page).waitFor();
      assert.equal(await page.locator("main h1").innerText(), tab, `Back to You returns to the sheet over ${tab}`);
      await sheet.getByRole("button", { name: "Done, close You", exact: true }).click();
      await assertClosed(page, path, `Done over ${tab}`);
      assert.deepEqual(await marked(page), [tab]);
    }
    // Tapping another tab with the sheet closed still works, and the next sheet stands over the new tab.
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Today", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await openYou(page);
    assert.equal(await page.locator("main h1").innerText(), "Today");
    assert.deepEqual(problems, [], "no page errors");
  } finally {
    await context.close();
  }
}

// From 768px You is a page in the sidebar layout (N-01, N-03); a resize across the width swaps page and sheet.
async function widePage(browser, base) {
  for (const [width, height] of [[768, 1024], [1180, 820]]) {
    const { context, page, problems } = await open(browser, base, "/community", { width, height });
    try {
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      assert.deepEqual(await nav.getByRole("link").allInnerTexts(), ["Today", "Bible", "Community", "You"], `${width}px: four sidebar links`);
      assert.deepEqual(await marked(page), ["Community"]);
      // The You button opens the page, not a sheet.
      await page.locator("main .title-row a.you-button").click();
      await page.waitForURL("**/you");
      await page.locator("main h1", { hasText: "You" }).waitFor();
      assert.equal(await page.getByRole("dialog").count(), 0, `${width}px: no dialog`);
      assert.equal(await page.locator("main h1").innerText(), "You");
      assert.deepEqual(await marked(page), ["You"], `${width}px: You is the marked sidebar item`);
      assert.equal(await nav.locator('a[aria-current="page"]').getAttribute("href"), "/you");
      const main = await page.locator("main").boundingBox();
      assert.ok(main.width <= 681, `${width}px: the content column is at most 680px (${main.width})`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px: no sideways scroll`);
      assert.match(await page.locator("main").innerText(), /Sign in[\s\S]*Your walk[\s\S]*My walk[\s\S]*Give where it helps most[\s\S]*Settings[\s\S]*Help, privacy and terms[\s\S]*World English Bible/);
      assert.equal(await page.locator("main .you-page .title-row").count(), 0, "the You page has no You button of its own");
      // The sidebar's own You item opens the same page from another tab.
      await nav.getByRole("link", { name: "Bible", exact: true }).click();
      await page.waitForURL("**/bible");
      await nav.getByRole("link", { name: "You", exact: true }).click();
      await page.waitForURL("**/you");
      assert.equal(await page.locator("main h1").innerText(), "You");
      assert.equal(await page.getByRole("dialog").count(), 0);
      // A screen reached from You marks You, and Back returns to the page.
      await page.getByRole("link", { name: /^My walk/ }).click();
      await page.waitForURL("**/my-walk");
      assert.deepEqual(await marked(page), ["You"]);
      await page.getByRole("button", { name: "Back to You", exact: true }).click();
      await page.waitForURL("**/you");
      assert.equal(await page.locator("main h1").innerText(), "You");
      if (width === 1180) {
        // Resizing across 768px swaps the page for the sheet over the last tab root, without a reload.
        await page.setViewportSize({ width: 390, height: 844 });
        await youSheet(page).waitFor();
        assert.equal(await page.locator("main h1").innerText(), "Bible", "the sheet stands over the last tab root");
        assert.deepEqual(await marked(page), ["Bible"]);
        await page.setViewportSize({ width: 1180, height: 820 });
        await youSheet(page).waitFor({ state: "detached" });
        assert.equal(await page.locator("main h1").innerText(), "You", "and back to the page");
        assert.deepEqual(await marked(page), ["You"]);
      }
      assert.deepEqual(problems, [], `${width}px: no page errors`);
    } finally {
      await context.close();
    }
  }
}

// d: /circles is replaced in place by /community/circles.
async function oldCircles(browser, base) {
  const { context, page, problems } = await open(browser, base, "/");
  try {
    await page.goto(base + "/circles");
    await page.locator("main h1").first().waitFor();
    assert.equal(pathOf(page), "/community/circles");
    assert.deepEqual(await marked(page), ["Community"]);
    await page.goBack();
    assert.equal(pathOf(page), "/", "Back does not return to /circles");
    assert.deepEqual(problems, [], "no page errors");
  } finally {
    await context.close();
  }
}

// [path, what is marked: a tab, "you" (a screen reached from You: the tab of the last root on a phone, You when wide),
//  "none" (no tab) or "flow" (no tab bar at all); on a phone an address of You opened directly has no tab root behind it
//  and marks no tab, except /you and /more, which are the sheet over Today]
function addressList(newest) {
  return [
    ["/", "Today"],
    ["/walk", "flow"],
    ["/bible", "Bible"],
    ["/bible/john/3", "Bible"],
    ["/bible/john/3/16", "Bible"],
    ["/bible/john/3?tab=context", "Bible"],
    ["/context", "Bible"],
    ["/context/" + newest, "flow"],
    ["/shelf", "Bible"],
    ["/pray", "you"],
    ["/community", "Community"],
    ["/community/grief", "Community"],
    ["/community/circles", "Community"],
    ["/you", "you"],
    ["/profile", "you"],
    ["/settings", "you"],
    ["/settings/appearance", "you"],
    ["/settings/reminders", "you"],
    ["/my-walk", "you"],
    ["/journal", "you"],
    ["/grow", "you"],
    ["/grow/anxiety", "you"],
    ["/give", "you"],
    ["/giving-policy", "you"],
    ["/shop", "you"],
    ["/more", "you"],
    ["/circles", "Community"],
    ["/no-such-page", "none"],
  ];
}

// e: every current address opens at three widths, with one main h1, no page error and the right tab marked.
async function addressSweep(browser, base, published) {
  const addresses = addressList(published[0].slug);
  const backToYou = new Set(["/profile", "/settings", "/settings/appearance", "/settings/reminders", "/my-walk", "/journal", "/grow", "/give"]);
  for (const [width, height] of [[390, 844], [768, 1024], [1180, 820]]) {
    const { context, page, problems } = await open(browser, base, "/", { width, height });
    try {
      for (const [path, expected] of addresses) {
        await page.goto(base + path);
        await page.locator("main h1").first().waitFor();
        const where = `${path} at ${width}px`;
        assert.equal(await page.locator("main h1").count(), 1, `${where}: exactly one main h1`);
        const nav = page.getByRole("navigation", { name: "Main navigation" });
        if (expected === "flow") {
          assert.equal(await nav.count(), 0, `${where}: no tab bar`);
          assert.equal(await youLinks(page), 0, `${where}: no You button`);
          continue;
        }
        const sheetOverToday = path === "/you" || path === "/more";
        const want = expected === "none" ? [] : expected === "you" ? (width >= 768 ? ["You"] : sheetOverToday ? ["Today"] : []) : [expected];
        assert.deepEqual(await marked(page), want, `${where}: tab marked`);
        if (backToYou.has(path)) assert.equal(await page.getByRole("button", { name: "Back to You", exact: true }).count(), 1, `${where}: Back to You`);
        if (path === "/you") {
          if (width >= 768) assert.equal(await page.getByRole("dialog").count(), 0, `${where}: a page`);
          else await youSheet(page).waitFor();
        }
      }
      assert.deepEqual(problems, [], `${width}px: no page errors`);
    } finally {
      await context.close();
    }
  }
}

export async function checkNavigation(browser, base, published) {
  await phoneTabsAndSheet(browser, base);
  await directYou(browser, base);
  await carriedOver(browser, base);
  await rootsAndBack(browser, base, published);
  await widePage(browser, base);
  await oldCircles(browser, base);
  await addressSweep(browser, base, published);
}

/**
 * A reader never sees the old name of the mode (01.2 D-08): on every address of the sweep, in Day and in Night light, and in
 * the You sheet opened once on "/", the visible text, the page title and every aria-label, title, alt and field hint
 * (placeholder, aria-placeholder, the text an aria-describedby points to) have no match for /lamplight/i. A page is read
 * only after its main heading is there; the reader was seeded as one who already answered the welcome questions.
 */
export async function checkNoOldModeName(browser, base, published) {
  const addresses = addressList(published[0].slug);
  const everythingAReaderSees = () => {
    const attributes = [];
    for (const element of document.querySelectorAll("*")) {
      for (const name of ["aria-label", "title", "alt", "placeholder", "aria-placeholder", "aria-description", "aria-roledescription", "value"]) {
        const value = element.getAttribute(name);
        if (value) attributes.push(element.tagName.toLowerCase() + "[" + name + "]=" + value);
      }
      const described = element.getAttribute("aria-describedby");
      if (described)
        for (const id of described.split(/\s+/)) {
          const text = document.getElementById(id)?.textContent;
          if (text) attributes.push(element.tagName.toLowerCase() + "[describedby]=" + text);
        }
    }
    return [document.title, document.body.innerText, ...attributes].join("\n");
  };
  const seen = [];
  for (const [stored, name] of [["off", "Day"], ["on", "Night light"]]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      timezoneId: "Europe/Amsterdam",
      colorScheme: stored === "on" ? "dark" : "light",
    });
    await context.addInitScript((value) => localStorage.setItem("hfg-lamplight", value), stored);
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push(e.message));
    try {
      await page.goto(base + "/");
      await page.locator("main h1").first().waitFor();
      const mode = await page.evaluate(() => document.documentElement.dataset.mode);
      assert.equal(mode, stored === "on" ? "lamplight" : "light", name + ": the mode is the one stored");
      // The You sheet, opened once from Today.
      await page.locator("main .title-row").getByRole("link", { name: "You", exact: true }).click();
      await youSheet(page).waitFor();
      seen.push([name + ": the You sheet", await page.evaluate(everythingAReaderSees)]);
      await page.goBack();
      await youSheet(page).waitFor({ state: "detached" });
      for (const [path] of addresses) {
        await page.goto(base + path);
        await page.locator("main h1").first().waitFor();
        seen.push([name + ": " + path, await page.evaluate(everythingAReaderSees)]);
      }
      assert.deepEqual(problems, [], name + ": no page errors");
    } finally {
      await context.close();
    }
  }
  assert.ok(seen.length >= 2 * (addresses.length + 1), "every address was read in both modes");
  for (const [where, text] of seen) assert.doesNotMatch(text, /lamplight/i, where + " names the old mode: " + text.match(/.{0,40}lamplight.{0,40}/i)?.[0]);
}

// ---- CALM-08: every destination is at most two taps from a tab root or from the open You sheet or page --------------------

const WIDTHS = [[390, 844], [768, 1024], [1180, 820]];
const SEED_TOPIC = "anxiety";
const SEED_THREAD = "11111111-1111-4111-8111-111111111111";
const STATE_KEY = "hfg-daily-walk:v3";

/** Patches the stored private state of the reader of this page (the origin is already loaded). */
const seed = (page, patch) =>
  page.evaluate(
    ([key, p]) => {
      const s = JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify({ ...s, ...p }));
    },
    [STATE_KEY, patch],
  );
const NOTHING_FOLLOWED = { followedTopics: [], savedDiscussions: [], savedDiscussionTopics: {} };
const SOMETHING_FOLLOWED = { followedTopics: [SEED_TOPIC], savedDiscussions: [SEED_THREAD], savedDiscussionTopics: { [SEED_THREAD]: SEED_TOPIC } };

/** A tap is one real click or one choice in a menu; the counter is what the two-tap rule is measured with. */
function taps() {
  const counter = { n: 0, log: [] };
  counter.click = async (locator, what) => {
    await locator.click();
    counter.n++;
    counter.log.push(what);
  };
  counter.choose = async (locator, value, what) => {
    await locator.selectOption(value);
    counter.n++;
    counter.log.push(what);
  };
  return counter;
}

/** Opens You from the button of the tab root the page is on (the button itself is not counted) and waits until it is settled. */
async function openYouAnywhere(page, width) {
  await page.locator("main .title-row").getByRole("link", { name: "You", exact: true }).click();
  await page.waitForURL("**/you");
  if (width < 768) {
    await youSheet(page).waitFor();
    await page.waitForFunction(() => document.getAnimations().length === 0);
    return youSheet(page);
  }
  await page.locator("main h1", { hasText: "You" }).waitFor();
  return page.locator("main");
}

const heading = (page, text) => page.locator("main h1", { hasText: text }).waitFor();
const pathIs = (page, path) => page.waitForURL((url) => url.pathname === path);
const studyRadio = (page) => page.getByRole("radio", { name: "Study", exact: true });
const sections = (page, name) => page.getByRole("radiogroup", { name: "Community sections", exact: true }).getByRole("radio", { name, exact: true });
const dialogNamed = (page, name) => page.getByRole("dialog", { name, exact: true });

/** The place a destination is reached from: a tab root, or You (a sheet on a phone, a page from 768px). */
async function startAt(page, width, from, extra = {}) {
  const origin = new URL(page.url()).origin;
  await seed(page, extra.following ? SOMETHING_FOLLOWED : NOTHING_FOLLOWED);
  if (from === "bible-after-a-chapter") {
    await page.goto(origin + "/bible/john/3");
    await page.locator("main h1").first().waitFor();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).lastChapter === "/bible/john/3", STATE_KEY);
  }
  const path = from === "today" || from === "you" ? "/" : from === "community" ? "/community" : "/bible";
  await page.goto(origin + path);
  await page.locator("main h1").first().waitFor();
  if (from === "you") return openYouAnywhere(page, width);
  return page.locator("main");
}

/**
 * Every destination, with the taps that reach it: [name, start, steps, expected, options]. steps(scope, page, t) makes the
 * real taps (t.click, t.choose) and expected(page, scope) says what must be there afterwards.
 */
function destinations(published) {
  const newest = published[0].slug;
  const link = (scope, name) => scope.getByRole("link", { name });
  const button = (scope, name) => scope.getByRole("button", { name });
  const summary = (scope, text) => scope.locator("details.group-disclosure > summary", { hasText: text });
  const disclosureOpen = (page) => page.waitForFunction(() => document.querySelector("details.group-disclosure")?.open === true);
  return [
    // Today
    ["Today: the story of the newest check", "today", (s, p, t) => t.click(button(s, /^(Read the story|Read it again)/), "Read the story"), (p) => pathIs(p, "/context/" + newest)],
    ["Today: the walk", "today", (s, p, t) => t.click(s.locator('a[href="/walk"]'), "Today's walk"), (p) => pathIs(p, "/walk")],
    ["Today: the Shop screen", "today", (s, p, t) => t.click(s.locator(".study-card a.study-card-shop"), "Shop"), (p) => pathIs(p, "/shop")],
    [
      "Today: a product link (read, not followed)",
      "today",
      async () => {},
      async (p, s) => {
        const hrefs = await s.locator(".study-covers a").evaluateAll((links) => links.map((a) => a.href));
        assert.equal(hrefs.length, products.length, "one link for each product");
        for (const href of hrefs) {
          const url = new URL(href);
          assert.equal(url.origin, "https://shop.hisfullglory.com", "a product link goes to the shop: " + href);
          assert.match(url.pathname, /^\/products\/[a-z0-9-]+$/);
        }
      },
    ],
    // Bible
    ["Bible: Continue reading", "bible-after-a-chapter", (s, p, t) => t.click(link(s, /^Continue reading/), "Continue reading"), (p) => pathIs(p, "/bible/john/3")],
    ["Bible: a testament sheet", "bible", (s, p, t) => t.click(button(s, /^Old Testament/), "Old Testament"), (p) => dialogNamed(p, "Old Testament").waitFor()],
    ["Bible: the search sheet", "bible", (s, p, t) => t.click(button(s, "Search the Bible"), "Search"), (p) => p.getByRole("dialog").waitFor()],
    ["Bible, Study: the context checks", "bible", async (s, p, t) => { await t.click(studyRadio(p), "Study"); await t.click(link(s, /^Context checks/), "Context checks"); }, (p) => pathIs(p, "/context")],
    ["Bible, Study: the study-notes sheet", "bible", async (s, p, t) => { await t.click(studyRadio(p), "Study"); await t.click(button(s, /^Study notes/), "Study notes"); }, (p) => dialogNamed(p, "Study notes").waitFor()],
    ["Bible, Study: the saved-passages sheet", "bible", async (s, p, t) => { await t.click(studyRadio(p), "Study"); await t.click(button(s, /^Saved passages/), "Saved passages"); }, (p) => dialogNamed(p, "Saved passages").waitFor()],
    ["Bible, Study: your shelf", "bible", async (s, p, t) => { await t.click(studyRadio(p), "Study"); await t.click(link(s, /^Your shelf/), "Your shelf"); }, (p) => pathIs(p, "/shelf")],
    ["Bible, Study: the Shop screen", "bible", async (s, p, t) => { await t.click(studyRadio(p), "Study"); await t.click(link(s, /^Study Bibles/), "Study Bibles"); }, (p) => pathIs(p, "/shop")],
    // Community
    [
      "Community: a launch topic",
      "community",
      (s, p, t) => t.click(s.locator('.group a.list-row[href^="/community/"]').first(), "a topic"),
      (p) => p.waitForURL((u) => /^\/community\/[a-z0-9-]+$/.test(u.pathname) && u.pathname !== "/community/circles"),
    ],
    ["Community: the search sheet", "community", (s, p, t) => t.click(button(s, "Search topics"), "Search topics"), (p) => dialogNamed(p, "Search topics").waitFor()],
    ["Community: the Following sheet (seeded)", "community", (s, p, t) => t.click(button(s, /^Following/), "Following"), (p) => dialogNamed(p, "Following").waitFor(), { following: true }],
    ["Community: the Saved sheet (seeded)", "community", (s, p, t) => t.click(button(s, /^Saved/), "Saved"), (p) => dialogNamed(p, "Saved").waitFor(), { following: true }],
    [
      "Community: the live chat",
      "community",
      (s, p, t) => t.click(summary(s, "Live chat"), "Live chat"),
      async (p, s) => {
        await disclosureOpen(p);
        await s.getByLabel("Conversation room").waitFor();
      },
    ],
    [
      "Community, Circles: start or join a Circle",
      "community",
      async (s, p, t) => { await t.click(sections(p, "Circles"), "Circles"); await t.click(link(s, /^Start or join a Circle/), "Start or join a Circle"); },
      (p) => pathIs(p, "/community/circles"),
    ],
    ["Community, Prayer wall: the Prayer and praise feed", "community", (s, p, t) => t.click(sections(p, "Prayer wall"), "Prayer wall"), (p) => p.getByRole("heading", { name: "Prayer and praise", exact: true }).waitFor()],
    [
      "Community, Prayer wall: the original prayer wall",
      "community",
      async (s, p, t) => { await t.click(sections(p, "Prayer wall"), "Prayer wall"); await t.click(summary(s, "The original prayer wall"), "The original prayer wall"); },
      async (p, s) => {
        await disclosureOpen(p);
        await s.getByRole("heading", { name: "Prayer Wall", exact: true }).waitFor();
      },
    ],
    [
      "Community, Prayer wall: the testimony filter",
      "community",
      async (s, p, t) => { await t.click(sections(p, "Prayer wall"), "Prayer wall"); await t.choose(s.getByRole("combobox", { name: /^Show/ }), "testimony", "Show: testimony"); },
      async (p, s) => assert.equal(await s.getByRole("combobox", { name: /^Show/ }).inputValue(), "testimony"),
    ],
    // You
    ["You: the profile", "you", (s, p, t) => t.click(link(s, /^Sign in/), "Sign in"), (p) => pathIs(p, "/profile")],
    ["You: My walk", "you", (s, p, t) => t.click(link(s, /^My walk/), "My walk"), (p) => pathIs(p, "/my-walk")],
    ["You: My prayers", "you", (s, p, t) => t.click(link(s, /^My prayers/), "My prayers"), (p) => pathIs(p, "/pray")],
    ["You: the journal", "you", (s, p, t) => t.click(link(s, /^Journal/), "Journal"), (p) => pathIs(p, "/journal")],
    ["You: Give", "you", (s, p, t) => t.click(link(s, /^Give where it helps most/), "Give"), (p) => pathIs(p, "/give")],
    [
      "You, Give: the giving policy",
      "you",
      async (s, p, t) => { await t.click(link(s, /^Give where it helps most/), "Give"); await t.click(link(p, /^Read the giving policy/), "Read the giving policy"); },
      (p) => pathIs(p, "/giving-policy"),
    ],
    ["You: Appearance (the Theme row)", "you", (s, p, t) => t.click(link(s, /^Theme/), "Theme"), (p) => pathIs(p, "/settings/appearance")],
    ["You: the daily reminder", "you", (s, p, t) => t.click(link(s, /^Daily reminder/), "Daily reminder"), (p) => pathIs(p, "/settings/reminders")],
    [
      "You: privacy and your data",
      "you",
      (s, p, t) => t.click(link(s, /^Privacy and your data/), "Privacy and your data"),
      (p) => p.waitForURL((u) => u.pathname === "/settings" && u.hash === "#privacy"),
    ],
    [
      "You, Help: a legal link of the site (read, not followed)",
      "you",
      (s, p, t) => t.click(link(s, /^Help, privacy and terms/), "Help, privacy and terms"),
      async (p) => {
        await p.waitForURL((u) => u.pathname === "/settings" && u.hash === "#about");
        const privacy = p.getByRole("link", { name: /^Privacy policy/ });
        await privacy.waitFor();
        assert.match(await privacy.getAttribute("href"), /\/privacy$/);
        assert.equal(await privacy.getAttribute("target"), "_blank", "the site opens in a new tab");
      },
    ],
    [
      "You, My walk: Grow",
      "you",
      async (s, p, t) => { await t.click(link(s, /^My walk/), "My walk"); await t.click(link(p, /^Grow/), "Grow"); },
      (p) => pathIs(p, "/grow"),
    ],
  ];
}

/** The Back table: each screen reached by clicks, its Back button named for where it goes, and Back going there. */
function backTable(page, width, base) {
  const landedOnYou = async (where) => {
    await pathIs(page, "/you");
    if (width < 768) {
      await youSheet(page).waitFor();
      assert.equal(await page.locator("main h1").innerText(), "Today", where + ": on a phone the sheet stands over the tab it came from");
    } else await heading(page, "You");
  };
  const fromYou = (path, label) => ({
    name: path + " from You",
    reach: async () => { const sheet = await startAt(page, width, "you"); await sheet.getByRole("link", { name: label }).click(); },
    back: "Back to You",
    landed: landedOnYou,
    path,
  });
  const fromBibleStudy = (path, label) => ({
    name: path + " from Bible, Study",
    reach: async () => { const s = await startAt(page, width, "bible"); await studyRadio(page).click(); await s.getByRole("link", { name: label }).click(); },
    back: "Back to Bible",
    landed: async () => {
      await pathIs(page, "/bible");
      if (path === "/shelf") assert.equal(await studyRadio(page).getAttribute("aria-checked"), "true", "Back to Bible brings back Study");
    },
    path,
  });
  return [
    fromYou("/pray", /^My prayers/),
    fromYou("/profile", /^Sign in/),
    fromYou("/settings/appearance", /^Theme/),
    fromYou("/settings/reminders", /^Daily reminder/),
    fromYou("/settings", /^Privacy and your data/),
    fromYou("/my-walk", /^My walk/),
    fromYou("/journal", /^Journal/),
    fromYou("/give", /^Give where it helps most/),
    {
      name: "/pray from the walk",
      reach: async () => {
        await startAt(page, width, "today");
        await page.goto(base + "/walk");
        const prayer = page.getByRole("button", { name: "Save a private prayer" });
        for (let i = 0; i < 6 && !(await prayer.count()); i++) await page.locator(".flow-actions .flow-button:not(.flow-button-secondary)").click();
        await prayer.click();
      },
      back: "Back to Today's walk",
      landed: () => pathIs(page, "/walk"),
      path: "/pray",
    },
    {
      name: "/grow from My walk",
      reach: async () => {
        const sheet = await startAt(page, width, "you");
        await sheet.getByRole("link", { name: /^My walk/ }).click();
        await page.getByRole("link", { name: /^Grow/ }).click();
      },
      back: "Back to My walk",
      landed: () => pathIs(page, "/my-walk"),
      path: "/grow",
    },
    fromBibleStudy("/shelf", /^Your shelf/),
    fromBibleStudy("/context", /^Context checks/),
    fromBibleStudy("/shop", /^Study Bibles/),
    {
      name: "/shop from Today",
      reach: async () => { const s = await startAt(page, width, "today"); await s.locator(".study-card a.study-card-shop").click(); },
      back: "Back to Today",
      landed: () => pathIs(page, "/"),
      path: "/shop",
    },
    {
      name: "/community/circles from Community",
      reach: async () => { const s = await startAt(page, width, "community"); await sections(page, "Circles").click(); await s.getByRole("link", { name: /^Start or join a Circle/ }).click(); },
      back: "Back to Community",
      landed: () => pathIs(page, "/community"),
      path: "/community/circles",
    },
    {
      name: "/giving-policy from Give",
      reach: async () => { const s = await startAt(page, width, "you"); await s.getByRole("link", { name: /^Give where it helps most/ }).click(); await page.getByRole("link", { name: /^Read the giving policy/ }).click(); },
      back: "Back to Give",
      landed: () => pathIs(page, "/give"),
      path: "/giving-policy",
    },
  ];
}

/**
 * CALM-08 and D-03, proven by real clicks at 390, 768 and 1180px in fresh contexts. Every destination is reached from a tab
 * root or from the open You sheet (a phone) or page (from 768px) with at most two taps, the Back button of every pushed screen
 * is named for where it goes, and Back goes there.
 */
export async function checkTwoTaps(browser, base, published) {
  for (const [width, height] of WIDTHS) {
    const { context, page, problems } = await open(browser, base, "/", { width, height });
    try {
      const table = destinations(published);
      for (const [name, from, steps, expected, extra] of table) {
        const scope = await startAt(page, width, from, extra);
        const t = taps();
        await steps(scope, page, t);
        await expected(page, scope);
        assert.ok(t.n <= 2, name + " at " + width + "px needed " + t.n + " taps: " + t.log.join(" > "));
      }
      assert.ok(table.length >= 32, "every destination of the table was measured at " + width + "px (" + table.length + ")");
      for (const entry of backTable(page, width, base)) {
        await entry.reach();
        await pathIs(page, entry.path);
        await page.locator("main h1").first().waitFor();
        const back = page.getByRole("button", { name: entry.back, exact: true });
        assert.equal(await back.count(), 1, entry.name + " at " + width + "px: the Back button is named " + entry.back);
        await back.click();
        await entry.landed(entry.name + " at " + width + "px");
      }
      assert.deepEqual(problems, [], width + "px: no page errors");
    } finally {
      await context.close();
    }
  }
}
