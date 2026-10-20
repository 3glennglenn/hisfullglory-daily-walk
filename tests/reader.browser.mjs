import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { publishedChecks } from "../src/context/checks.ts";

// The Bible reader in a real browser (UI-SPEC A2, A3, A4, A16). Each check opens its own context so a seeded
// look, a text size or a stubbed browser API never leaks into the next one. They run against the built app.

/** A fresh context and page; `look` is "cover" or "marked", `lamplight` "on" or "off". */
async function open(browser, { width = 390, height = 844, look, lamplight, colorScheme = "light", extra } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: "Europe/Amsterdam", colorScheme, serviceWorkers: "block", ...extra });
  if (look) await context.addInitScript((v) => localStorage.setItem("hfg-look", v), look);
  if (lamplight) await context.addInitScript((v) => localStorage.setItem("hfg-lamplight", v), lamplight);
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warning") && !/Service Worker registration blocked/.test(m.text())) problems.push(m.text());
  });
  page.setDefaultTimeout(10000);
  return { context, page, problems };
}

async function goto(page, base, path) {
  await page.goto(base + path);
  await page.locator("main h1").first().waitFor({ state: "attached" });
}

const box = (page, selector) =>
  page.locator(selector).first().evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { top: b.top, left: b.left, width: b.width, height: b.height, bottom: b.bottom, right: b.right };
  });

/** The hit area of a verse number: its ::after box, centred on the number (the rule that draws it is in styles.css). */
const hitAreas = (page) =>
  page.locator(".verse-num").evaluateAll((buttons) =>
    buttons.map((button) => {
      const after = getComputedStyle(button, "::after");
      const b = button.getBoundingClientRect();
      const w = parseFloat(after.width);
      const h = parseFloat(after.height);
      // The box is placed by its computed left and top (px) and then pulled back by half its own size (translate -50 %).
      const left = b.left + parseFloat(after.left) - w / 2;
      const top = b.top + parseFloat(after.top) - h / 2;
      return { verse: Number(button.closest("[data-verse]").dataset.verse), left, right: left + w, top, bottom: top + h, w, h };
    }),
  );

