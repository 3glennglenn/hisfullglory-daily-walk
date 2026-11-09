import assert from "node:assert/strict";

// Give (quick 261020-give; 01.2 D-02), in a real browser: the Give row in the You sheet opens /give; the six pages open on
// page 1; the tabs and a swipe change pages; a card's button opens the leaving-the-app dialog with the right host;
// nothing is loaded from the charities; 200 % text has no sideways scroll; Lamplight and the wide grid render.
// Each case opens a context of its own (the harness seeds a reader who already answered the welcome questions).

const TITLES = ["Most effective", "Poverty and hunger", "Health, medicine and research", "Children and protection", "Animals", "Christian charities"];

async function open(browser, base, path, { look = "cover", lamplight = false, width = 390, height = 844, reducedMotion = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    serviceWorkers: "block",
    timezoneId: "Europe/Amsterdam",
    colorScheme: lamplight ? "dark" : "light",
    ...(reducedMotion ? { reducedMotion: "reduce" } : {}),
  });
  await context.addInitScript(
    ({ look, lamplight }) => {
      localStorage.setItem("hfg-look", look);
      localStorage.setItem("hfg-lamplight", lamplight ? "on" : "off");
    },
    { look, lamplight },
  );
  const page = await context.newPage();
  const problems = [];
  const requests = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("request", (r) => requests.push(new URL(r.url()).hostname));
  await page.goto(base + path);
  await page.locator("main h1").first().waitFor();
  return { context, page, problems, requests };
}

const pagerState = (page) =>
  page.locator(".give-pager").evaluate((el) => ({ left: el.scrollLeft, width: el.clientWidth, index: Math.round(el.scrollLeft / el.clientWidth) }));

