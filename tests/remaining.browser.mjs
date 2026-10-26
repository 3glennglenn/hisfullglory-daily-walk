import assert from "node:assert/strict";

// Plan 11 (UI-SPEC D-10, A12, A16, 14, 15): the screens that were not part of an earlier plan, the surfaces around
// the app, and the 200 % text sweep over every route. Each function opens its own context, so it leaves the main
// check page and its storage alone.

async function open(browser, base, path, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block", timezoneId: "Europe/Amsterdam", colorScheme: "light" });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(base + path);
  await page.locator("main h1").first().waitFor();
  return { context, page, problems };
}

// Task 1: Journal, My Walk and Grow are pushed screens of You: Back to You, one h1 in the large title style and no
// uppercase text anywhere on the screen.
export async function checkPushedScreens(browser, base) {
  for (const [path, title] of [
    ["/journal", "Your journal."],
    ["/my-walk", "My Walk"],
    ["/grow", "Room to grow."],
  ]) {
    const { context, page, problems } = await open(browser, base, path);
    try {
      assert.equal(await page.locator("main h1").count(), 1, path + ": one h1");
      assert.equal(await page.locator("main h1").innerText(), title, path + ": the title keeps its words");
      assert.equal(await page.locator("main h1").getAttribute("class"), "large-title", path + ": the large title style");
      assert.equal(await page.getByRole("button", { name: "Back to You", exact: true }).count(), 1, path + ": Back to You");
      const uppercase = await page.evaluate(() =>
        [...document.querySelectorAll("main *")].filter((el) => getComputedStyle(el).textTransform === "uppercase").map((el) => el.className || el.tagName),
      );
      assert.deepEqual(uppercase, [], path + ": no uppercase text transform");
      assert.equal(await page.locator("main .eyebrow").count(), 0, path + ": no eyebrow");
      await page.getByRole("button", { name: "Back to You", exact: true }).click();
      await page.waitForURL("**/you");
      assert.deepEqual(problems, [], path + ": no page errors");
    } finally {
      await context.close();
    }
  }
  // A journey keeps its way back to the list of journeys.
  const { context, page } = await open(browser, base, "/grow/anxiety");
  try {
    assert.equal(await page.locator("main h1").count(), 1);
    assert.equal(await page.getByRole("button", { name: "Back to All journeys", exact: true }).count(), 1);
    assert.equal(await page.locator("main .eyebrow").count(), 0);
    await page.getByRole("button", { name: "Back to All journeys", exact: true }).click();
    await page.waitForURL("**/grow");
  } finally {
    await context.close();
  }
}

// The buttons of main that are filled with the theme's button colour (--button or --sig-button), as a person sees them.
async function filledButtons(page) {
  return page.evaluate(() => {
    const probe = (name) => {
      const el = document.createElement("div");
      el.style.background = `var(${name})`;
      document.body.append(el);
      const color = getComputedStyle(el).backgroundColor;
      el.remove();
      return color;
    };
    const fills = [probe("--button"), probe("--sig-button")];
    return [...document.querySelectorAll("main button")]
      .filter((b) => b.getBoundingClientRect().width > 0 && fills.includes(getComputedStyle(b).backgroundColor))
      .map((b) => b.getAttribute("aria-label") ?? b.textContent.trim());
  });
}