/** Scripture first: the toolbar, the heading, the verses as text with one Tab stop, and the look-specific heading. */
export async function checkReaderText(browser, base) {
  // --- Cover (the default look), 390 x 844 ---
  const cover = await open(browser);
  try {
    const { page } = cover;
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-1").waitFor();
    // Verse 1 sits near the top instead of 539px down (audit); the slogan, eyebrow, search field, selects and
    // view buttons are gone from the top of the page.
    const first = await box(page, "#verse-1");
    assert.ok(first.top < 190, `verse 1 is near the top (${Math.round(first.top)}px)`);
    for (const gone of ["The Bible, open to you.", "Scripture · Public domain · WEB"]) assert.equal(await page.getByText(gone).count(), 0, gone + " is gone");
    assert.equal(await page.getByRole("searchbox").count(), 0, "no search field in the page");
    assert.equal(await page.locator("main select").count(), 0, "no book and chapter selects");
    assert.equal(await page.getByRole("button", { name: "read", exact: true }).count(), 0, "no view buttons");
    // One h1 (the chapter), the small book title above it, the heading in the Scripture face with the section rule.
    assert.equal(await page.locator("main h1").count(), 1);
    assert.equal(await page.locator("main h1").innerText(), "John 3");
    assert.equal(await page.locator(".reader-book").innerText(), "The Gospel of John");
    const heading = await page.locator(".reader-heading").evaluate((el) => ({ size: getComputedStyle(el).fontSize, face: getComputedStyle(el).fontFamily, rule: getComputedStyle(el, "::after") }));
    assert.ok(Math.abs(parseFloat(heading.size) - 28) < 0.1, "Display 28px (" + heading.size + ")");
    assert.match(heading.face, /Gelasio/, "Cover sets the heading in the Scripture face");
    assert.equal(await page.locator(".reader-heading").evaluate((el) => getComputedStyle(el, "::after").width + " " + getComputedStyle(el, "::after").height), "32px 2px", "the 32 x 2 section rule");
    assert.equal(await page.locator(".chapter-opening").evaluate((el) => getComputedStyle(el).display), "none", "no numeral in Cover");
    // The toolbar is sticky: previous and next are reachable at every scroll position.
    const bar = await box(page, ".reader-toolbar");
    assert.equal(Math.round(bar.height), 52);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => document.querySelector(".reader-toolbar").dataset.scrolled === "true");
    for (const name of ["Previous chapter: John 2", "Next chapter: John 4"]) {
      const b = page.getByRole("button", { name, exact: true });
      assert.equal(await b.count(), 1, name);
      const r = await b.evaluate((el) => el.getBoundingClientRect().toJSON());
      assert.ok(r.top >= 0 && r.bottom <= 844 && r.width >= 44 && r.height >= 44, `${name} stays visible at the end of the chapter (${JSON.stringify(r)})`);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    // The title pill names the chapter in full; Books goes to the library.
    assert.equal(await page.locator(".rt-title").innerText(), "John 3");
    assert.equal(await page.getByRole("button", { name: "Books", exact: true }).count(), 1);
    // Verses are text, not toggle buttons.
    assert.equal(await page.locator(".chapter-text [aria-pressed]").count(), 0, "no aria-pressed inside the chapter text");
    assert.equal(await page.locator(".chapter-text .verse").count(), 36, "John 3 has 36 verses, each a span");
    assert.equal(await page.locator(".chapter-text .verse").evaluateAll((els) => els.every((el) => el.tagName === "SPAN" && el.id === "verse-" + el.dataset.verse)), true);
    assert.equal(await page.locator("#verse-3 .verse-num").getAttribute("aria-label"), "Verse 3, notes and actions");
    // Cover: a block per verse, 12px apart; the number hangs in a 24px margin with a 44 x 44 hit area.
    const gap = await page.evaluate(() => {
      const a = document.querySelector("#verse-1").getBoundingClientRect();
      const b = document.querySelector("#verse-2").getBoundingClientRect();
      return Math.round(b.top - a.bottom);
    });
    assert.equal(gap, 12, "12px between verses");
    const hit = await hitAreas(page);
    assert.ok(hit.every((h) => h.w === 44 && h.h === 44), "every hit area is 44 x 44 in Cover");
    const num = await box(page, "#verse-1 .verse-num");
    assert.equal(num.width, 24, "the number hangs in a 24px margin");
    const numStyle = await page.locator("#verse-1 .verse-num").evaluate((el) => ({ size: Math.round(parseFloat(getComputedStyle(el).fontSize)) + "px", weight: getComputedStyle(el).fontWeight }));
    assert.deepEqual(numStyle, { size: "13px", weight: "600" });
    for (let i = 0; i < hit.length; i++)
      for (let j = i + 1; j < hit.length; j++) {
        const a = hit[i], b = hit[j];
        assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `hit areas of verses ${a.verse} and ${b.verse} do not overlap`);
      }
    // One Tab stop: from the toolbar the next Tab lands on verse 1's number and the one after leaves the numbers.
    await page.getByRole("button", { name: "Next chapter: John 4", exact: true }).focus();
    // (Listen, while it still sits above the text, is one stop in between.)
    for (let i = 0; i < 4 && !(await page.evaluate(() => document.activeElement.classList.contains("verse-num"))); i++) await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.closest("[data-verse]")?.dataset.verse ?? null), "1", "Tab reaches the first verse number");
    assert.equal(await page.locator('.verse-num[tabindex="0"]').count(), 1, "one number is in the Tab order");
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.evaluate(() => document.activeElement.closest("[data-verse]")?.dataset.verse ?? null), "2", "ArrowDown moves to verse 2");
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(() => document.activeElement.closest("[data-verse]")?.dataset.verse ?? null), "3");
    await page.keyboard.press("ArrowUp");
    assert.equal(await page.evaluate(() => document.activeElement.closest("[data-verse]")?.dataset.verse ?? null), "2");
    await page.keyboard.press("End");
    assert.equal(await page.evaluate(() => document.activeElement.closest("[data-verse]")?.dataset.verse ?? null), "36");
    await page.keyboard.press("Home");
    assert.equal(await page.evaluate(() => document.activeElement.closest("[data-verse]")?.dataset.verse ?? null), "1");
    await page.keyboard.press("End");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains("verse-num")), false, "one Tab leaves the verse numbers");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => document.activeElement.closest("[data-verse]")?.dataset.verse ?? null), "36", "Shift+Tab returns to the number last focused");
    // The Song of Songs speaker labels stay apart from the verse text.
    await goto(page, base, "/bible/song-of-solomon/2");
    await page.locator("#verse-1").waitFor();
    assert.equal(await page.locator(".chapter-text .speaker-note").count(), 1);
    assert.ok((await page.locator(".chapter-text .speaker").count()) > 0, "speaker labels are drawn");
    assert.equal(await page.locator(".chapter-text .speaker").evaluateAll((els) => els.every((el) => getComputedStyle(el).userSelect === "none")), true, "labels are not selected or copied with the text");
    // Chapter edges: Genesis 1 has no previous button, Revelation 22 no next; John 1 follows Luke 24.
    await goto(page, base, "/bible/genesis/1");
    await page.locator("#verse-1").waitFor();
    assert.equal(await page.getByRole("button", { name: /^Previous chapter/ }).count(), 0, "Genesis 1 has no previous button");
    assert.equal(await page.getByRole("button", { name: "Next chapter: Genesis 2", exact: true }).count(), 1);
    await goto(page, base, "/bible/revelation/22");
    await page.locator("#verse-1").waitFor();
    assert.equal(await page.getByRole("button", { name: /^Next chapter/ }).count(), 0, "Revelation 22 has no next button");
    assert.equal(await page.getByRole("button", { name: "Previous chapter: Revelation 21", exact: true }).count(), 1);
    await goto(page, base, "/bible/john/1");
    await page.locator("#verse-1").waitFor();
    assert.equal(await page.getByRole("button", { name: "Previous chapter: Luke 24", exact: true }).count(), 1, "the previous chapter crosses into the book before");
    await page.getByRole("button", { name: "Next chapter: John 2", exact: true }).click();
    await page.waitForURL("**/bible/john/2");
    assert.equal(await page.locator("main h1").innerText(), "John 2");
    // A long book name stays inside the toolbar at 320px, ellipsised, with the full name still the text of the heading.
    await page.setViewportSize({ width: 320, height: 568 });
    await goto(page, base, "/bible/1-thessalonians/5");
    await page.locator("#verse-1").waitFor();
    const narrow = await page.locator(".reader-toolbar").evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    assert.ok(narrow.scroll <= narrow.client, `the toolbar does not overflow at 320px (${narrow.scroll} > ${narrow.client})`);
    assert.equal(await page.locator("main h1").innerText(), "1 Thessalonians 5");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no sideways scroll at 320px");
    assert.deepEqual(cover.problems, []);
  } finally {
    await cover.context.close();
  }

  // --- Marked page: the printed numeral is not read, the h1 is; running text; numbers 44px wide by one line box ---
  const marked = await open(browser, { look: "marked" });
  try {
    const { page } = marked;
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-1").waitFor();
    assert.equal(await page.locator("main h1").count(), 1);
    assert.equal(await page.getByRole("heading", { level: 1, name: "John 3", exact: true }).count(), 1, "the h1 John 3 exists for assistive technology");
    const hidden = await page.locator(".reader-heading").evaluate((el) => {
      const b = el.getBoundingClientRect();
      return b.width <= 1 && b.height <= 1;
    });
    assert.equal(hidden, true, "the h1 is visually hidden in Marked");
    assert.equal(await page.locator(".chapter-opening").getAttribute("aria-hidden"), "true", "the numeral is aria-hidden");
    assert.equal(await page.locator(".chapter-numeral").innerText(), "3");
    const numeral = await page.locator(".chapter-numeral").evaluate((el) => ({ size: getComputedStyle(el).fontSize, face: getComputedStyle(el).fontFamily, color: getComputedStyle(el).color }));
    assert.ok(Math.abs(parseFloat(numeral.size) - 78) < 0.1, "78px at the default text size (" + numeral.size + ")");
    assert.match(numeral.face, /Literata/);
    const brand = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--brand)";
      document.body.append(probe);
      const v = getComputedStyle(probe).color;
      probe.remove();
      return v;
    });
    assert.equal(numeral.color, brand, "the numeral is --brand");
    const ribbon = await box(page, ".chapter-ribbon");
    assert.deepEqual([Math.round(ribbon.width), Math.round(ribbon.height)], [10, 72], "the ribbon is 10 x 72");
    // Running text: verses are inline, numbers inside the lines.
    assert.equal(await page.locator("#verse-2").evaluate((el) => getComputedStyle(el).display), "inline");
    const hit = await hitAreas(page);
    assert.ok(hit.every((h) => h.w === 44), "44px wide");
    const line = await page.locator(".chapter-text").evaluate((el) => parseFloat(getComputedStyle(el).fontSize) * 1.7);
    assert.ok(hit.every((h) => Math.abs(h.h - line) < 0.5), `exactly one line box tall (${line}px)`);
    for (let i = 0; i < hit.length; i++)
      for (let j = i + 1; j < hit.length; j++) {
        const a = hit[i], b = hit[j];
        assert.ok(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5, `Marked hit areas of verses ${a.verse} and ${b.verse} do not overlap`);
      }
    const first = await box(page, "#verse-1");
    assert.ok(first.top < 190, `verse 1 is near the top in Marked too (${Math.round(first.top)}px)`);
    assert.deepEqual(marked.problems, []);
  } finally {
    await marked.context.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The library, the picker, search and the overflow menu.

const published = () =>
  publishedChecks(readdirSync("site/content/context-checks").filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync("site/content/context-checks/" + f, "utf8"))));