export async function checkGive(browser, base) {
  // The Give row in the You sheet opens /give on page 1 (D-02: one row, no card, no shop in the sheet).
  {
    const { context, page, problems } = await open(browser, base, "/you");
    try {
      const sheet = page.getByRole("dialog", { name: "You", exact: true });
      await sheet.waitFor();
      assert.deepEqual(await sheet.locator("h2").allInnerTexts(), ["You", "Your walk", "Settings"], "the groups of D-02 in order");
      assert.deepEqual(
        await sheet.locator("a.list-row").evaluateAll((list) => list.map((a) => a.getAttribute("href"))),
        ["/profile", "/my-walk", "/pray", "/journal", "/give", "/settings/appearance", "/settings/reminders", "/settings#privacy", "/settings#about"],
        "the rows lead where D-02 says, Give between Your walk and Settings",
      );
      assert.equal(await sheet.locator('a[href="/give"]').count(), 1, "exactly one link to /give in the sheet");
      assert.equal(await sheet.locator(".give-feature").count(), 0, "no Give card");
      const row = sheet.getByRole("link", { name: /^Give where it helps most/ });
      assert.equal(await row.locator(".list-row-title").innerText(), "Give where it helps most");
      assert.equal(await row.locator(".list-row-detail").innerText(), "Charities chosen by independent evaluators");
      const box = await row.boundingBox();
      assert.ok(box && box.height >= 44, "a 44px target");
      await row.click();
      await page.waitForURL("**/give");
      assert.equal(await page.locator("main h1").innerText(), "Give with intention.");
      assert.equal(await page.getByRole("tab", { selected: true }).first().innerText(), TITLES[0], "it opens on page 1");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }
  // /give opens on page 1; tabs, swipe, arrow keys; the cards; the dialog; nothing loaded from the charities.
  {
    const { context, page, problems, requests } = await open(browser, base, "/give");
    try {
      const tabs = page.getByRole("tablist", { name: "Giving pages" }).getByRole("tab");
      assert.deepEqual(await tabs.allInnerTexts(), TITLES);
      assert.equal(await tabs.nth(0).getAttribute("aria-selected"), "true", "page 1 is selected");
      assert.equal(await page.locator(".give-count").innerText(), "1 of 6");
      assert.equal(await page.locator(".give-dot").count(), 6);
      assert.equal(await page.locator(".give-dot-current").count(), 1);
      assert.deepEqual(await page.locator("main h2").allInnerTexts(), TITLES, "each page is a section with its title as a heading");
      assert.equal(await page.locator(".give-page").first().locator(".give-card").count(), 6, "page 1 has six charities");
      assert.equal(
        await page.locator(".give-intro").first().innerText(),
        "Six places where independent evaluators expect a gift to do the most good, across different needs.",
      );
      // A card: title, description, why it is here, Source, one button.
      const first = page.locator(".give-card").first();
      assert.equal(await first.locator("h3").innerText(), "GiveWell Top Charities Fund");
      assert.match(await first.innerText(), /Recommended by GiveWell/);
      assert.match(await first.innerText(), /At the official GiveWell checkout choose “Top Charities Fund”\./);
      const source = first.getByRole("link", { name: /^Source/ });
      assert.equal(await source.getAttribute("href"), "https://www.givewell.org/charities/top-charities");
      assert.equal(await source.getAttribute("target"), "_blank");
      assert.match(await source.getAttribute("rel"), /noopener/);
      assert.ok((await source.boundingBox()).height >= 44, "Source is a 44px target");
      assert.equal(await first.getByRole("button").count(), 1);

      // Tapping a tab scrolls to its page and the indicator follows.
      await tabs.nth(2).click();
      await page.waitForFunction(() => document.querySelector(".give-count").textContent === "3 of 6");
      assert.equal(await tabs.nth(2).getAttribute("aria-selected"), "true");
      assert.equal(await tabs.nth(0).getAttribute("aria-selected"), "false");
      await page.waitForFunction(() => {
        const el = document.querySelector(".give-pager");
        return Math.abs(el.scrollLeft - 2 * el.clientWidth) < 2;
      });
      // Swiping (a scroll of the pager) selects the tab of the page in view.
      await page.locator(".give-pager").evaluate((el) => el.scrollTo({ left: 5 * el.clientWidth, behavior: "instant" }));
      await page.waitForFunction(() => document.querySelector(".give-count").textContent === "6 of 6");
      assert.equal(await tabs.nth(5).getAttribute("aria-selected"), "true");
      assert.equal(await page.locator(".give-dot-current").count(), 1);
      // Arrow keys move between tabs and the page follows.
      await tabs.nth(5).focus();
      await page.keyboard.press("ArrowLeft");
      await page.waitForFunction(() => document.querySelector(".give-count").textContent === "5 of 6");
      assert.equal(await tabs.nth(4).getAttribute("aria-selected"), "true");
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Animals", "focus moves with the arrow key");
      await page.keyboard.press("Home");
      await page.waitForFunction(() => document.querySelector(".give-count").textContent === "1 of 6");
      await page.keyboard.press("End");
      await page.waitForFunction(() => document.querySelector(".give-count").textContent === "6 of 6");
      assert.equal(await tabs.nth(5).getAttribute("tabindex"), "0");
      assert.equal(await tabs.nth(0).getAttribute("tabindex"), "-1");

      // The Christian page: the label, the intro, the ECFA and Charity Navigator lines.
      const christian = page.locator(".give-page").nth(5);
      assert.equal(await christian.locator(".give-card").count(), 8);
      assert.equal(await christian.locator(".give-label").count(), 8);
      assert.equal(await page.locator(".give-page").first().locator(".give-label").count(), 0);
      assert.match(await christian.innerText(), /Charity Navigator and ECFA check their finances and accountability, not how much good each gift does\./);
      assert.match(await christian.innerText(), /Charity Navigator: Four-Star, 97%/);
      assert.match(await christian.innerText(), /ECFA accredited/);
      // A card's button opens the outbound dialog with the right host.
      await christian.getByRole("button", { name: "Give on www.ijm.org" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      assert.equal(await dialog.locator("h2").innerText(), "Continue to www.ijm.org?");
      assert.match(await dialog.innerText(), /The provider\s+handles payment, verification, transfers, refunds and receipts under its own terms\./);
      const go = dialog.getByRole("link", { name: "Continue to provider" });
      assert.equal(await go.getAttribute("href"), "https://www.ijm.org/give/main-single-form");
      assert.equal(await go.getAttribute("target"), "_blank");
      assert.match(await go.getAttribute("rel"), /noopener/);
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      // A shared checkout asks the donor to pick the programme.
      await tabs.nth(0).click();
      await page.waitForFunction(() => document.querySelector(".give-count").textContent === "1 of 6");
      await page.locator(".give-page").first().getByRole("button", { name: "Give on secure.givewell.org" }).nth(1).click();
      await dialog.waitFor();
      assert.equal(await dialog.locator("h2").innerText(), "Continue to secure.givewell.org?");
      assert.match(await dialog.innerText(), /Choose “Against Malaria Foundation” at checkout\./);
      await page.getByRole("button", { name: "Stay here" }).click();
      // The checked line, then the existing views below it.
      assert.match(await page.locator(".give-checked").first().innerText(), /^Checked on October 20, 2026\. Charities and evaluators change; we re-check them regularly\.$/);
      assert.equal(await page.getByRole("link", { name: /Read the giving policy/ }).count(), 1);
      assert.equal(await page.getByRole("button", { name: "Support someone", exact: true }).count(), 1);
      // Nothing is fetched or embedded from the charities and evaluators.
      const hosts = await page.evaluate(() => [...document.querySelectorAll(".give-source")].map((a) => new URL(a.href).hostname));
      assert.ok(hosts.length >= 31, "a Source link on every card");
      assert.equal(await page.locator(".give-pages img, .give-pages iframe, .give-pages script, .give-pages link").count(), 0, "no logos, frames or scripts");
      const here = new URL(base).hostname;
      const outside = requests.filter((h) => h !== here && h !== "127.0.0.1" && h !== "localhost");
      for (const host of hosts) assert.ok(!outside.includes(host), host + " was requested by the page");
      const uppercase = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((el) => getComputedStyle(el).textTransform === "uppercase").length);
      assert.equal(uppercase, 0, "no uppercase text");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }
  // Reduce Motion: a tab jumps at once.
  {
    const { context, page } = await open(browser, base, "/give", { reducedMotion: true });
    try {
      await page.getByRole("tab", { name: "Children and protection" }).click();
      await page.waitForTimeout(60);
      const state = await pagerState(page);
      assert.ok(Math.abs(state.left - 3 * state.width) < 2, "instant jump to page 4, saw " + state.left);
      assert.equal(await page.locator(".give-count").innerText(), "4 of 6");
    } finally {
      await context.close();
    }
  }
  // 200 % text at 390 and 320px: no sideways scroll, 44px targets, nothing clipped, one tab row that scrolls.
  for (const width of [390, 320]) {
    const { context, page } = await open(browser, base, "/give", { width, height: 844 });
    try {
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "34px";
        window.dispatchEvent(new Event("resize"));
      });
      await page.waitForFunction(() => document.documentElement.dataset.text === "large");
      await page.waitForTimeout(150);
      const findings = await page.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > innerWidth) out.push("scrolls sideways");
        const row = document.querySelector(".give-tabs");
        if (row.scrollWidth <= row.clientWidth) out.push("the tab row should scroll");
        const rect = row.getBoundingClientRect();
        if (rect.height > 80) out.push("the tab row wraps: " + rect.height);
        for (const el of document.querySelectorAll(".give-page:first-child button, .give-page:first-child .give-source, .give-tabs [role=tab]")) {
          const r = el.getBoundingClientRect();
          if (r.height < 43.5) out.push("under 44px: " + el.textContent.trim());
          if (el.matches(".give-button") && el.scrollWidth > el.clientWidth + 1) out.push("clipped: " + el.textContent.trim());
        }
        for (const el of document.querySelectorAll(".give-page:first-child .give-card")) {
          if (el.scrollWidth > el.clientWidth + 1) out.push("card overflows: " + el.querySelector("h3").textContent);
          const r = el.getBoundingClientRect();
          if (r.right > innerWidth + 1 || r.left < -1) out.push("card outside the screen: " + el.querySelector("h3").textContent);
        }
        return out;
      });
      assert.deepEqual(findings, [], `200 % text at ${width}px`);
      // A page tapped in large text still lines up with the screen width.
      await page.getByRole("tab", { name: "Animals" }).click();
      await page.waitForFunction(() => document.querySelector(".give-count").textContent === "5 of 6");
      // The smooth scroll across four pages takes a moment; it must end exactly on page 5.
      await page.waitForFunction(() => {
        const el = document.querySelector(".give-pager");
        return Math.abs(el.scrollLeft - 4 * el.clientWidth) < 2;
      });
    } finally {
      await context.close();
    }
  }
  // Wide screens: the cards sit in a grid inside the page.
  {
    const { context, page } = await open(browser, base, "/give", { width: 1280, height: 900 });
    try {
      const columns = await page.locator(".give-grid").first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
      assert.ok(columns >= 2, "two columns on a wide screen, saw " + columns);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally {
      await context.close();
    }
  }
  // Lamplight (both looks): the page tabs and card buttons of the Give screen are pills.
  for (const look of ["cover", "marked"]) {
    const { context, page, problems } = await open(browser, base, "/give", { look, lamplight: true });
    try {
      const pill = (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) >= 100;
      await page.locator(".give-tabs").waitFor();
      assert.equal(await page.locator(".give-tabs [role=tab]").first().evaluate(pill), true, look + ": pill tabs");
      assert.equal(await page.locator(".give-button").first().evaluate(pill), true, look + ": pill card buttons");
      assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), "lamplight");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }
  // Light looks: the Give screen's card buttons are rounded rectangles, not pills.
  for (const look of ["cover", "marked"]) {
    const { context, page } = await open(browser, base, "/give", { look });
    try {
      const radius = await page.locator(".give-button").first().evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
      assert.ok(radius < 40, look + ": a rounded rectangle in the light looks");
      const tabRadius = await page.locator(".give-tabs [role=tab]").first().evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
      assert.ok(tabRadius < 100, look + ": the page tabs are not pills in the light looks");
    } finally {
      await context.close();
    }
  }
}
