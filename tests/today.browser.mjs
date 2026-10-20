import { build } from "esbuild";
import assert from "node:assert/strict";
import { aiUnreviewedCardLabel, refLabel } from "../src/context/checks.ts";

// Today in a real browser (UI-SPEC A1): every state, the walk and shelf rows, and what each look draws. The first
// half runs against the built app with a state seeded for each case; the second half renders the real Today screen
// on a list of checks the test supplies, for the cases the live content folder cannot be made to show (no
// published check, an AI-written newest check whatever the folder holds, a broken file).
const TITLE = "Today's context check";

/** The computed colour of a design token, read through a probe element. */
const colour = (page, token) =>
  page.evaluate((name) => {
    const probe = document.createElement("i");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);

const cover = (page) => page.getByRole("region", { name: TITLE, exact: true });
const filledButtons = (page) =>
  page.locator("main button").evaluateAll((list) =>
    list.filter((b) => getComputedStyle(b).backgroundColor !== "rgba(0, 0, 0, 0)").map((b) => b.getAttribute("aria-label") ?? b.textContent),
  );
const walkRow = (page) => page.locator('.today a[href="/walk"]');
const shelfRow = (page) => page.locator('.today a[href="/shelf"]');

/** Writes a state into the page's private storage and reloads. "TODAY" stands for the page's own local date. */
async function seed(page, wanted) {
  await page.evaluate((wanted) => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const swap = (value) => (value === "TODAY" ? today : value);
    const state = JSON.parse(localStorage.getItem("hfg-daily-walk:v3"));
    if (wanted.shelf) state.shelf = wanted.shelf.map((e) => ({ slug: e.slug, finishedOn: swap(e.finishedOn) }));
    if (wanted.completedDates) state.local.completedDates = wanted.completedDates.map(swap).sort();
    if (wanted.walkStep !== undefined) state.walkStep = { ...state.walkStep, [today]: wanted.walkStep };
    localStorage.setItem("hfg-daily-walk:v3", JSON.stringify(state));
  }, wanted);
  await page.reload();
  await page.locator("main h1").waitFor();
}

async function openLive(browser, base, { look, lamplight, width = 390, height = 844, wanted } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, timezoneId: "Europe/Amsterdam", colorScheme: "light" });
  if (look) await context.addInitScript((v) => localStorage.setItem("hfg-look", v), look);
  if (lamplight) await context.addInitScript((v) => localStorage.setItem("hfg-lamplight", v), lamplight);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(m.text());
  });
  await page.goto(base + "/");
  await page.locator("main h1").waitFor();
  if (wanted) await seed(page, wanted);
  return { context, page, problems };
}

/** One Today in a fresh context, closed afterwards; the page's own errors must stay empty. */
async function withToday(browser, base, options, fn) {
  const { context, page, problems } = await openLive(browser, base, options);
  try {
    await fn(page);
    assert.deepEqual(problems, [], "no page or console errors");
  } finally {
    await context.close();
  }
}

