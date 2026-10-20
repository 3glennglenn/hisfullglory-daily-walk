import assert from "node:assert/strict";
import { refLabel, spineHeight } from "../src/context/checks.ts";
import { STORAGE, open } from "./story.browser.mjs";

// Your shelf in a real browser (plan 07, UI-SPEC A9, 12). Every case runs in a fresh context; the checks come from
// the content folder at run time (`published`, newest first), never a hard-coded slug.
const monthDay = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric" });
};
const AI_WORDS = "Written by an AI model. Not checked by a person.";

/** Writes a shelf into the page's private storage (the caller reloads or navigates). */
async function seedShelf(page, shelf) {
  await page.evaluate(
    ({ key, shelf }) => {
      const state = JSON.parse(localStorage.getItem(key));
      state.shelf = shelf;
      localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE, shelf },
  );
}

/** Up to nine real published checks, the AI-written ones first when there are any, each finished on its own March day. */
function pickNine(published) {
  const ai = published.filter((c) => c.review === "ai-unreviewed");
  const rest = published.filter((c) => c.review !== "ai-unreviewed");
  return [...ai.slice(0, 2), ...rest].slice(0, 9).map((check, i) => ({
    check,
    entry: { slug: check.slug, finishedOn: `2026-03-${String(i + 1).padStart(2, "0")}` },
  }));
}