/** Seeds the private state of a page that has already opened once, then reloads. */
async function seedState(page, change) {
  await page.evaluate((change) => {
    const state = JSON.parse(localStorage.getItem("hfg-daily-walk:v3"));
    Object.assign(state, change);
    localStorage.setItem("hfg-daily-walk:v3", JSON.stringify(state));
  }, change);
  await page.reload();
  await page.locator("main h1").first().waitFor({ state: "attached" });
}

const focusedText = (page) => page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);

/** The library of A2: the context checks first, saved passages, the testaments, the books and their chapter grids. */
export async function checkLibrary(browser, base) {
  const ctx = await open(browser);
  try {
    const { page } = ctx;
    await goto(page, base, "/bible");
    assert.equal(await page.locator("main h1").count(), 1);
    assert.equal(await page.locator("main h1").innerText(), "Bible");
    assert.equal(await page.getByRole("button", { name: "Search the Bible", exact: true }).count(), 1, "Search is an icon next to the title");
    assert.equal(await page.getByText("Continue reading").count(), 0, "no Continue reading before a chapter was opened");
    // The context checks are the library's first row, with the live count.
    const n = published().length;
    const row = page.getByRole("link", { name: /^Context checks/ });
    assert.equal(await row.count(), 1);
    assert.equal(await row.getAttribute("href"), "/context");
    assert.equal(await row.innerText(), `Context checks\n${n === 1 ? "1 well-known verse, back in its story" : `${n} well-known verses, back in their story`}`);
    const firstRows = await page.locator(".group").first().evaluate((el) => el.textContent);
    assert.match(firstRows, /^Context checks/);
    // Saved passages: empty, then with a bookmark.
    const saved = page.getByRole("button", { name: /^Saved passages/ });
    await saved.click();
    const sheet = page.getByRole("dialog", { name: "Saved passages" });
    await sheet.waitFor();
    assert.equal(await sheet.getByText("Nothing saved yet. Tap a verse and choose Save verse.").count(), 1);
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.textContent?.trim().startsWith("Saved passages"), undefined, { timeout: 3000 }).catch(() => assert.fail("focus returns to the row"));
    await seedState(page, { bookmarks: ["/bible/romans/8/28", "/bible/song-of-solomon/2/4"] });
    await page.getByRole("button", { name: /^Saved passages/ }).click();
    const list = page.getByRole("dialog", { name: "Saved passages" });
    await list.waitFor();
    assert.deepEqual(await list.getByRole("link").allInnerTexts(), ["Romans 8:28", "Song of Solomon 2:4"], "bookmarks read as references");
    await list.getByRole("link", { name: "Romans 8:28" }).click();
    await page.waitForURL("**/bible/romans/8/28");
    // Old and New Testament segments, the books, one chapter grid.
    await goto(page, base, "/bible");
    const segments = page.getByRole("radiogroup", { name: "Testament" });
    assert.equal(await segments.getByRole("radio", { name: "Old Testament" }).getAttribute("aria-checked"), "true");
    assert.equal(await page.getByRole("button", { name: "Genesis", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Matthew", exact: true }).count(), 0, "the New Testament books are on the other segment");
    assert.equal(await page.locator(".picker-books li").count(), 39);
    await segments.getByRole("radio", { name: "New Testament" }).click();
    assert.equal(await page.locator(".picker-books li").count(), 27);
    await page.getByRole("button", { name: "John", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "John", exact: true }).getAttribute("aria-expanded"), "true");
    const cells = await page.locator(".chapter-cell").evaluateAll((els) => els.map((el) => ({ label: el.getAttribute("aria-label"), top: Math.round(el.getBoundingClientRect().top), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) })));
    assert.equal(cells.length, 21, "John has 21 chapters");
    assert.equal(cells[2].label, "Chapter 3");
    assert.ok(cells.every((c) => c.w === 52 && c.h === 52), "52 x 52 buttons");
    assert.equal(cells.filter((c) => c.top === cells[0].top).length, 6, "6 to a row at 390px");
    await page.getByRole("button", { name: "Chapter 3", exact: true }).click();
    await page.waitForURL("**/bible/john/3");
    assert.equal(await page.locator("main h1").innerText(), "John 3");
    // Continue reading now names John 3.
    await goto(page, base, "/bible");
    const resume = page.getByRole("link", { name: /^Continue reading/ });
    assert.equal(await resume.getAttribute("href"), "/bible/john/3");
    assert.equal(await resume.innerText(), "Continue reading\nJohn 3");
    // 320px: 5 to a row, nothing scrolls sideways.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole("radio", { name: "New Testament" }).click();
    await page.getByRole("button", { name: "John", exact: true }).click();
    const narrow = await page.locator(".chapter-cell").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    assert.equal(narrow.filter((t) => t === narrow[0]).length, 5, "5 to a row at 320px");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(ctx.problems, []);
  } finally {
    await ctx.context.close();
  }
  // The first open: the failure with its way out.
  const failing = await open(browser);
  try {
    const { page } = failing;
    let calls = 0;
    await page.route("**/bible/web.json", (route) => {
      calls++;
      return route.fulfill({ status: 503, body: "Unavailable" });
    });
    await page.goto(base + "/bible");
    await page.getByText("The Bible could not be opened. Check your connection and try again.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Try downloading again", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Search the Bible", exact: true }).isDisabled(), true, "nothing to search before the Bible has arrived");
    await page.unroute("**/bible/web.json");
    await page.getByRole("button", { name: "Try downloading again", exact: true }).click();
    await page.getByRole("button", { name: "Genesis", exact: true }).waitFor();
    assert.ok(calls >= 1);
    // Context checks and saved passages never waited for the download.
    assert.equal(await page.getByRole("link", { name: /^Context checks/ }).count(), 1);
    assert.deepEqual(failing.problems.filter((p) => !/503|Failed to load resource/.test(p)), []);
  } finally {
    await failing.context.close();
  }
}

/** The sheets of the reader (A4 first paragraph): the picker behind the title, search, More; behaviour of the sheet. */
export async function checkReaderSheets(browser, base) {
  const ctx = await open(browser);
  try {
    const { page } = ctx;
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-1").waitFor();
    // At 390px the toolbar shows Books, previous, title, next and More; Search lives in More.
    assert.equal(await page.getByRole("button", { name: "More options", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Search the Bible", exact: true }).count(), 0, "Search is not in the 390px toolbar");
    // The title pill opens the picker: focus on its title, the current book open, Escape closes and focus is back.
    const pill = page.getByRole("button", { name: "John 3", exact: true });
    await pill.click();
    const picker = page.getByRole("dialog", { name: "Choose a passage" });
    await picker.waitFor();
    assert.equal(await focusedText(page), "Choose a passage", "focus is on the sheet's title");
    assert.equal(await picker.getByRole("button", { name: "Close Choose a passage", exact: true }).count(), 1, "Close names the object");
    assert.equal(await picker.getByRole("radio", { name: "New Testament" }).getAttribute("aria-checked"), "true", "the current book's testament is shown");
    assert.equal(await picker.getByRole("button", { name: "John", exact: true }).getAttribute("aria-expanded"), "true", "the current book is open");
    assert.equal(await picker.getByRole("button", { name: "Chapter 3", exact: true }).getAttribute("aria-current"), "true");
    const grabber = await picker.locator(".sheet-grabber").evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
    assert.deepEqual([Math.round(grabber.w), Math.round(grabber.h)], [36, 5], "a 36 x 5 grabber");
    // The page behind a sheet is inert.
    assert.equal(await page.evaluate(() => !!document.querySelector("dialog[open]") && document.querySelector("dialog[open]").matches(":modal")), true, "the sheet is modal");
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("rt-title"), undefined, { timeout: 3000 }).catch(() => assert.fail("focus returns to the title pill"));
    // Choose another chapter, and another book.
    await pill.click();
    await page.getByRole("dialog", { name: "Choose a passage" }).getByRole("button", { name: "Chapter 4", exact: true }).click();
    await page.waitForURL("**/bible/john/4");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "John 4", exact: true }).click();
    const again = page.getByRole("dialog", { name: "Choose a passage" });
    await again.getByRole("radio", { name: "Old Testament" }).click();
    await again.getByRole("button", { name: "Genesis", exact: true }).click();
    await again.getByRole("button", { name: "Chapter 1", exact: true }).click();
    await page.waitForURL("**/bible/genesis/1");
    // Detents and swipe: large opens at about 90 % of the screen; a slow short swipe settles at the medium
    // detent, a longer one dismisses; Close and the backdrop dismiss too.
    await page.getByRole("button", { name: "Genesis 1", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Choose a passage" });
    await sheet.waitFor();
    await page.waitForFunction(() => document.getAnimations().length === 0);
    const large = await sheet.evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(Math.abs(large - 844 * 0.9) < 2, `the large detent is 90 % of the screen (${large})`);
    const handleOf = () =>
      sheet.locator(".sheet-grabber").evaluate((el) => {
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      });
    const drag = async (to) => {
      const handle = await handleOf();
      await page.mouse.move(handle.x, handle.y);
      await page.mouse.down();
      for (const f of [0.3, 0.6, 1]) {
        await page.mouse.move(handle.x, handle.y + to * f);
        await page.waitForTimeout(110);
      }
      await page.mouse.up();
      await page.waitForTimeout(300);
    };
    await drag(200);
    assert.ok((await sheet.evaluate((el) => el.getBoundingClientRect().height)) <= 844 * 0.5 + 2, "a short slow swipe settles at the medium detent");
    await drag(220);
    await sheet.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("rt-title"), undefined, { timeout: 3000 }).catch(() => assert.fail("focus is back on the pill after a swipe too"));
    // Close button and backdrop.
    await page.getByRole("button", { name: "Genesis 1", exact: true }).click();
    await page.getByRole("button", { name: "Close Choose a passage", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Genesis 1", exact: true }).click();
    await page.getByRole("dialog", { name: "Choose a passage" }).waitFor();
    await page.mouse.click(195, 20);
    await page.getByRole("dialog").waitFor({ state: "detached" });

    // Search is behind More at 390px; its sheet is labelled, focus goes to its title.
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-1").waitFor();
    await page.getByRole("button", { name: "More options", exact: true }).click();
    const more = page.getByRole("dialog", { name: "More options" });
    await more.waitFor();
    assert.equal(await focusedText(page), "More options");
    assert.equal(await more.getByRole("button", { name: "Books", exact: true }).count(), 0, "Books is in the toolbar at 390px");
    await more.getByRole("button", { name: "Search the Bible", exact: true }).click();
    const search = page.getByRole("dialog", { name: "Search the Bible" });
    await search.waitFor();
    assert.equal(await page.getByRole("dialog").count(), 1, "one sheet at a time");
    assert.equal(await focusedText(page), "Search the Bible");
    const field = search.getByLabel("Words to find");
    await field.fill("zzzqqq");
    await search.getByRole("button", { name: "Search", exact: true }).click();
    assert.equal(await search.getByRole("status").innerText(), "No verses found for “zzzqqq”. Check the spelling, or search for one word.");
    await field.fill("ab");
    await search.getByRole("button", { name: "Search", exact: true }).click();
    assert.equal(await search.getByRole("status").innerText(), "Type at least three letters to search.");
    await field.fill("For God so loved");
    await search.getByRole("button", { name: "Search", exact: true }).click();
    await search.getByRole("button", { name: /^John 3:16/ }).waitFor();
    assert.equal(await search.getByRole("status").innerText(), "1 verse with “For God so loved”.");
    await page.keyboard.press("Escape");
    await search.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("rt-more"), undefined, { timeout: 3000 }).catch(() => assert.fail("focus returns to More"));
    await page.getByRole("button", { name: "More options", exact: true }).click();
    await page.getByRole("dialog", { name: "More options" }).getByRole("button", { name: "Search the Bible", exact: true }).click();
    await page.getByLabel("Words to find").fill("loved the world");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: /^John 3:16/ }).click();
    await page.waitForURL("**/bible/john/3/16");
    await page.locator("#verse-16.selected").waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0, "choosing a result closes the sheet");
    // The old top search card and selects are gone for good.
    assert.equal(await page.getByRole("searchbox").count(), 0);

    // The width budget (A3): 430px and wider shows Search in the toolbar and no More; under 360px Books moves into More.
    await page.setViewportSize({ width: 430, height: 800 });
    await goto(page, base, "/bible/john/3");
    assert.equal(await page.getByRole("button", { name: "Search the Bible", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "More options", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Books", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Search the Bible", exact: true }).click();
    await page.getByRole("dialog", { name: "Search the Bible" }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("rt-search"), undefined, { timeout: 3000 }).catch(() => assert.fail("focus returns to the Search button"));
    await page.setViewportSize({ width: 320, height: 568 });
    await goto(page, base, "/bible/john/3");
    assert.equal(await page.getByRole("button", { name: "Books", exact: true }).count(), 0, "Books leaves the toolbar under 360px");
    await page.getByRole("button", { name: "More options", exact: true }).click();
    await page.getByRole("dialog", { name: "More options" }).getByRole("button", { name: "Books", exact: true }).click();
    await page.waitForURL("**/bible");
    // Large-text mode uses the narrowest set at every width.
    await page.setViewportSize({ width: 430, height: 800 });
    await goto(page, base, "/bible/john/3");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "34px";
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(() => document.documentElement.dataset.text === "large");
    assert.equal(await page.getByRole("button", { name: "More options", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Search the Bible", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Books", exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no sideways scroll at 200 % text");
    assert.deepEqual(ctx.problems, []);
  } finally {
    await ctx.context.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The end of the chapter and Listen as a mini player.

const filledIn = (locator) =>
  locator.evaluateAll((root) =>
    [...root[0].querySelectorAll("button")].filter((b) => getComputedStyle(b).backgroundColor !== "rgba(0, 0, 0, 0)").map((b) => b.textContent.trim()),
  );

/** A speech engine the test controls: it records what would be spoken and lets the test say which verse is being read. */
const speechStub = () => {
  const spoken = [];
  window.__spoken = spoken;
  window.__paused = false;
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
  Object.defineProperty(window, "speechSynthesis", {
    value: {
      speak: (u) => spoken.push(u),
      cancel: () => {
        spoken.length = 0;
      },
      pause: () => {
        window.__paused = true;
      },
      resume: () => {
        window.__paused = false;
      },
      getVoices: () => [],
    },
    configurable: true,
  });
};

export async function checkChapterEnd(browser, base) {
  const ctx = await open(browser);
  try {
    const { page } = ctx;
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-36").waitFor();
    const end = page.locator(".chapter-end");
    await end.scrollIntoViewIfNeeded();
    assert.equal(await end.locator(".end-of").innerText(), "End of John 3");
    // 48px under the last verse.
    const gap = await page.evaluate(() => Math.round(document.querySelector(".chapter-end").getBoundingClientRect().top - document.querySelector("#verse-36").getBoundingClientRect().bottom));
    assert.ok(gap >= 48 && gap < 80, `about 48px below the last verse (${gap})`);
    // One filled button, "Next: John 4"; the rest are plain or outlined.
    assert.deepEqual(await filledIn(end), ["Next: John 4"], "exactly one filled button in the end block");
    assert.equal(await end.getByRole("button", { name: "Previous: John 2", exact: true }).textContent(), "‹ John 2");
    assert.equal(await end.getByRole("heading", { name: "Questions to carry", exact: true }).count(), 1);
    assert.deepEqual(await end.locator(".end-questions li").allInnerTexts(), [
      "What do you observe in these verses?",
      "What changes when you read the whole chapter?",
      "What question would you bring to a trusted pastor or study group?",
    ]);
    assert.equal(await end.getByRole("button", { name: "Write a private study note", exact: true }).count(), 1);
    assert.equal(await end.getByText("Topics that use this chapter").count(), 0, "John 3 has no topics");
    // The WEB line and its source link stay at the end (T-01.1-31).
    assert.equal(await end.locator(".web-line").evaluate((el) => el.textContent.startsWith("World English Bible (WEB), public domain.")), true);
    assert.equal(await end.locator(".web-line a").getAttribute("href"), "https://ebible.org/engwebp/copyright.htm");
    assert.equal(await page.getByText("Scripture · Public domain · WEB").count(), 0, "the old eyebrow is gone");
    // Mark as read: a toggle with aria-pressed that writes the reading list.
    const mark = end.getByRole("button", { name: "Mark as read", exact: true });
    assert.equal(await mark.getAttribute("aria-pressed"), "false");
    await mark.click();
    assert.equal(await mark.getAttribute("aria-pressed"), "true");
    const reading = () => page.evaluate(() => JSON.parse(localStorage.getItem("hfg-daily-walk:v3")).reading);
    assert.deepEqual(await reading(), ["/bible/john/3"], "the chapter is in the reading list");
    await page.reload();
    await page.locator(".chapter-end").waitFor();
    assert.equal(await page.getByRole("button", { name: "Mark as read", exact: true }).getAttribute("aria-pressed"), "true", "still read after a reload");
    await page.getByRole("button", { name: "Mark as read", exact: true }).click();
    assert.deepEqual(await reading(), [], "pressing again takes it off the list");
    // The private study note: an entry for this chapter in the journal.
    await page.getByRole("button", { name: "Write a private study note", exact: true }).click();
    await page.waitForURL("**/journal");
    const entry = await page.evaluate(() => JSON.parse(localStorage.getItem("hfg-daily-walk:v3")).entries[0]);
    assert.deepEqual([entry.type, entry.title, entry.source], ["study note", "John 3", "/bible/john/3"]);
    // Next opens John 4; Revelation 22 has no Next; Genesis 1 has no previous.
    await goto(page, base, "/bible/john/3");
    await page.getByRole("button", { name: "Next: John 4", exact: true }).click();
    await page.waitForURL("**/bible/john/4");
    assert.equal(await page.locator("main h1").innerText(), "John 4");
    await goto(page, base, "/bible/revelation/22");
    await page.locator(".chapter-end").waitFor();
    assert.equal(await page.getByRole("button", { name: /^Next:/ }).count(), 0, "no Next on Revelation 22");
    assert.deepEqual(await filledIn(page.locator(".chapter-end")), [], "no filled button there either");
    await goto(page, base, "/bible/genesis/1");
    await page.locator(".chapter-end").waitFor();
    assert.equal(await page.getByRole("button", { name: /^Previous:/ }).count(), 0, "no previous button on Genesis 1");
    assert.equal(await page.getByRole("button", { name: "Next: Genesis 2", exact: true }).count(), 1);
    // Topics that use the chapter: rows, as before in the related-topics card.
    await goto(page, base, "/bible/psalms/23");
    const topics = page.locator(".chapter-end .group");
    await topics.waitFor();
    assert.equal(await topics.locator("h2").innerText(), "Topics that use this chapter");
    assert.ok((await topics.getByRole("link").allInnerTexts()).includes("Grief"));
    await topics.getByRole("link", { name: "Grief", exact: true }).click();
    await page.waitForURL("**/community/grief");
    // 200 % text: the pair of plain buttons stacks and nothing scrolls sideways.
    await goto(page, base, "/bible/john/3");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "34px";
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(() => document.documentElement.dataset.text === "large");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(ctx.problems, []);
  } finally {
    await ctx.context.close();
  }
}

export async function checkListen(browser, base) {
  // 430px: Listen is in the toolbar. The bar is above the tab bar, the spoken verse is gold, Stop gives focus back.
  const wide = await open(browser, { width: 430, height: 800 });
  try {
    const { page, context } = wide;
    await context.addInitScript(speechStub);
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-1").waitFor();
    assert.equal(await page.locator(".mini-player").count(), 0, "no player before it is started");
    const start = page.getByRole("button", { name: "Listen to John 3", exact: true });
    assert.equal(await start.count(), 1, "the toolbar's Listen button is named after the chapter");
    await start.click();
    const bar = page.locator(".mini-player");
    await bar.waitFor();
    assert.equal(await page.evaluate(() => window.__spoken.length), 37, "the reference, then each of the 36 verses");
    assert.equal(await page.evaluate(() => window.__spoken[0].text), "John 3.");
    assert.deepEqual(await bar.getByRole("button").allInnerTexts(), ["Pause", "Stop"]);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Pause", "focus moves into the bar");
    // The bar floats above the tab bar and never covers the end of the page's text: the page pads for it.
    const geometry = await page.evaluate(() => ({ bar: document.querySelector(".mini-player").getBoundingClientRect().bottom, tab: document.querySelector("nav.tabbar").getBoundingClientRect().top }));
    assert.ok(geometry.bar <= geometry.tab, `the bar is above the tab bar (${geometry.bar} <= ${geometry.tab})`);
    // The verse being read is named and keeps the gold highlight.
    await page.evaluate(() => window.__spoken[2].onstart());
    assert.equal(await bar.locator(".mini-verse").innerText(), "Verse 2");
    await page.locator("#verse-2.speaking").waitFor();
    const gold = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.backgroundColor = "var(--highlight-gold)";
      document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    assert.equal(await page.locator("#verse-2").evaluate((el) => getComputedStyle(el).backgroundColor), gold, "the spoken verse is --highlight-gold");
    await page.evaluate(() => window.__spoken[3].onstart());
    assert.equal(await page.locator(".verse.speaking").count(), 1, "one verse at a time");
    // Pause and Resume.
    await bar.getByRole("button", { name: "Pause", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__paused), true);
    await bar.getByRole("button", { name: "Resume", exact: true }).click();
    assert.equal(await page.evaluate(() => window.__paused), false);
    // The toolbar's Listen button is not offered twice while the player is up.
    assert.equal(await page.getByRole("button", { name: "Listen to John 3", exact: true }).count(), 0);
    await bar.getByRole("button", { name: "Stop", exact: true }).click();
    await bar.waitFor({ state: "detached" });
    assert.equal(await page.locator(".verse.speaking").count(), 0, "no verse stays highlighted");
    assert.equal(await page.evaluate(() => window.__spoken.length), 0, "speech is cancelled");
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Listen to John 3", undefined, { timeout: 3000 }).catch(() => assert.fail("focus returns to the Listen button"));
    // Leaving the chapter stops it too.
    await page.getByRole("button", { name: "Listen to John 3", exact: true }).click();
    await bar.waitFor();
    await page.getByRole("button", { name: "Next chapter: John 4", exact: true }).click();
    await page.waitForURL("**/bible/john/4");
    await bar.waitFor({ state: "detached" });
    assert.deepEqual(wide.problems, []);
  } finally {
    await wide.context.close();
  }
  // 390px: Listen is in More, with the sentence about the device's own voice.
  const narrow = await open(browser);
  try {
    const { page, context } = narrow;
    await context.addInitScript(speechStub);
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-1").waitFor();
    assert.equal(await page.getByRole("button", { name: "Listen to John 3", exact: true }).count(), 0, "Listen is not in the 390px toolbar");
    await page.getByRole("button", { name: "More options", exact: true }).click();
    const more = page.getByRole("dialog", { name: "More options" });
    const row = more.getByRole("button", { name: /^Listen to John 3/ });
    assert.match(await row.innerText(), /Read aloud by your device’s own voice\./);
    await row.click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.locator(".mini-player").waitFor();
    assert.deepEqual(await page.locator(".mini-player").getByRole("button").allInnerTexts(), ["Pause", "Stop"]);
    await page.locator(".mini-player").getByRole("button", { name: "Stop", exact: true }).click();
    await page.locator(".mini-player").waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("rt-more"), undefined, { timeout: 3000 }).catch(() => assert.fail("focus returns to More"));
    assert.deepEqual(narrow.problems, []);
  } finally {
    await narrow.context.close();
  }
  // No speech in the browser, no control (as before).
  const silent = await open(browser, { width: 430, height: 800 });
  try {
    const { page, context } = silent;
    await context.addInitScript(() => {
      delete window.speechSynthesis;
      delete window.SpeechSynthesisUtterance;
    });
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-1").waitFor();
    assert.equal(await page.getByRole("button", { name: /^Listen/ }).count(), 0, "no Listen control without speech");
    assert.deepEqual(silent.problems, []);
  } finally {
    await silent.context.close();
  }
}