// Task 2: Give and its policy, the Shop screen, Circles, the not-found screen, the crash screen and the install offer.
export async function checkSurfaces(browser, base) {
  // Back, one large title, no eyebrow, no uppercase, no button whose whole name is Cancel, OK, Done or Close.
  for (const [path, back] of [
    ["/give", "You"],
    ["/giving-policy", "Give"],
    ["/shop", "You"],
    ["/community/circles", "Community"],
  ]) {
    const { context, page, problems } = await open(browser, base, path);
    try {
      assert.equal(await page.locator("main h1").count(), 1, path + ": one h1");
      assert.equal(await page.locator("main h1").getAttribute("class"), "large-title", path + ": the large title style");
      assert.equal(await page.getByRole("button", { name: "Back to " + back, exact: true }).count(), 1, path + ": Back to " + back);
      assert.equal(await page.locator("main .eyebrow").count(), 0, path + ": no eyebrow");
      const uppercase = await page.evaluate(() =>
        [...document.querySelectorAll("main *")].filter((el) => getComputedStyle(el).textTransform === "uppercase").length,
      );
      assert.equal(uppercase, 0, path + ": no uppercase text");
      assert.deepEqual(problems, [], path + ": no page errors");
    } finally {
      await context.close();
    }
  }
  // Give and the shop are never placed next to prayer (CLAUDE.md shop rule): no link to either on Pray.
  {
    const { context, page } = await open(browser, base, "/pray");
    try {
      assert.equal(await page.locator("main").getByText(/Resources|Give with intention|Study Bibles|\/shop|\/give/).count(), 0, "no Give or shop on Pray");
      assert.equal(await page.locator('main a[href="/give"], main a[href="/shop"]').count(), 0);
    } finally {
      await context.close();
    }
  }
  // The giving policy keeps its words and its external link.
  {
    const { context, page } = await open(browser, base, "/giving-policy");
    try {
      assert.equal(await page.locator("main h1").innerText(), "Giving with care.");
      assert.equal(await page.getByRole("link", { name: /GoFundMe’s official process/ }).getAttribute("href"), "https://www.gofundme.com/c/how-it-works");
    } finally {
      await context.close();
    }
  }
  // The not-found screen: the large title and one filled button back to Today.
  {
    const { context, page } = await open(browser, base, "/no-such-page");
    try {
      assert.equal(await page.locator("main h1").innerText(), "Page not found");
      assert.deepEqual(await filledButtons(page), ["Back to Today"]);
      await page.getByRole("button", { name: "Back to Today", exact: true }).click();
      await page.waitForURL(base + "/");
    } finally {
      await context.close();
    }
  }
  // The install offer: after the content, "Install app" secondary, "Later" plain; Today keeps its one filled button.
  {
    const { context, page } = await open(browser, base, "/");
    try {
      const before = await filledButtons(page);
      assert.equal(before.length, 1, "Today has one filled button: " + before);
      await page.evaluate(() => {
        const event = new Event("beforeinstallprompt", { cancelable: true });
        event.prompt = async () => {};
        event.userChoice = Promise.resolve({ outcome: "dismissed" });
        window.dispatchEvent(event);
      });
      const offer = page.locator("main aside.install-offer");
      await offer.waitFor();
      assert.deepEqual(await offer.getByRole("button").allInnerTexts(), ["Install app", "Later"]);
      assert.equal(await offer.getByRole("button", { name: "Install app", exact: true }).getAttribute("class"), "secondary");
      assert.equal(await offer.getByRole("button", { name: "Later", exact: true }).getAttribute("class"), "text-button");
      assert.deepEqual(await filledButtons(page), before, "the offer adds no filled button");
      const order = await page.evaluate(() => {
        const main = document.querySelector("main");
        const offer = main.querySelector("aside.install-offer");
        return [...main.children].indexOf(offer) > [...main.children].findIndex((el) => el.querySelector(".cover, .today"));
      });
      assert.ok(order, "the offer comes after the page content");
    } finally {
      await context.close();
    }
  }
  // The offline notice: ink on --surface-2, in the flow of the page (it never covers the toolbar).
  {
    const { context, page } = await open(browser, base, "/you");
    try {
      await context.setOffline(true);
      const notice = page.locator("aside.notice");
      await notice.waitFor();
      const style = await notice.evaluate((el) => {
        const cs = getComputedStyle(el);
        const probe = (name) => {
          const d = document.createElement("div");
          d.style.color = `var(${name})`;
          document.body.append(d);
          const c = getComputedStyle(d).color;
          d.remove();
          return c;
        };
        return { position: cs.position, color: cs.color, ink: probe("--ink"), size: parseFloat(cs.fontSize) };
      });
      assert.equal(style.position, "static");
      assert.equal(style.color, style.ink);
      assert.equal(style.size, 17);
    } finally {
      await context.setOffline(false);
      await context.close();
    }
  }
  // The crash screen cannot be reached on purpose in the built app, so its words are read from the bundle.
  {
    const html = await (await fetch(base + "/")).text();
    const script = html.match(/src="([^"]*assets\/index-[^"]+\.js)"/)?.[1];
    assert.ok(script, "the app bundle is linked from index.html");
    const js = await (await fetch(new URL(script, base + "/"))).text();
    for (const words of ["A moment to begin again", "Your saved data remains on this device.", "Reload the app"])
      assert.ok(js.includes(words), "the bundle holds: " + words);
    assert.ok(!/"Reload"\)|>Reload</.test(js) , "the old bare Reload button is gone");
  }
}

// Task 3: the 200 % text sweep over every route of the app (UI-SPEC 15 item 4, audit Critical 2), and the bare-label
// check on the same routes. At a 34px root (twice the text) on a 390 and a 320px phone:
//  - the page does not scroll sideways and no heading, paragraph or button is cut off;
//  - every visible button, list link, field and select is at least 44px tall;
//  - the tab labels stay on one line;
//  - the first heading (and, on Today, the reader, a story, the shelf and You, the main content) starts in the first screen;
//  - no visible button is named only Cancel, OK, Done or Close.
const BARE = ["Cancel", "OK", "Done", "Close"];