export async function checkToday(browser, base, published) {
  const newest = published[0];
  assert.ok(newest, "at least one context check is published");
  const ref = refLabel(newest.verse);

  // ---- the states of the block -------------------------------------------------------------------------------
  await withToday(browser, base, { wanted: { shelf: [{ slug: newest.slug, finishedOn: "TODAY" }] } }, async (page) => {
    const block = cover(page);
    assert.equal(await block.locator(".cover-ref").innerText(), ref, "a check finished today stays Today's");
    const status = block.locator(".cover-status");
    assert.equal(await status.innerText(), "On your shelf");
    assert.equal(await status.locator("svg").getAttribute("aria-hidden"), "true", "the check icon is decoration");
    assert.equal(await status.locator("svg").evaluate((el) => getComputedStyle(el).color), await colour(page, "--gilt"), "the check icon is --gilt on the leather");
    assert.notEqual(await status.locator("svg").evaluate((el) => getComputedStyle(el).color), await colour(page, "--success"), "never --success on the leather (1.40:1)");
    assert.equal(await status.evaluate((el) => getComputedStyle(el).color), await colour(page, "--sig-muted"), "the text is --sig-muted");
    const button = block.getByRole("button");
    assert.equal(await button.innerText(), "Read it again");
    assert.equal(await button.getAttribute("aria-label"), "Read it again: " + ref);
    assert.deepEqual(await filledButtons(page), [], "Read it again is the secondary style: no filled button");
    assert.match(await shelfRow(page).innerText(), /1 context check read/);
    assert.equal(await shelfRow(page).locator(".row-ai").count(), newest.review === "ai-unreviewed" ? 1 : 0);
  });

  await withToday(
    browser,
    base,
    { wanted: { shelf: published.map((c, i) => ({ slug: c.slug, finishedOn: i === 0 ? "2026-03-04" : "2026-01-02" })) } },
    async (page) => {
      const block = cover(page);
      assert.equal(await block.locator(".cover-ref").innerText(), ref, "every check finished earlier: the newest in its finished state");
      assert.equal(await block.locator(".cover-status").innerText(), "On your shelf since March 4");
      assert.equal(await block.getByRole("button").innerText(), "Read it again");
      assert.match(await shelfRow(page).innerText(), new RegExp(`${published.length} context checks? read`));
    },
  );

  // ---- Today's walk and Your shelf ---------------------------------------------------------------------------
  await withToday(browser, base, {}, async (page) => {
    assert.equal(await walkRow(page).locator(".list-row-title").innerText(), "Today's walk");
    assert.match(await walkRow(page).locator(".list-row-detail").innerText(), /^[A-Z][A-Za-z ]+ \d+:\d+\. Read, reflect and pray, 5 minutes\.$/);
    assert.equal(await shelfRow(page).locator(".list-row-title").innerText(), "Your shelf");
    assert.equal(await shelfRow(page).locator(".list-row-detail").innerText(), "Nothing on it yet");
    assert.equal(await page.locator(".mini-spine").count(), 0, "an empty shelf draws no spines");
    assert.equal(await page.locator(".row-ai").count(), 0, "no AI line on an empty shelf");
    // The sponsor slot is built and empty (D-13): not an element, not a word, at the end of Today.
    assert.equal(await page.locator('[data-slot="sponsor"]').count(), 0, "no sponsor slot on Today");
    assert.equal(await page.locator("main").getByText(/sponsor/i).count(), 0, "no word Sponsor on Today");
    assert.equal(await page.locator("main h2:not(.sr-only)").count(), 0, "no group headings: one quiet list");
    // The block reads as one section named by its hidden heading; the list follows it.
    const order = await page.evaluate(() => {
      const c = document.querySelector(".cover-wrap"), l = document.querySelector(".today .group");
      return !!(c.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.ok(order, "the list is under the block");
  });
  await withToday(browser, base, { wanted: { walkStep: 2 } }, async (page) => {
    assert.equal(await walkRow(page).locator(".list-row-title").innerText(), "Continue today's walk");
    assert.equal(await walkRow(page).locator(".list-row-detail").innerText(), "Step 3 of 6");
  });
  await withToday(browser, base, { wanted: { completedDates: ["2026-10-01", "TODAY"] } }, async (page) => {
    assert.equal(await walkRow(page).locator(".list-row-title").innerText(), "Today's walk is complete");
    assert.match(await walkRow(page).locator(".list-row-detail").innerText(), /^2 days walked\. Tomorrow: [A-Z][A-Za-z ]+ \d+:\d+\.$/);
    const icon = walkRow(page).locator("svg.row-success");
    assert.equal(await icon.getAttribute("aria-hidden"), "true", "the words say it complete; the icon only repeats it");
    assert.equal(await icon.evaluate((el) => getComputedStyle(el).color), await colour(page, "--success"));
  });

  // The shelf row: the count, the mini shelf, and the AI line whenever the shelf holds an AI-written check.
  const ai = published.find((c) => c.review === "ai-unreviewed");
  const approved = published.filter((c) => c.review === "approved");
  await withToday(
    browser,
    base,
    { wanted: { shelf: [approved[0], approved[1], ...(ai ? [ai] : [approved[2]])].map((c, i) => ({ slug: c.slug, finishedOn: "2026-01-0" + (i + 2) })) } },
    async (page) => {
      const row = shelfRow(page);
      assert.match(await row.locator(".list-row-detail .row-line").first().innerText(), /^3 context checks read$/);
      const mini = row.locator(".mini-shelf");
      assert.equal(await mini.getAttribute("aria-hidden"), "true", "the mini shelf is a picture");
      const spines = mini.locator(".mini-spine");
      assert.equal(await spines.count(), 3);
      for (const box of await spines.evaluateAll((list) => list.map((s) => ({ w: s.getBoundingClientRect().width, h: s.getBoundingClientRect().height })))) {
        assert.equal(box.w, 8, "spines are 8px wide");
        assert.ok(box.h >= 24 && box.h <= 40, "spines are 24 to 40px tall");
      }
      if (ai) {
        assert.equal(await row.locator(".row-ai").innerText(), "AI\n1 with context written by AI.");
        assert.equal(await row.locator(".row-ai").evaluate((el) => getComputedStyle(el).color), await colour(page, "--ai"));
        // Newest on the right: the AI spine, finished last, is the last one, filled --ai.
        assert.equal(await spines.last().evaluate((el) => getComputedStyle(el).backgroundColor), await colour(page, "--ai"));
        assert.notEqual(await spines.first().evaluate((el) => getComputedStyle(el).backgroundColor), await colour(page, "--ai"));
        assert.match(await row.innerText(), /with context written by AI/, "the words carry the label, not the colour");
      } else assert.equal(await row.locator(".row-ai").count(), 0);
    },
  );
  // More than twelve: the twelve newest stand on the mini shelf, the count says all.
  await withToday(
    browser,
    base,
    { wanted: { shelf: Array.from({ length: 13 }, (_, i) => ({ slug: "check-" + (i + 1), finishedOn: "2026-01-02" })) } },
    async (page) => {
      assert.match(await shelfRow(page).locator(".row-line").first().innerText(), /^13 context checks read$/);
      assert.equal(await page.locator(".mini-spine").count(), 12);
    },
  );

  // ---- what each look draws ----------------------------------------------------------------------------------
  await withToday(browser, base, {}, async (page) => {
    const block = page.locator(".cover");
    assert.equal(await page.locator(".cover-orn").count(), 4, "four corner ornaments");
    for (const hidden of await page.locator(".cover-orn").evaluateAll((list) => list.map((el) => el.getAttribute("aria-hidden")))) assert.equal(hidden, "true");
    const masks = await page.locator(".cover-orn").evaluateAll((list) => list.map((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage));
    for (const mask of masks) assert.match(mask, /url\(/, "the ornament is the drawn svg");
    assert.equal(await page.locator(".cover-orn").first().evaluate((el) => getComputedStyle(el).backgroundColor), await colour(page, "--gilt"), "ornaments in --gilt");
    const corners = await page.evaluate(() => {
      const c = document.querySelector(".cover").getBoundingClientRect();
      const o = (name) => document.querySelector(".cover-orn-" + name).getBoundingClientRect();
      return {
        tl: [o("tl").left - c.left, o("tl").top - c.top],
        tr: [c.right - o("tr").right, o("tr").top - c.top],
        br: [c.right - o("br").right, c.bottom - o("br").bottom],
        bl: [o("bl").left - c.left, c.bottom - o("bl").bottom],
        size: [o("tl").width, o("tl").height],
      };
    });
    assert.deepEqual(corners, { tl: [12, 12], tr: [12, 12], br: [12, 12], bl: [12, 12], size: [16, 16] }, "12px from each corner");
    const rule = await block.evaluate((el) => {
      const s = getComputedStyle(el, "::before");
      return { content: s.content, top: s.top, left: s.left, width: s.borderTopWidth, colour: s.borderTopColor, radius: s.borderTopLeftRadius };
    });
    assert.deepEqual(rule, { content: '""', top: "8px", left: "8px", width: "1px", colour: await colour(page, "--gilt"), radius: "20px" }, "a gilt rule 8px inside, radius 20");
    const leather = await block.evaluate((el) => ({ radius: getComputedStyle(el).borderTopLeftRadius, padding: getComputedStyle(el).paddingTop, background: getComputedStyle(el).backgroundColor }));
    assert.deepEqual(leather, { radius: "28px", padding: "24px", background: await colour(page, "--sig") });
    assert.equal(await page.locator(".cover-ribbon").evaluate((el) => getComputedStyle(el).display), "none", "no ribbon on the Cover look");
    assert.equal(await block.evaluate((el) => getComputedStyle(el).backgroundImage), "none", "no glow on the leather itself");
  });

  await withToday(browser, base, { look: "marked", wanted: { shelf: [{ slug: newest.slug, finishedOn: "TODAY" }] } }, async (page) => {
    const ribbon = page.locator(".cover-ribbon");
    assert.equal(await ribbon.count(), 1);
    assert.equal(await ribbon.getAttribute("aria-hidden"), "true");
    const style = await ribbon.evaluate((el) => ({ display: getComputedStyle(el).display, width: getComputedStyle(el).width, background: getComputedStyle(el).backgroundColor, clip: getComputedStyle(el).clipPath }));
    assert.equal(style.display, "block");
    assert.equal(style.width, "10px");
    assert.equal(style.background, await colour(page, "--brand"), "the ribbon is --brand");
    assert.match(style.clip, /polygon/, "a forked tail");
    const geometry = await page.evaluate(() => {
      const r = document.querySelector(".cover-ribbon").getBoundingClientRect();
      const ref = document.querySelector(".cover-ref").getBoundingClientRect();
      return { fromRight: innerWidth - r.right, top: r.top, bottom: r.bottom, refTop: ref.top, refBottom: ref.bottom };
    });
    assert.ok(Math.abs(geometry.fromRight - 28) <= 1, "28px from the right edge: " + JSON.stringify(geometry));
    assert.ok(geometry.top <= 1, "from the top edge");
    assert.ok(geometry.bottom >= geometry.refTop - 1 && geometry.bottom <= geometry.refBottom + 1, "ends at the reference line: " + JSON.stringify(geometry));
    const block = page.locator(".cover");
    const flat = await block.evaluate((el) => ({ border: getComputedStyle(el).borderTopWidth, radius: getComputedStyle(el).borderTopLeftRadius, padding: getComputedStyle(el).paddingLeft, rule: getComputedStyle(el, "::before").content }));
    assert.deepEqual(flat, { border: "0px", radius: "0px", padding: "0px", rule: "none" }, "no box, no gilt rule on the Marked page");
    assert.equal(await page.locator(".cover-orn").first().evaluate((el) => getComputedStyle(el).display), "none", "no corner ornaments");
    assert.equal(await page.locator(".cover-ref").evaluate((el) => getComputedStyle(el).color), await colour(page, "--link"), "the reference is a --link line");
    assert.equal(await page.locator(".cover-ref").evaluate((el) => getComputedStyle(el).fontWeight), "600");
    assert.equal(await page.locator(".cover-status svg").evaluate((el) => getComputedStyle(el).color), await colour(page, "--success"), "the check icon is --success on the Marked page");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "the ribbon does not widen the page");
  });

  for (const [look, lamplight] of [["cover", "on"], ["marked", "on"]]) {
    await withToday(browser, base, { look, lamplight }, async (page) => {
      assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), "lamplight");
      const glow = await page.locator(".cover-wrap").evaluate((el) => getComputedStyle(el, "::before").backgroundImage);
      assert.match(glow, /radial-gradient/);
      assert.match(glow, /rgba\(240, 201, 135, 0\.17/, look + ": the lamp glow of Lamplight (direction B's 17 %, plan 16)");
      assert.equal(await page.locator(".cover").evaluate((el) => getComputedStyle(el).backgroundImage), "none", "never on the block");
      const behind = await page.evaluate(() => {
        const g = document.querySelector(".cover-wrap").getBoundingClientRect();
        const t = document.querySelector(".today-date").getBoundingClientRect();
        const s = getComputedStyle(document.querySelector(".cover-wrap"), "::before");
        return { top: g.top + parseFloat(s.top), titleBottom: t.bottom };
      });
      assert.ok(behind.top >= behind.titleBottom, "the glow does not reach the date line: " + JSON.stringify(behind));
      assert.equal(await page.locator(".cover-wrap").evaluate((el) => getComputedStyle(el, "::before").pointerEvents), "none");
    });
  }
  await withToday(browser, base, { look: "cover", lamplight: "off" }, async (page) => {
    const glow = await page.locator(".cover-wrap").evaluate((el) => getComputedStyle(el, "::before").backgroundImage);
    assert.match(glow, /rgba\(240, 201, 135, 0\)/, "no glow in Light");
  });
}

// ---- the cases the live folder cannot be made to show --------------------------------------------------------------
const file = (slug, over = {}) => ({
  slug,
  review: "approved",
  approved: "2026-10-14",
  drafted: "ai",
  written: "2026-10-13",
  verse: { book: "john", chapter: 3, start: 16, end: 16 },
  hook: "You know X. But did you know Y?",
  story: "The story.",
  storyStatus: "scripture",
  moment: "The moment.",
  readings: "The readings.",
  point: "The point.",
  voices: [],
  sources: [],
  ...over,
});
const aiFile = (slug, over = {}) => {
  const { approved: _approved, ...rest } = file(slug);
  return { ...rest, review: "ai-unreviewed", model: "Test model", ...over };
};

async function bundleToday() {
  const result = await build({
    entryPoints: ["tests/fixtures/today.tsx"],
    bundle: true,
    write: false,
    outfile: ".tooling/today-fixture.js",
    format: "iife",
    jsx: "automatic",
    loader: { ".svg": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "fixture-context-data",
        setup(b) {
          // The app reads its checks through Vite's import.meta.glob; the fixture reads the test's list instead.
          b.onResolve({ filter: /context[\\/]data$/ }, () => ({ path: "context-data", namespace: "fixture" }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            resolveDir: process.cwd(),
            contents: `import { publishedChecks } from "./src/context/checks.ts";\nexport const contextChecks = publishedChecks(window.todayFixture.files);`,
          }));
        },
      },
    ],
  });
  return {
    js: result.outputFiles.find((f) => f.path.endsWith(".js")).text,
    css: result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "",
  };
}

export async function checkTodayFixture(browser, base) {
  const { js, css } = await bundleToday();
  const open = async (files, wanted) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Amsterdam", colorScheme: "light", serviceWorkers: "block" });
    await context.addInitScript((files) => (window.todayFixture = { files }), files);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const problems = [];
    page.on("pageerror", (e) => problems.push(e.message));
    await page.route(base + "/__today-fixture", (route) =>
      route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><style>' + css + '</style></head><body><div id="root"></div><script>' + js + "</script></body></html>" }),
    );
    await page.goto(base + "/__today-fixture");
    await page.locator("main h1").waitFor();
    if (wanted) await seed(page, wanted);
    return { context, page, problems };
  };

  // No published check: the walk takes the block, and its row leaves the list.
  {
    const { context, page, problems } = await open([file("draft-only", { review: "draft", approved: undefined })]);
    try {
      assert.equal(await page.locator("main h1").innerText(), "Today");
      const block = page.getByRole("region", { name: "Today's walk", exact: true });
      assert.equal(await block.count(), 1);
      assert.match(await block.locator(".cover-ref").innerText(), /^[A-Z][A-Za-z ]+ \d+:\d+$/, "the walk's reference");
      assert.ok((await block.locator(".cover-verse").innerText()).length > 10, "today's verse in Scripture 20");
      assert.equal(await block.locator(".cover-verse").evaluate((el) => Math.round(parseFloat(getComputedStyle(el).fontSize))), 20, "Scripture 20");
      assert.equal(await block.getByRole("button").innerText(), "Begin today's walk");
      assert.deepEqual(await filledButtons(page), ["Begin today's walk"]);
      assert.equal(await walkRow(page).count(), 0, "the walk row leaves the list");
      assert.equal(await shelfRow(page).count(), 1);
      assert.equal(await page.locator(".cover-ai").count(), 0);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }
  // A walk in progress and a finished one, with no published check.
  {
    const { context, page } = await open([], { walkStep: 3 });
    try {
      assert.equal(await page.getByRole("region", { name: "Today's walk", exact: true }).getByRole("button").innerText(), "Continue today's walk");
    } finally {
      await context.close();
    }
  }
  {
    const { context, page } = await open([], { completedDates: ["TODAY"] });
    try {
      const block = page.getByRole("region", { name: "Today's walk", exact: true });
      assert.equal(await block.locator(".cover-status").innerText(), "Today's walk is complete");
      assert.equal(await block.getByRole("button").innerText(), "Revisit today's walk");
    } finally {
      await context.close();
    }
  }

  // An AI-written newest check carries its label whatever the live folder holds, and a file the app cannot read
  // is skipped.
  {
    const files = [
      file("approved-old", { approved: "2026-10-14" }),
      aiFile("ai-newest", { written: "2026-10-19", verse: { book: "psalms", chapter: 23, start: 1, end: 1 }, hook: "You know the Lord is my shepherd. But did you know the psalm was sung in a crowd?" }),
      // The newest by date, but the app cannot read it (no hook): skipped.
      file("broken", { approved: "2026-10-30", hook: undefined }),
      aiFile("no-model", { written: "2026-10-29", model: undefined }),
    ];
    const { context, page, problems } = await open(files);
    try {
      const block = page.getByRole("region", { name: TITLE, exact: true });
      assert.equal(await block.locator(".cover-ref").innerText(), "Psalm 23:1", "the broken newer files are skipped");
      assert.equal(await block.locator(".cover-display").innerText(), "You know the Lord is my shepherd.");
      assert.equal(await block.locator(".cover-body").innerText(), "But did you know the psalm was sung in a crowd?");
      assert.equal(await block.locator(".cover-ai").innerText(), "AI\n" + aiUnreviewedCardLabel);
      assert.equal(await block.locator(".cover-ai").evaluate((el) => getComputedStyle(el).fontSize), "17px");
      assert.equal(await block.getByRole("button").getAttribute("aria-label"), "Read the story: Psalm 23:1");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
    // Finished earlier, the next newest (approved, no label) takes its place; no AI row.
    const next = await open(files, { shelf: [{ slug: "ai-newest", finishedOn: "2026-01-02" }] });
    try {
      const block = next.page.getByRole("region", { name: TITLE, exact: true });
      assert.equal(await block.locator(".cover-ref").innerText(), "John 3:16");
      assert.equal(await block.locator(".cover-ai").count(), 0, "an approved check shows no label row");
      assert.match(await shelfRow(next.page).innerText(), /1 with context written by AI\./, "the shelf row says it");
    } finally {
      await next.context.close();
    }
  }
  console.log("Today fixture checks passed");
}

// ---- Today at twice the text size ------------------------------------------------------------------------------
// The root grows to 34px and a resize tells the app (UI-SPEC 6.3). The longest hook among the published checks is
// found at run time and made Today's by marking every newer check finished on an earlier day.
export async function checkTodayLargeText(browser, base, published) {
  const longest = [...published].sort((a, b) => b.hook.length - a.hook.length)[0];
  const newer = published.slice(0, published.indexOf(longest)).map((c) => ({ slug: c.slug, finishedOn: "2026-01-02" }));
  for (const width of [390, 320]) {
    await withToday(browser, base, { width, height: 640, wanted: { shelf: newer } }, async (page) => {
      assert.equal(await page.locator(".cover-ref").innerText(), refLabel(longest.verse), "the longest hook is Today's");
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "34px";
        window.dispatchEvent(new Event("resize"));
      });
      await page.waitForFunction(() => document.documentElement.dataset.text === "large");
      const where = "at " + width + "px, root 34px";
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll " + where);
      assert.equal(await page.locator(".cover").evaluate((el) => el.scrollWidth === el.clientWidth), true, "the hook is not clipped " + where);
      assert.equal(await page.locator(".cover").evaluate((el) => getComputedStyle(el).paddingTop), "16px", "16px padding in large-text mode " + where);
      const labels = await page.locator(".tab-label").evaluateAll((list) =>
        list.map((l) => ({ text: l.textContent, height: l.getBoundingClientRect().height, line: parseFloat(getComputedStyle(l).lineHeight) })),
      );
      assert.equal(labels.length, 5);
      for (const label of labels) assert.ok(label.height <= label.line * 1.2, label.text + " stays on one line " + where + ": " + JSON.stringify(label));
      // The button can be reached: brought into view, it sits above the tab bar.
      await page.locator(".cover-button").focus();
      await page.waitForTimeout(150);
      const reach = await page.evaluate(() => ({
        button: document.querySelector(".cover-button").getBoundingClientRect().bottom,
        bar: document.querySelector("nav.tabbar").getBoundingClientRect().top,
      }));
      assert.ok(reach.button <= reach.bar, "the cover button is above the tab bar " + where + ": " + JSON.stringify(reach));
      // The page can be scrolled to its end: the last row ends above the bar, too.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(100);
      const end = await page.evaluate(() => ({
        last: [...document.querySelectorAll(".today .list-row")].at(-1).getBoundingClientRect().bottom,
        bar: document.querySelector("nav.tabbar").getBoundingClientRect().top,
      }));
      assert.ok(end.last <= end.bar, "the last row is above the tab bar " + where + ": " + JSON.stringify(end));
    });
  }
}

