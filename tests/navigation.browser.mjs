import assert from "node:assert/strict";

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

// e: every current address opens at three widths, with one main h1, no page error and the right tab marked.
async function addressSweep(browser, base, published) {
  const newest = published[0].slug;
  // [path, what is marked: a tab, "you" (a screen reached from You: the tab of the last root on a phone, You when wide),
  //  "none" (no tab) or "flow" (no tab bar at all)]
  const addresses = [
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
        const want = expected === "none" ? [] : expected === "you" ? [width >= 768 ? "You" : "Today"] : [expected];
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