/** Measures the page as it is now. Everything that needs a person's judgement is returned as a list of findings. */
async function measure(page, firstContent) {
  return page.evaluate(
    ({ firstContent, BARE }) => {
      const findings = [];
      const name = (el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50);
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[hidden], [inert]");
      };
      const scroller = (el) => {
        for (let p = el; p && p !== document.body; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden") return true;
        }
        return false;
      };
      if (document.documentElement.scrollWidth > innerWidth) findings.push("scrolls sideways: " + document.documentElement.scrollWidth + " > " + innerWidth);
      // Controls: 44px tall. Checkboxes and radios are drawn small inside a 44px label row; verse numbers draw their hit area with ::after.
      const controls = document.querySelectorAll(
        'button, a.list-row, li a, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea, summary, .tabbar a',
      );
      for (const el of controls) {
        if (!visible(el) || el.closest(".sr-only, .skip-link")) continue;
        if (el.matches(".verse-num, .verse-num *")) continue;
        const r = el.getBoundingClientRect();
        if (r.height < 43.5) findings.push("control under 44px (" + Math.round(r.height) + "): " + el.tagName.toLowerCase() + " " + name(el));
      }
      // Text that does not fit its box.
      for (const el of document.querySelectorAll("main h1, main h2, main h3, main p, main button, main summary")) {
        // A verse number is a drawn numeral in the hanging margin; its 44px hit area is an ::after (A3), and the reader's own check measures it.
        if (!visible(el) || scroller(el) || el.closest(".sr-only") || el.matches(".verse-num")) continue;
        if (el.scrollWidth > el.clientWidth + 1) findings.push("clipped: " + el.tagName.toLowerCase() + " " + name(el));
        const r = el.getBoundingClientRect();
        if (r.right > innerWidth + 1 || r.left < -1) findings.push("outside the screen: " + el.tagName.toLowerCase() + " " + name(el));
      }
      // Tab labels on one line.
      for (const label of document.querySelectorAll(".tab-label")) {
        const r = label.getBoundingClientRect();
        const line = parseFloat(getComputedStyle(label).lineHeight) || parseFloat(getComputedStyle(label).fontSize) * 1.4;
        if (r.height > line * 1.5) findings.push("tab label wraps: " + name(label));
      }
      // The first screen holds the title and the primary content.
      const h1 = document.querySelector("main h1");
      if (!h1) findings.push("no h1");
      else if (h1.getBoundingClientRect().top >= innerHeight) findings.push("h1 starts below the first screen");
      if (firstContent) {
        const el = [...document.querySelectorAll(firstContent)].find(visible);
        if (!el) findings.push("primary content not found: " + firstContent);
        else if (el.getBoundingClientRect().top >= innerHeight) findings.push("primary content starts below the first screen: " + firstContent + " at " + Math.round(el.getBoundingClientRect().top));
      }
      // No bare button name.
      for (const b of document.querySelectorAll("button, [role=button]")) {
        if (visible(b) && BARE.includes(name(b))) findings.push("bare button name: " + name(b));
      }
      return findings;
    },
    { firstContent, BARE },
  );
}

export async function checkTextSweep(browser, base, published) {
  const newest = published[0];
  assert.ok(newest, "a published context check");
  const routes = [
    ["/", ".cover"],
    ["/walk", null],
    ["/bible", null],
    ["/bible/john/3", ".reader-heading"],
    ["/context/" + newest.slug, ".cover, .flow-part"],
    ["/context", null],
    ["/shelf", ".shelf-boards li"],
    ["/pray", null],
    ["/community", null],
    ["/community/circles", null],
    ["/you", ".give-feature"], // the Give card now leads You (quick 261020-give); the rows follow it
    ["/profile", null],
    ["/settings", null],
    ["/settings/appearance", null],
    ["/settings/reminders", null],
    ["/my-walk", null],
    ["/journal", null],
    ["/grow", null],
    ["/grow/anxiety", null],
    ["/give", null],
    ["/giving-policy", null],
    ["/shop", null],
    ["/no-such-page", null],
  ];
  const report = [];
  for (const [width, height] of [
    [390, 844],
    [320, 568],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block", timezoneId: "Europe/Amsterdam", colorScheme: "light" });
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push(e.message));
    try {
      await page.goto(base + "/");
      await page.locator("main h1").first().waitFor();
      // A shelf with a few real checks, so the shelf and Today show their filled states.
      await page.evaluate(
        ({ key, shelf }) => {
          const state = JSON.parse(localStorage.getItem(key));
          state.shelf = shelf;
          localStorage.setItem(key, JSON.stringify(state));
        },
        { key: "hfg-daily-walk:v3", shelf: published.slice(0, 4).map((c, i) => ({ slug: c.slug, finishedOn: "2026-03-0" + (i + 1) })) },
      );
      for (const [path, firstContent] of routes) {
        await page.goto(base + path);
        await page.locator("main h1").first().waitFor();
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "34px";
          window.dispatchEvent(new Event("resize"));
        });
        await page.waitForFunction(() => document.documentElement.dataset.text === "large");
        // The reader fetches the Bible before it draws the chapter; wait for the content the route is judged by.
        if (firstContent) await page.locator(firstContent).first().waitFor({ state: "attached" });
        await page.waitForTimeout(150);
        for (const finding of await measure(page, firstContent)) report.push(`${path} at ${width}px: ${finding}`);
      }
      assert.deepEqual(problems, [], "no page errors during the sweep");
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(report, [], "the 200 % sweep found problems:\n" + report.join("\n"));
}