export async function checkShelfScreen(browser, base, published) {
  const nine = pickNine(published);
  const aiCount = nine.filter(({ check }) => check.review === "ai-unreviewed").length;

  for (const width of [390, 320]) {
    const { context, page, problems } = await open(browser, base, "/", { width, height: 844 });
    try {
      await seedShelf(
        page,
        nine.map((n) => n.entry),
      );
      await page.goto(base + "/shelf");
      await page.locator("main h1").waitFor();
      const where = " at " + width + "px";
      assert.equal(await page.locator("main h1").innerText(), "Your shelf");
      assert.equal(await page.locator(".shelf-count").innerText(), `${nine.length} context checks read. Your shelf only grows.`);
      assert.equal(await page.getByRole("button", { name: "Back to Today", exact: true }).count(), 1, "opened directly, Back names Today");

      const links = page.locator('ul[aria-label="Your shelf"] a');
      assert.equal(await links.count(), nine.length, "one link per finished check" + where);
      for (let i = 0; i < nine.length; i++) {
        const { check, entry } = nine[i];
        const ai = check.review === "ai-unreviewed";
        assert.equal(
          await links.nth(i).getAttribute("aria-label"),
          `${refLabel(check.verse)}, read ${monthDay(entry.finishedOn)}${ai ? ", written by an AI model, not checked by a person" : ""}`,
          "accessible name of spine " + (i + 1),
        );
        assert.equal(await links.nth(i).getAttribute("href"), "/context/" + check.slug);
        assert.equal(await links.nth(i).locator(".ai-badge").count(), ai ? 1 : 0, "the AI badge is on AI-written spines only");
        if (ai) assert.equal(await links.nth(i).locator(".ai-badge").innerText(), "AI");
        // Height from the slug, 128 to 160 in steps of 8, 44px wide.
        const box = await links.nth(i).boundingBox();
        assert.equal(Math.round(box.width), 44, "44px wide" + where);
        assert.equal(Math.round(box.height), spineHeight(check.slug), "height follows the slug" + where);
        // The reference stands inside the spine, above the badge, and is not clipped.
        const fits = await links.nth(i).evaluate((a) => {
          const ref = a.querySelector(".spine-ref").getBoundingClientRect();
          const spine = a.getBoundingClientRect();
          const badge = a.querySelector(".ai-badge")?.getBoundingClientRect();
          return {
            inside: ref.top >= spine.top - 0.5 && ref.bottom <= spine.bottom + 0.5 && ref.left >= spine.left - 0.5 && ref.right <= spine.right + 0.5,
            aboveBadge: badge ? ref.bottom <= badge.top : true,
            badgeInside: badge ? badge.bottom <= spine.bottom - 3.5 && Math.round(badge.height) === 20 : true,
          };
        });
        assert.deepEqual(fits, { inside: true, aboveBadge: true, badgeInside: true }, `the reference of ${check.slug} fits its spine${where}`);
      }
      // Oldest to newest from the left, touching, boards of at most 7 (6 at 320px).
      const rects = await links.evaluateAll((list) =>
        list.map((a) => {
          const r = a.getBoundingClientRect();
          return { left: r.left, right: r.right };
        }),
      );
      const rows = [];
      for (const r of rects) {
        if (rows.length && r.left > rows.at(-1).at(-1).left) rows.at(-1).push(r);
        else rows.push([r]);
      }
      const perBoard = width === 390 ? 7 : 6;
      assert.ok(rows.every((row) => row.length <= perBoard), `at most ${perBoard} spines on a board${where}: ${rows.map((r) => r.length)}`);
      assert.equal(rows[0].length, Math.min(perBoard, nine.length), "the first board is full" + where);
      for (const row of rows) for (let i = 1; i < row.length; i++) assert.ok(Math.abs(row[i].left - row[i - 1].right) < 0.6, "no gap between spines" + where);
      assert.equal(await page.locator(".spine-ai .ai-badge").count(), aiCount);
      if (aiCount) assert.equal(await page.locator(".shelf-legend").innerText(), "AI\n" + AI_WORDS, "the legend");
      assert.equal(await page.locator(".shelf-tomorrow-line").innerText(), "There is room for tomorrow.");
      const tomorrow = page.locator(".shelf-tomorrow");
      assert.equal(await tomorrow.getAttribute("aria-hidden"), "true");
      assert.equal(await tomorrow.innerText(), "Tomorrow", "the place names no verse");
      assert.equal(await tomorrow.locator(".spine").evaluate((el) => getComputedStyle(el).borderTopStyle), "dashed");
      assert.equal(await page.getByRole("link", { name: "All context checks", exact: true }).getAttribute("href"), "/context");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll" + where);
      assert.deepEqual(problems, [], "no page or console errors");
    } finally {
      await context.close();
    }
  }

  // A shelf entry whose check is no longer published keeps its spine, and opens the list with a line saying so.
  {
    const { context, page, problems } = await open(browser, base, "/");
    try {
      await seedShelf(page, [{ slug: "gone-1-1", finishedOn: "2026-03-05" }, nine[0].entry]);
      await page.goto(base + "/shelf");
      await page.locator("main h1").waitFor();
      const gone = page.locator('ul[aria-label="Your shelf"] a').first();
      assert.equal(await gone.getAttribute("aria-label"), "Gone 1:1, read March 5, no longer published");
      assert.equal(await gone.getAttribute("href"), "/context?unpublished=1");
      assert.equal(await page.locator(".shelf-count").innerText(), "2 context checks read. Your shelf only grows.");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }

  // Empty: the empty state, the board with only tomorrow's place, and a button to today's story.
  {
    const { context, page, problems } = await open(browser, base, "/shelf");
    try {
      assert.equal(await page.getByRole("heading", { name: "Your shelf is empty for now", exact: true }).count(), 1);
      assert.equal(await page.getByText("Every context check you read to the end stays here. Your shelf only grows.", { exact: true }).count(), 1);
      assert.equal(await page.locator('ul[aria-label="Your shelf"] a').count(), 0);
      assert.equal(await page.locator(".shelf-tomorrow").count(), 1, "the board shows only tomorrow's place");
      assert.equal(await page.locator(".shelf-count").count(), 0);
      const filled = await page
        .locator("main button")
        .evaluateAll((list) => list.filter((b) => getComputedStyle(b).backgroundColor !== "rgba(0, 0, 0, 0)").map((b) => b.textContent));
      assert.deepEqual(filled, ["Read today's story"], "one filled button");
      await page.getByRole("button", { name: "Read today's story", exact: true }).click();
      await page.waitForURL("**/context/" + published[0].slug);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }

  // Large text: the spines become a plain list with the same links, the date and the AI words in text.
  {
    const { context, page, problems } = await open(browser, base, "/", { width: 390, height: 844 });
    try {
      await seedShelf(
        page,
        nine.map((n) => n.entry),
      );
      await page.goto(base + "/shelf");
      await page.locator("main h1").waitFor();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "34px";
        window.dispatchEvent(new Event("resize"));
      });
      await page.waitForFunction(() => document.documentElement.dataset.text === "large");
      const links = page.locator('ul[aria-label="Your shelf"] a');
      assert.equal(await links.count(), nine.length, "the same links");
      assert.equal(await page.locator(".shelf-tomorrow").evaluate((el) => getComputedStyle(el).display), "none");
      for (let i = 0; i < nine.length; i++) {
        const { check, entry } = nine[i];
        const ai = check.review === "ai-unreviewed";
        const row = links.nth(i);
        assert.equal(await row.locator(".spine-ref").innerText(), refLabel(check.verse));
        assert.equal(await row.locator(".spine-date").innerText(), "Read " + monthDay(entry.finishedOn));
        assert.equal(await row.locator(".spine-ref").evaluate((el) => getComputedStyle(el).writingMode), "horizontal-tb", "text runs across in the list");
        if (ai) assert.equal(await row.locator(".spine-ai").innerText(), "AI\n" + AI_WORDS, "the AI line in text");
        assert.ok((await row.boundingBox()).height >= 52, "rows are at least 52px");
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll at 200 % text");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }

  // Under 320px the spines are a plain list too, with the same links and no sideways scroll.
  {
    const { context, page, problems } = await open(browser, base, "/", { width: 300, height: 700 });
    try {
      await seedShelf(
        page,
        nine.map((n) => n.entry),
      );
      await page.goto(base + "/shelf");
      await page.locator("main h1").waitFor();
      const links = page.locator('ul[aria-label="Your shelf"] a');
      assert.equal(await links.count(), nine.length, "the same links at 300px");
      for (let i = 0; i < nine.length; i++) {
        assert.equal(await links.nth(i).locator(".spine-ref").evaluate((el) => getComputedStyle(el).writingMode), "horizontal-tb");
        assert.equal(await links.nth(i).locator(".spine-date").innerText(), "Read " + monthDay(nine[i].entry.finishedOn));
        assert.equal(Math.round((await links.nth(i).evaluate((el) => parseFloat(getComputedStyle(el).height)))) >= 52, true, "a list row, not a spine");
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll at 300px");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }

  // Where the shelf is opened from decides what Back says; You has the row with the count.
  {
    const { context, page, problems } = await open(browser, base, "/", { width: 390, height: 844 });
    try {
      await seedShelf(
        page,
        nine.map((n) => n.entry),
      );
      await page.goto(base + "/");
      await page.locator("main h1").waitFor();
      await page.locator('.today a[href="/shelf"]').click();
      await page.waitForURL("**/shelf");
      assert.equal(await page.getByRole("button", { name: "Back to Today", exact: true }).count(), 1, "from Today, Back names Today");
      await page.getByRole("button", { name: "Back to Today", exact: true }).click();
      await page.waitForURL(base + "/");
      await page.goto(base + "/you");
      await page.locator("main h1").waitFor();
      const row = page.locator('a[href="/shelf"]');
      assert.equal(await row.locator(".list-row-title").innerText(), "Your shelf");
      assert.equal(await row.locator(".list-row-value").innerText(), `${nine.length} read`);
      await row.click();
      await page.waitForURL("**/shelf");
      assert.equal(await page.getByRole("button", { name: "Back to You", exact: true }).count(), 1, "from You, Back names You");
      await page.reload();
      await page.locator("main h1").waitFor();
      assert.equal(await page.getByRole("button", { name: "Back to You", exact: true }).count(), 1, "after a reload too");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }
}
