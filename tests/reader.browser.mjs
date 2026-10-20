import assert from "node:assert/strict";

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
    assert.ok(first.top < 260, `verse 1 is near the top (${Math.round(first.top)}px)`);
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
    assert.ok(first.top < 260, `verse 1 is near the top in Marked too (${Math.round(first.top)}px)`);
    assert.deepEqual(marked.problems, []);
  } finally {
    await marked.context.close();
  }
}
