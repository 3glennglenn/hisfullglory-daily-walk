import assert from "node:assert/strict";
import { build } from "esbuild";
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

// ---------------------------------------------------------------------------------------------------------------
// The verse sheet: actions (Task 1 of plan 10).

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("hfg-daily-walk:v3")));

/** Tap a verse, act on it in one sheet, come back where you were. */
export async function checkVerseSheet(browser, base) {
  const ctx = await open(browser, { extra: { permissions: ["clipboard-read", "clipboard-write"] } });
  try {
    const { page, context } = ctx;
    // No system share sheet: Share verse copies the link instead.
    await context.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
    await goto(page, base, "/bible/romans/8/28");
    await page.locator("#verse-28").waitFor();
    // A link to a verse selects it (the gold tint) without opening anything.
    assert.equal(await page.locator("#verse-28.selected").count(), 1);
    assert.equal(await page.getByRole("dialog").count(), 0, "no sheet opens by itself");
    assert.equal(await page.getByText("Selected passage").count(), 0, "the old actions card is gone");
    // Activating the number opens one sheet titled with the reference; focus on the title; Close names it.
    await page.locator("#verse-28 .verse-num").click();
    const sheet = page.getByRole("dialog", { name: "Romans 8:28" });
    await sheet.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.tagName + ":" + document.activeElement?.textContent), "H2:Romans 8:28", "focus is on the title");
    assert.equal(await sheet.getByRole("button", { name: "Close Romans 8:28", exact: true }).innerText(), "Close");
    assert.equal(await page.locator("#verse-28.selected").count(), 1, "the verse is tinted while its sheet is open");
    assert.equal(new URL(page.url()).pathname, "/bible/romans/8/28", "the address follows the verse");
    // The five actions, at least 64px tall, an icon of 24px above a 13px label.
    const actions = await sheet.locator(".verse-action").evaluateAll((els) =>
      els.map((el) => ({ label: el.textContent.trim(), h: el.getBoundingClientRect().height, icon: el.querySelector("svg").getBoundingClientRect().width, size: Math.round(parseFloat(getComputedStyle(el.querySelector("span")).fontSize)), weight: getComputedStyle(el.querySelector("span")).fontWeight })),
    );
    assert.deepEqual(actions.map((a) => a.label), ["Highlight", "Save verse", "Add to journal", "Copy verse", "Share verse"]);
    assert.ok(actions.every((a) => a.h >= 64 && a.icon === 24 && a.size === 13 && a.weight === "600"), JSON.stringify(actions));
    // Save verse: becomes Saved, aria-pressed, a bookmark is stored.
    const save = sheet.getByRole("button", { name: "Save verse", exact: true });
    assert.equal(await save.getAttribute("aria-pressed"), "false");
    await save.click();
    const saved = sheet.getByRole("button", { name: "Saved", exact: true });
    assert.equal(await saved.getAttribute("aria-pressed"), "true");
    assert.ok((await stored(page)).bookmarks.includes("/bible/romans/8/28"));
    // Highlight: a radiogroup of four named 44px swatches; Sage is stored and kept after a reload.
    await sheet.getByRole("button", { name: "Highlight", exact: true }).click();
    const group = sheet.getByRole("radiogroup", { name: "Highlight colour" });
    assert.deepEqual(await group.getByRole("radio").evaluateAll((els) => els.map((el) => el.textContent.trim())), ["Gold", "Sage", "Rose", "None"]);
    assert.ok((await group.locator(".swatch-dot").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))).every((w) => w === 44));
    assert.equal(await group.getByRole("radio", { name: "None" }).getAttribute("aria-checked"), "true");
    await group.getByRole("radio", { name: "Sage" }).click();
    assert.equal((await stored(page)).highlights["/bible/romans/8/28"], "sage");
    await page.keyboard.press("ArrowRight");
    assert.equal((await stored(page)).highlights["/bible/romans/8/28"], "rose", "arrow keys move the choice");
    await group.getByRole("radio", { name: "Sage" }).click();
    // Copy verse and Share verse (without the system share sheet) say what they did.
    await sheet.getByRole("button", { name: "Copy verse", exact: true }).click();
    await sheet.getByText("Copied.", { exact: true }).waitFor();
    const text = await page.evaluate(async () => {
      const bible = await (await fetch("/bible/web.json")).json();
      return bible.books.find((b) => b.slug === "romans").chapters[7].verses.find((v) => v.number === 28).text;
    });
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `${text} Romans 8:28 (WEB)`, "the verse, its reference and (WEB)");
    await page.evaluate(() => navigator.clipboard.writeText("nothing"));
    await sheet.getByRole("button", { name: "Share verse", exact: true }).click();
    await sheet.getByText("Passage link copied.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), new URL(page.url()).origin + "/bible/romans/8/28");
    // Escape closes, focus is on the verse number, the choice is over (the address is the chapter's).
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("verse-num") && document.activeElement.closest("[data-verse]").dataset.verse === "28", undefined, { timeout: 3000 }).catch(() => assert.fail("focus returns to the verse number"));
    assert.equal(await page.locator(".verse.selected").count(), 0);
    assert.equal(new URL(page.url()).pathname, "/bible/romans/8");
    // The highlight survives a reload; the number of a highlighted verse is ink in Light.
    await page.reload();
    await page.locator("#verse-28.highlight-sage").waitFor();
    const colours = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--ink)";
      document.body.append(probe);
      const ink = getComputedStyle(probe).color;
      probe.remove();
      return { ink, number: getComputedStyle(document.querySelector("#verse-28 .verse-num")).color, other: getComputedStyle(document.querySelector("#verse-27 .verse-num")).color };
    });
    assert.equal(colours.number, colours.ink, "a highlighted verse's number is --ink in Light");
    assert.notEqual(colours.other, colours.ink, "other numbers stay --link");
    // A tap on the text of a verse opens its sheet.
    await page.locator("#verse-27 .verse-text").click();
    await page.getByRole("dialog", { name: "Romans 8:27" }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    // Not a tap: a press of 500ms or more is a long press (native selection and copy)...
    const at = await page.locator("#verse-25 .verse-text").evaluate((el) => {
      el.scrollIntoView({ block: "center" });
      const b = el.getBoundingClientRect();
      return { x: b.left + 40, y: b.top + 12 };
    });
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    assert.equal(await page.getByRole("dialog").count(), 0, "a long press opens nothing");
    // ...and neither is a click that ends a text selection.
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("#verse-26 .verse-text"));
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.locator("#verse-24 .verse-text").click();
    assert.equal(await page.getByRole("dialog").count(), 0, "a click with a text selection opens nothing");
    await page.locator("#verse-24 .verse-text").click();
    await page.getByRole("dialog", { name: "Romans 8:24" }).waitFor();
    // Add to journal: the private composer with the reference.
    await page.getByRole("button", { name: "Add to journal", exact: true }).click();
    await page.waitForURL("**/journal");
    const entry = (await stored(page)).entries[0];
    assert.deepEqual([entry.type, entry.title, entry.source], ["Bible passage", "Romans 8:24", "/bible/romans/8/24"]);
    assert.deepEqual(ctx.problems, []);
  } finally {
    await ctx.context.close();
  }
  // The native share sheet, where there is one, gets the passage and its link.
  const sharing = await open(browser);
  try {
    const { page, context } = sharing;
    await context.addInitScript(() => {
      window.__shared = [];
      navigator.share = async (data) => {
        window.__shared.push(data);
      };
    });
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-16 .verse-num").click();
    await page.getByRole("button", { name: "Share verse", exact: true }).click();
    const shared = await page.evaluate(() => window.__shared[0]);
    assert.deepEqual([shared.title, shared.text, new URL(shared.url).pathname], ["John 3:16", "John 3:16 (WEB)", "/bible/john/3/16"]);
    assert.deepEqual(sharing.problems, []);
  } finally {
    await sharing.context.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The layers around a verse (Task 2 of plan 10).

const layerRows = (sheet) => sheet.locator(".layer-row").evaluateAll((els) => els.map((el) => el.dataset.layerRow));
const openVerseSheet = async (page, verse, name) => {
  await page.locator(`#verse-${verse} .verse-num`).click();
  const sheet = page.getByRole("dialog", { name });
  await sheet.waitFor();
  return sheet;
};
const serif = /^["']?(Gelasio|Literata)/;

/** Context, AI explanation and Community: apart by words, icon, frame and colour, with honest states. */
export async function checkLayers(browser, base) {
  const ctx = await open(browser);
  try {
    const { page } = ctx;
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-3").waitFor();
    const sheet = await openVerseSheet(page, 3, "John 3:3");
    // "Around this verse": the layers in their fixed order (no community service is configured in this build, so no
    // Community row: the feature is hidden, not announced).
    assert.equal(await sheet.getByRole("heading", { name: "Around this verse", exact: true }).count(), 1);
    await sheet.locator('[data-layer-row="ai"] .list-row-detail').filter({ hasNotText: "Loading…" }).waitFor();
    assert.deepEqual(await layerRows(sheet), ["context", "ai"]);
    const context = sheet.locator('[data-layer-row="context"]');
    assert.match(await context.innerText(), /^Context\n(Editorial draft|Reviewed|Editorial observation)\nAbout John/);
    // The AI row: the badge at 13px or more, a sparkle icon, its label in the AI colour; the words say what it is.
    const aiRow = sheet.locator('[data-layer-row="ai"]');
    const badge = await aiRow.locator(".ai-badge").evaluate((el) => ({ text: el.textContent, size: parseFloat(getComputedStyle(el).fontSize) }));
    assert.equal(badge.text, "AI");
    assert.ok(badge.size >= 12.99, `the AI badge is at least 13px (${badge.size})`);
    assert.match(await aiRow.innerText(), /^AI explanation\nAI\n(How translations differ here|About John)/);
    const colours = await page.evaluate(() => {
      const read = (name) => {
        const probe = document.createElement("i");
        probe.style.color = `var(${name})`;
        document.body.append(probe);
        const v = getComputedStyle(probe).color;
        probe.remove();
        return v;
      };
      return { ai: read("--ai"), label: getComputedStyle(document.querySelector('[data-layer-row="ai"] .list-row-title')).color };
    });
    assert.equal(colours.label, colours.ai, "the AI label is --ai");
    // The AI page opens inside the same sheet: Back and Close, the dashed frame, the words, the badge, no serif.
    await aiRow.click();
    assert.equal(await page.getByRole("dialog").count(), 1, "still one sheet");
    const back = sheet.getByRole("button", { name: "Back to John 3:3", exact: true });
    assert.equal(await back.textContent(), "‹ John 3:3");
    assert.equal(await sheet.getByRole("button", { name: "Close John 3:3", exact: true }).count(), 1);
    const ai = sheet.locator('article[data-layer="ai"]');
    await ai.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "AI explanation", "focus is on the page's heading");
    // 1.5px is the frame the stylesheet draws; a 1x screen snaps a border to whole pixels, so it reads 1px there.
    assert.match(await ai.evaluate((el) => getComputedStyle(el).borderTopStyle + " " + getComputedStyle(el).borderTopWidth), /^dashed (1|1\.5)px$/, "the dashed AI frame");
    assert.equal(await ai.evaluate((el) => getComputedStyle(el).borderTopColor), colours.ai, "in the AI colour");
    assert.equal(await ai.locator(".layer-note").innerText(), "Written by an AI model. Not reviewed by a theological reader.");
    assert.ok((await ai.locator(".ai-badge").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) >= 12.99, "13px (0.7647rem at a 17px root is 12.9999)");
    assert.equal(await ai.locator("h3").innerText(), "AI explanation");
    assert.equal(await ai.locator(".layer-icon").count(), 1, "a sparkle icon");
    const faces = await ai.locator("*").evaluateAll((els) => els.filter((el) => !el.classList.contains("ai-web") && el.textContent.trim() && !el.children.length).map((el) => getComputedStyle(el).fontFamily));
    assert.ok(faces.length > 5 && faces.every((f) => !/Gelasio|Literata/.test(f)), "AI text is never set in the Scripture face");
    assert.ok(!serif.test(await ai.locator(".layer-body").first().evaluate((el) => getComputedStyle(el).fontFamily)));
    // Only the WEB quotations of the comparison are Scripture, and wear its face.
    for (const web of await ai.locator(".ai-web").all()) assert.match(await web.evaluate((el) => getComputedStyle(el).fontFamily), /Gelasio/);
    assert.equal(await ai.locator('details summary:text("About this explanation")').count(), 1);
    assert.equal(await sheet.locator("[data-layer]").count(), 1, "one layer on a page");
    // Back returns to the root page, focus on the row it came from.
    await back.click();
    await sheet.locator(".verse-actions").waitFor();
    await page.waitForFunction(() => document.activeElement?.dataset.layerRow === "ai", undefined, { timeout: 3000 }).catch(() => assert.fail("focus returns to the AI row"));
    // The Context page: a solid frame, the heading, the review words, its own page.
    await sheet.locator('[data-layer-row="context"]').click();
    const sourced = sheet.locator('article[data-layer="sourced"]');
    await sourced.waitFor();
    assert.equal(await sourced.evaluate((el) => getComputedStyle(el).borderTopStyle + " " + getComputedStyle(el).borderTopWidth), "solid 1px", "the solid sourced frame");
    assert.equal(await sourced.locator("h3").innerText(), "Context");
    assert.match(await sourced.locator(".review-pill").innerText(), /^(Editorial draft|Reviewed|Editorial observation)$/);
    assert.equal(await sourced.locator(".ai-badge, [data-layer=ai]").count(), 0, "sourced context stays free of AI");
    await sheet.getByRole("button", { name: "Back to John 3:3", exact: true }).click();
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached" });
    assert.deepEqual(ctx.problems, []);
  } finally {
    await ctx.context.close();
  }

  // The AI file is slow, then missing, then fails: each state says so.
  const states = await open(browser);
  try {
    const { page } = states;
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    await page.route("**/ai/john.json", async (route) => {
      await gate;
      await route.continue();
    });
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-3").waitFor();
    let sheet = await openVerseSheet(page, 3, "John 3:3");
    assert.match(await sheet.locator('[data-layer-row="ai"]').innerText(), /Loading…/, "Loading… until the file arrives");
    assert.equal(await sheet.locator('[data-layer-row="ai"]').evaluate((el) => el.tagName), "DIV", "not a link while it loads");
    release();
    await sheet.locator('[data-layer-row="ai"]').filter({ hasNotText: "Loading…" }).waitFor();
    assert.equal(await sheet.locator('[data-layer-row="ai"]').evaluate((el) => el.tagName), "BUTTON", "a link once it has loaded");
    await page.keyboard.press("Escape");
    await page.unroute("**/ai/john.json");
    // No file for the book: the words, and no chevron.
    await page.route("**/ai/john.json", (route) => route.fulfill({ status: 404, body: "Not found" }));
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-3").waitFor();
    sheet = await openVerseSheet(page, 3, "John 3:3");
    const none = sheet.locator('[data-layer-row="ai"]');
    await none.filter({ hasText: "No AI explanation for this chapter yet." }).waitFor();
    assert.equal(await none.evaluate((el) => el.tagName), "DIV");
    assert.equal(await none.locator(".list-row-chevron").count(), 0, "no chevron");
    assert.equal(await sheet.getByRole("button", { name: "Load again" }).count(), 0, "nothing to retry for a missing file");
    await page.keyboard.press("Escape");
    await page.unroute("**/ai/john.json");
    // The request fails: the sentence and Load again; one press asks once; the row recovers.
    let asked = 0;
    await page.route("**/ai/john.json", (route) => {
      asked++;
      return route.abort();
    });
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-3").waitFor();
    sheet = await openVerseSheet(page, 3, "John 3:3");
    const failed = sheet.locator('[data-layer-row="ai"]');
    await failed.filter({ hasText: "The AI explanation could not be loaded. Check your connection, then tap Load again." }).waitFor();
    assert.equal(await failed.evaluate((el) => el.tagName), "DIV");
    const before = asked;
    await page.unroute("**/ai/john.json");
    await sheet.getByRole("button", { name: "Load again", exact: true }).click();
    await sheet.locator('[data-layer-row="ai"]').filter({ hasNotText: /could not be loaded|Loading…/ }).waitFor();
    assert.equal(await sheet.locator('[data-layer-row="ai"]').evaluate((el) => el.tagName), "BUTTON", "recovered");
    assert.equal(asked, before, "the retry went to the real file, not the aborted one");
    assert.deepEqual(states.problems.filter((p) => !/Failed to load resource|ERR_FAILED|404/.test(p)), []);
  } finally {
    await states.context.close();
  }
}

/** The community layer, on a controlled service: its row, its page, its words offline. */
export async function checkLayersCommunity(browser, base) {
  const result = await build({
    entryPoints: ["tests/fixtures/reader.tsx"],
    bundle: true,
    write: false,
    outfile: ".tooling/reader-fixture.js",
    format: "iife",
    jsx: "automatic",
    loader: { ".svg": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "controlled-reader-sdk",
        setup(b) {
          // The published context checks come from a Vite-only glob; the reader does not need them here.
          b.onResolve({ filter: /\/context\/data$/ }, () => ({ path: "checks", namespace: "reader-fixture" }));
          b.onResolve({ filter: /^\.\.\/supabase$/ }, () => ({ path: "sdk", namespace: "reader-fixture" }));
          b.onLoad({ filter: /^checks$/, namespace: "reader-fixture" }, () => ({ loader: "js", contents: "export const contextChecks = [];" }));
          b.onLoad({ filter: /^sdk$/, namespace: "reader-fixture" }, () => ({
            loader: "js",
            contents: `
              const posts=[{origin_kind:'post',id:'c0000000-0000-4000-8000-000000000011',display_name:'Fixture reader',body:'Test-only reflection on this verse',post_type:'reflection',source_path:'/bible/john/3/3',created_at:'2026-10-07T00:00:00Z',is_owner:false,prayer_status:null,amen_count:0,helped_count:0,praying_count:0}];
              const ok={data:[],error:null};
              export const supabase={
                auth:{getSession:async()=>({data:{session:null},error:null}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},
                from(){const q={select(){return q},eq(){return q},order(){return q},maybeSingle:async()=>({data:null,error:null}),then(done,fail){return Promise.resolve(ok).then(done,fail)}};return q;},
                rpc:(name)=>Promise.resolve(name==='read_aggregate_feed'?{data:posts,error:null}:{data:null,error:null})
              };
            `,
          }));
        },
      },
    ],
  });
  const js = result.outputFiles.find((f) => f.path.endsWith(".js"))?.text ?? result.outputFiles[0].text;
  const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
  const ctx = await open(browser);
  try {
    const { page, context } = ctx;
    await page.route(base + "/bible/john/3", (route) =>
      route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en" data-look="cover" data-mode="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script>' + js + "</script></body></html>" }),
    );
    await page.goto(base + "/bible/john/3");
    await page.locator("#verse-3").waitFor();
    const sheet = await openVerseSheet(page, 3, "John 3:3");
    await sheet.locator('[data-layer-row="ai"] .list-row-detail').filter({ hasNotText: "Loading…" }).waitFor();
    assert.deepEqual(await layerRows(sheet), ["context", "ai", "community"], "Context, AI explanation, Community, in that order");
    const row = sheet.locator('[data-layer-row="community"]');
    assert.match(await row.innerText(), /^Community\nVoices, not sources\nWhat this verse means to people$/);
    assert.equal(await row.locator("svg").first().evaluate((el) => el.classList.contains("layer-row-icon")), true, "a people icon");
    await row.click();
    const voices = sheet.locator('article[data-layer="voices"]');
    await voices.waitFor();
    assert.equal(await voices.locator(".layer-title").innerText(), "Community");
    assert.equal(await voices.locator(".review-pill").innerText(), "Voices, not sources");
    const frame = await voices.evaluate((el) => ({ left: getComputedStyle(el).borderLeftWidth + " " + getComputedStyle(el).borderLeftStyle, top: getComputedStyle(el).borderTopWidth, face: getComputedStyle(el).fontFamily }));
    assert.deepEqual([frame.left, frame.top], ["3px solid", "0px"], "a 3px rule on the left, no other frame");
    assert.ok(!serif.test(frame.face), "community text is never in the Scripture face");
    await voices.getByText("Test-only reflection on this verse").waitFor();
    assert.equal(await sheet.locator("[data-layer]").count(), 1);
    await sheet.getByRole("button", { name: "Back to John 3:3", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.dataset.layerRow === "community", undefined, { timeout: 3000 }).catch(() => assert.fail("focus returns to the Community row"));
    // Offline: the words, and the row is information, not a link.
    await context.setOffline(true);
    await row.filter({ hasText: "Community voices need a connection." }).waitFor();
    assert.equal(await row.evaluate((el) => el.tagName), "DIV");
    await context.setOffline(false);
    await sheet.locator('[data-layer-row="community"]').filter({ hasText: "What this verse means to people" }).waitFor();
    assert.equal(await sheet.locator('[data-layer-row="community"]').evaluate((el) => el.tagName), "BUTTON");
    assert.deepEqual(ctx.problems.filter((p) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(p)), []);
  } finally {
    await ctx.context.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The chapter sheet and its capsule, the old links, the old views gone (Task 3 of plan 10).

const noShare = () => Object.defineProperty(navigator, "share", { value: undefined, configurable: true });

export async function checkChapterSheet(browser, base) {
  const ctx = await open(browser, { extra: { permissions: ["clipboard-read", "clipboard-write"] } });
  try {
    const { page, context } = ctx;
    await context.addInitScript(noShare);
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-36").waitFor();
    // The capsule: a 44px pill above the tab bar, fixed, named for the chapter.
    const capsule = page.getByRole("button", { name: "Around John 3", exact: true });
    assert.equal(await capsule.count(), 1);
    const geometry = await page.evaluate(() => {
      const c = document.querySelector(".around-capsule");
      const t = document.querySelector("nav.tabbar").getBoundingClientRect();
      const b = c.getBoundingClientRect();
      const style = getComputedStyle(c);
      return { height: Math.round(b.height), bottom: b.bottom, tabTop: t.top, position: style.position, radius: parseFloat(style.borderTopLeftRadius), gap: t.top - b.bottom };
    });
    assert.equal(geometry.position, "fixed");
    assert.ok(geometry.height >= 44 && geometry.radius >= 22, JSON.stringify(geometry));
    assert.ok(geometry.bottom <= geometry.tabTop, `the capsule's bottom is above the tab bar's top (${geometry.bottom} <= ${geometry.tabTop})`);
    assert.equal(Math.round(geometry.gap), 12, "12px above the tab bar");
    // It opens "Around John 3" with the layer rows for the chapter and two rows of its own.
    await capsule.click();
    const sheet = page.getByRole("dialog", { name: "Around John 3" });
    await sheet.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Around John 3", "focus on the title");
    assert.equal(await sheet.getByRole("button", { name: "Close Around John 3", exact: true }).count(), 1);
    assert.equal(await sheet.locator(".verse-actions").count(), 0, "no action row for a chapter");
    await sheet.locator('[data-layer-row="ai"] .list-row-detail').filter({ hasNotText: "Loading…" }).waitFor();
    assert.deepEqual(await layerRows(sheet), ["context", "ai"], "the layers in order (no community service in this build)");
    assert.match(await sheet.locator('[data-layer-row="context"]').innerText(), /About John/);
    assert.match(await sheet.locator('[data-layer-row="ai"]').innerText(), /About John 3/);
    // Save chapter and Share chapter.
    const save = sheet.getByRole("button", { name: "Save chapter", exact: true });
    assert.equal(await save.getAttribute("aria-pressed"), "false");
    await save.click();
    assert.equal(await sheet.getByRole("button", { name: "Saved", exact: true }).getAttribute("aria-pressed"), "true");
    assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem("hfg-daily-walk:v3")).bookmarks)).includes("/bible/john/3"));
    await sheet.getByRole("button", { name: "Share chapter", exact: true }).click();
    await sheet.getByText("Passage link copied.", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), new URL(page.url()).origin + "/bible/john/3");
    await page.keyboard.press("Escape");
    await sheet.waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("around-capsule"), undefined, { timeout: 3000 }).catch(() => assert.fail("focus returns to the capsule"));
    // The saved chapter shows in the library.
    await goto(page, base, "/bible");
    await page.getByRole("button", { name: /^Saved passages/ }).click();
    assert.deepEqual(await page.getByRole("dialog", { name: "Saved passages" }).getByRole("link").allInnerTexts(), ["John 3"]);

    // The old addresses land in the right place.
    await goto(page, base, "/bible/romans/8?tab=context");
    const around = page.getByRole("dialog", { name: "Around Romans 8" });
    await around.waitFor();
    const sourced = around.locator('article[data-layer="sourced"]');
    await sourced.waitFor();
    assert.match(await sourced.innerText(), /Verse 28 belongs with verses 29–30/);
    assert.equal(await around.getByRole("button", { name: "Back to Around Romans 8", exact: true }).count(), 1);
    await around.getByRole("button", { name: "Close Around Romans 8", exact: true }).click();
    await around.waitFor({ state: "detached" });
    assert.equal(new URL(page.url()).search, "", "closing drops the ?tab= from the address");
    await page.reload();
    await page.locator("#verse-1").waitFor();
    assert.equal(await page.getByRole("dialog").count(), 0, "a reload after closing does not open it again");
    // With a verse in the address the verse sheet opens at Context.
    await goto(page, base, "/bible/romans/8/28?tab=context");
    const verse = page.getByRole("dialog", { name: "Romans 8:28" });
    await verse.waitFor();
    assert.match(await verse.locator('article[data-layer="sourced"]').innerText(), /No note for this verse yet, so this shows the wider chapter context\./);
    await page.keyboard.press("Escape");
    // ?tab=community has no page in a build without a community: the sheet opens at its first page instead.
    await goto(page, base, "/bible/romans/8?tab=community");
    await page.getByRole("dialog", { name: "Around Romans 8" }).waitFor();
    assert.equal(await page.locator('[data-layer="voices"]').count(), 0);
    assert.equal(await page.getByRole("dialog").locator(".layer-row").count() > 0, true, "at the root page");
    await page.keyboard.press("Escape");
    // ?tab=study scrolls the end-of-chapter block into view; ?tab=read and no tab open nothing.
    await goto(page, base, "/bible/romans/8?tab=study");
    await page.locator("#chapter-end").waitFor();
    await page.waitForFunction(() => {
      const r = document.querySelector("#chapter-end").getBoundingClientRect();
      return r.top >= 0 && r.top < innerHeight / 2;
    }, undefined, { timeout: 5000 });
    assert.equal(await page.getByRole("dialog").count(), 0);
    for (const tab of ["read", "bogus"]) {
      await goto(page, base, "/bible/romans/8?tab=" + tab);
      await page.locator("#verse-1").waitFor();
      assert.equal(await page.getByRole("dialog").count(), 0, `?tab=${tab} opens nothing`);
    }
    // Nothing announces a feature that does not exist.
    for (const tab of ["read", "context", "study", "community"]) {
      await goto(page, base, "/bible/romans/8?tab=" + tab);
      await page.locator("#verse-1").waitFor();
      await page.waitForTimeout(100);
      const text = await page.locator("body").evaluate((el) => el.innerText + " " + [...el.querySelectorAll("dialog")].map((d) => d.textContent).join(" "));
      assert.equal(/pending/i.test(text), false, `the word "pending" appears nowhere (?tab=${tab})`);
      assert.equal(/Ask HisFullGlory AI|integration|not configured|migration/i.test(text), false, `?tab=${tab}: no unavailable feature is announced`);
      assert.equal(await page.locator("details summary", { hasText: "Ask HisFullGlory AI" }).count(), 0);
      assert.equal(await page.getByText("Study, with Scripture first").count(), 0, "the old Study view is gone");
      await page.keyboard.press("Escape");
    }
    assert.deepEqual(ctx.problems, []);
  } finally {
    await ctx.context.close();
  }

  // Dark device: the Lamplight notice shows; the capsule sits above it and neither covers the other.
  const dark = await open(browser, { colorScheme: "dark" });
  try {
    const { page } = dark;
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-1").waitFor();
    await page.locator(".lamplight-notice").waitFor();
    const rects = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
      return { capsule: r(".around-capsule"), notice: r(".lamplight-notice"), tab: r("nav.tabbar") };
    });
    assert.ok(rects.capsule.bottom <= rects.notice.top, `the capsule is above the notice (${rects.capsule.bottom} <= ${rects.notice.top})`);
    assert.ok(rects.notice.bottom <= rects.tab.top, "the notice is above the tab bar");
    assert.equal(Math.round(rects.notice.top - rects.capsule.bottom), 12, "12px between them");
    assert.deepEqual(dark.problems, []);
  } finally {
    await dark.context.close();
  }

  // 200 % text: the capsule is a full-width button above the tab bar, and the sheet still fits.
  const large = await open(browser);
  try {
    const { page } = large;
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-1").waitFor();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "34px";
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(() => document.documentElement.dataset.text === "large");
    const wide = await page.evaluate(() => {
      const b = document.querySelector(".around-capsule").getBoundingClientRect();
      return { width: Math.round(b.width), bottom: b.bottom, tab: document.querySelector("nav.tabbar").getBoundingClientRect().top, page: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.ok(wide.width >= 340, `full width (${wide.width})`);
    assert.ok(wide.bottom <= wide.tab);
    assert.equal(wide.page, true);
    await page.getByRole("button", { name: "Around John 3", exact: true }).click();
    await page.getByRole("dialog", { name: "Around John 3" }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(large.problems, []);
  } finally {
    await large.context.close();
  }

  // Listen replaces the capsule while it plays.
  const speaking = await open(browser, { width: 430, height: 800 });
  try {
    const { page, context } = speaking;
    await context.addInitScript(speechStub);
    await goto(page, base, "/bible/john/3");
    await page.locator("#verse-1").waitFor();
    assert.equal(await page.locator(".around-capsule").count(), 1);
    await page.getByRole("button", { name: "Listen to John 3", exact: true }).click();
    await page.locator(".mini-player").waitFor();
    assert.equal(await page.locator(".around-capsule").count(), 0, "the mini player replaces the capsule");
    await page.locator(".mini-player").getByRole("button", { name: "Stop", exact: true }).click();
    await page.locator(".around-capsule").waitFor();
    assert.deepEqual(speaking.problems, []);
  } finally {
    await speaking.context.close();
  }
}

/** The old links on a controlled community service: ?tab=community opens the Community page. */
export async function checkCommunityLink(browser, base) {
  const result = await build({
    entryPoints: ["tests/fixtures/reader.tsx"],
    bundle: true,
    write: false,
    outfile: ".tooling/reader-link-fixture.js",
    format: "iife",
    jsx: "automatic",
    loader: { ".svg": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "controlled-reader-sdk",
        setup(b) {
          b.onResolve({ filter: /\/context\/data$/ }, () => ({ path: "checks", namespace: "reader-fixture" }));
          b.onResolve({ filter: /^\.\.\/supabase$/ }, () => ({ path: "sdk", namespace: "reader-fixture" }));
          b.onLoad({ filter: /^checks$/, namespace: "reader-fixture" }, () => ({ loader: "js", contents: "export const contextChecks = [];" }));
          b.onLoad({ filter: /^sdk$/, namespace: "reader-fixture" }, () => ({
            loader: "js",
            contents: `
              const ok={data:[],error:null};
              export const supabase={
                auth:{getSession:async()=>({data:{session:null},error:null}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},
                from(){const q={select(){return q},eq(){return q},order(){return q},maybeSingle:async()=>({data:null,error:null}),then(done,fail){return Promise.resolve(ok).then(done,fail)}};return q;},
                rpc:()=>Promise.resolve({data:[],error:null})
              };
            `,
          }));
        },
      },
    ],
  });
  const js = result.outputFiles.find((f) => f.path.endsWith(".js"))?.text ?? result.outputFiles[0].text;
  const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
  const ctx = await open(browser);
  try {
    const { page } = ctx;
    await page.route(base + "/bible/romans/8?tab=community", (route) =>
      route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en" data-look="cover" data-mode="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' + css + '</style></head><body><div id="root"></div><script>' + js + "</script></body></html>" }),
    );
    await page.goto(base + "/bible/romans/8?tab=community");
    const sheet = page.getByRole("dialog", { name: "Around Romans 8" });
    await sheet.waitFor();
    await sheet.locator('article[data-layer="voices"]').waitFor();
    assert.equal(await sheet.getByRole("button", { name: "Back to Around Romans 8", exact: true }).count(), 1);
    assert.deepEqual(ctx.problems.filter((p) => !/Failed to load resource/.test(p)), []);
  } finally {
    await ctx.context.close();
  }
}
