import assert from "node:assert/strict";
import { build } from "esbuild";
import { aiUnreviewedCardLabel, refLabel } from "../src/context/checks.ts";
import { STORAGE, colour, localToday, open, readState } from "./story.browser.mjs";

// Today's walk in a real browser (plan 08, UI-SPEC A5, A6, D-11): resuming a step, the walk finish and what it must
// and must not say, the old stored step, text at 200 %. Every case runs in a fresh context. Today's passage and
// tomorrow's are read from the app's own list of daily passages (src/data.ts) by the same day-number rule, and the
// context check that should be offered comes from the content folder at run time (`published`).
const dailyList = await (async () => {
  // The app's own list, bundled from src/data.ts (esbuild strips the types), so the test cannot drift from it.
  const bundle = await build({ entryPoints: ["src/data.ts"], bundle: true, format: "esm", platform: "node", write: false });
  const module = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));
  return module.daily.map((d) => ({ reference: d.reference, quote: d.quote }));
})();
const dayNumber = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};
const passageFor = (iso, offset = 0) => dailyList[(((dayNumber(iso) + offset) % dailyList.length) + dailyList.length) % dailyList.length];

const GUILT = /missed|streak|broken|\blost\b|\bbehind\b|in a row/i;

/** Writes parts of the private state, then reloads. "TODAY" stands for the page's local date. */
async function seed(page, wanted) {
  await page.evaluate(
    ({ key, wanted }) => {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const swap = (value) => (value === "TODAY" ? today : value);
      const state = JSON.parse(localStorage.getItem(key));
      if (wanted.shelf) state.shelf = wanted.shelf.map((e) => ({ slug: e.slug, finishedOn: swap(e.finishedOn) }));
      if (wanted.completedDates) state.local.completedDates = wanted.completedDates.map(swap).sort();
      if (wanted.walkStep !== undefined) state.walkStep = { ...state.walkStep, [today]: wanted.walkStep };
      if (wanted.notifications) state.notifications = { ...state.notifications, ...wanted.notifications };
      localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE, wanted },
  );
  await page.reload();
  await page.locator("main h1").first().waitFor();
}

const filledButtons = async (page) => {
  const fill = await colour(page, "--button");
  return page
    .locator("main button")
    .evaluateAll((list, fill) => list.filter((b) => getComputedStyle(b).backgroundColor === fill && b.closest(".toolbar") === null).map((b) => b.textContent), fill);
};

/** From the first step to the Prayer step, optionally writing the reflection on the Journal step. */
async function toPrayer(page, reflection) {
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^Continue to / }).click();
  await page.getByRole("button", { name: "Continue to Journal" }).click();
  if (reflection) await page.locator("#journal").fill(reflection);
  await page.getByRole("button", { name: "Continue to Prayer" }).click();
}

export async function checkWalkFinish(browser, base, published) {
  // ---- the first finished walk: every row of A6 -----------------------------------------------------------------------
  {
    const { context, page, problems } = await open(browser, base, "/walk");
    try {
      const date = await localToday(page);
      const today = passageFor(date);
      const tomorrow = passageFor(date, 1);
      assert.equal(await page.locator("blockquote").innerText(), today.quote, "step 1 shows today's verse");
      const requests = [];
      page.on("request", (r) => requests.push(r.url() + " " + (r.postData() ?? "")));
      await toPrayer(page, "A private reflection that must never leave this device.");
      await page.getByRole("button", { name: "Finish today's walk", exact: true }).click();
      await page.getByRole("heading", { name: "Walk complete", exact: true }).waitFor();

      // The frame: the toolbar, no tab bar, the display title, the verse in italic Scripture and its reference.
      assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).count(), 0, "the tab bar stays covered");
      assert.equal(await page.locator("main h1").innerText(), "Today's walk");
      assert.equal(await page.getByRole("button", { name: "Back to Today", exact: true }).count(), 2, "the toolbar's and the filled one");
      assert.equal(Math.round(await page.locator(".walk-complete").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))), 28, "Display 28");
      assert.equal(await page.locator(".walk-finish-verse").innerText(), today.quote);
      assert.equal(await page.locator(".walk-finish-verse").evaluate((el) => getComputedStyle(el).fontStyle), "italic");
      assert.equal(await page.locator(".walk-finish-ref").innerText(), today.reference);
      assert.equal(await page.locator(".walk-finish-ref").evaluate((el) => getComputedStyle(el).fontWeight), "600");

      // The one list: days walked, tomorrow, today's context check, the reminder.
      const rows = page.locator(".group-list > li");
      const first = rows.nth(0);
      assert.equal(await first.locator(".row-with-icon").innerText(), "1 day walked", "one day is singular");
      assert.equal(await first.locator(".row-success").getAttribute("aria-hidden"), "true");
      assert.equal(await first.locator(".row-detail-body").innerText(), "A day away is an invitation to begin again. There is no penalty.");
      assert.equal(await first.locator(".row-detail-body").evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), 17, "the sentence is Body 17");
      assert.equal(await rows.nth(1).locator(".list-row-title").innerText(), "Tomorrow: " + tomorrow.reference);
      assert.equal(await rows.nth(1).locator(".list-row-detail").innerText(), "Ready in the morning");
      const check = published[0];
      const checkRow = page.locator('.group-list a[href="/context/' + check.slug + '"]');
      assert.equal(await checkRow.count(), 1, "today's context check is offered while unread");
      assert.equal(await checkRow.locator(".list-row-title").innerText(), "Today's context check");
      assert.match(await checkRow.locator(".list-row-detail").innerText(), new RegExp("^" + refLabel(check.verse).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(await checkRow.locator(".row-ai").count(), check.review === "ai-unreviewed" ? 1 : 0, "the AI line on an AI-written check only");
      if (check.review === "ai-unreviewed") assert.equal(await checkRow.locator(".row-ai").innerText(), "AI\n" + aiUnreviewedCardLabel);
      const reminder = page.locator('.group-list a[href="/settings/reminders"]');
      assert.equal(await reminder.locator(".list-row-title").innerText(), "Daily reminder");
      assert.equal(await reminder.locator(".list-row-value").innerText(), "Off", "reminders are off until the reader turns them on");
      // The rhythm questions are asked once, on the first open of the app (tests/welcome.browser.mjs), not after the first walk.
      assert.equal(await page.getByText("Choose your daily rhythm").count(), 0, "no rhythm row after the first walk");
      assert.equal(await rows.count(), 4);
      assert.deepEqual(await filledButtons(page), ["Back to Today"], "one filled button");

      // No guilt, no streak, no motion.
      assert.doesNotMatch(await page.locator("main").innerText(), GUILT, "no word of missing, losing or a streak");
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0, "nothing animates on the finish screen");
      // The reflection stayed on this device.
      assert.deepEqual(
        requests.filter((r) => r.includes("private reflection") || r.includes("private%20reflection")),
        [],
        "no request carries the private reflection",
      );
      const state = await readState(page);
      assert.equal(state.local.completedDates.length, 1);
      assert.ok(state.entries.some((e) => e.body.includes("must never leave")));
      assert.equal(state.walkStep[date], 6, "the finish screen is stored as step 6");

      await page.getByRole("button", { name: "Back to Today", exact: true }).last().click();
      await page.waitForURL(base + "/");
      await page.locator(".today").waitFor();
      assert.equal(await page.locator('.today a[href="/walk"] .list-row-title').innerText(), "Today's walk is complete");
      assert.deepEqual(problems.filter((p) => !/Not saved|QuotaExceeded/.test(p)), [], "no page or console errors");
    } finally {
      await context.close();
    }
  }

  // ---- a second walk, the check already read, reminders turned on: no rhythm row, no check row, "On" ------------------
  {
    const { context, page, problems } = await open(browser, base, "/");
    try {
      await seed(page, {
        completedDates: ["2026-01-01"],
        shelf: published.map((c) => ({ slug: c.slug, finishedOn: "2026-01-02" })),
        notifications: { "Daily Walk": true },
      });
      await page.goto(base + "/walk");
      await page.locator("main h1").waitFor();
      await toPrayer(page);
      await page.getByRole("button", { name: "Finish today's walk", exact: true }).click();
      await page.getByRole("heading", { name: "Walk complete", exact: true }).waitFor();
      assert.equal(await page.locator(".row-with-icon").innerText(), "2 days walked");
      assert.equal(await page.getByText("Choose your daily rhythm").count(), 0, "the rhythm row is gone");
      assert.equal(await page.getByText("Today's context check").count(), 0, "no check row when none is unread");
      assert.equal(await page.locator('.group-list a[href="/settings/reminders"] .list-row-value').innerText(), "On", "On when the reader turned it on");
      assert.equal(await page.locator(".group-list > li").count(), 3);
      assert.doesNotMatch(await page.locator("main").innerText(), GUILT);
      assert.equal((await readState(page)).local.completedDates.length, 2, "the count only grows");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }

  // ---- a gap of days is never mentioned and never subtracted from the count --------------------------------------------
  {
    const { context, page, problems } = await open(browser, base, "/");
    try {
      await seed(page, { completedDates: ["2025-12-01", "2026-02-14", "2026-03-30"] });
      await page.goto(base + "/walk");
      await page.locator("main h1").waitFor();
      await toPrayer(page);
      await page.getByRole("button", { name: "Finish today's walk", exact: true }).click();
      await page.getByRole("heading", { name: "Walk complete", exact: true }).waitFor();
      assert.equal(await page.locator(".row-with-icon").innerText(), "4 days walked", "every completed date counts, with gaps between them");
      assert.doesNotMatch(await page.locator("main").innerText(), GUILT);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }

  // ---- progress stored before this screen existed (T-01.1-28) -----------------------------------------------------------
  {
    const { context, page, problems } = await open(browser, base, "/");
    try {
      // The old Completion step was index 6 and did not finish the day: it lands on Prayer, where the button finishes.
      await seed(page, { walkStep: 6 });
      await page.goto(base + "/walk");
      await page.locator("main h1").waitFor();
      assert.equal(await page.locator(".step-label").innerText(), "Step 6 of 6");
      assert.equal(await page.getByRole("button", { name: "Finish today's walk", exact: true }).count(), 1);
      assert.equal(await page.getByRole("heading", { name: "Walk complete" }).count(), 0, "an unfinished day is not shown as finished");
      assert.equal((await readState(page)).local.completedDates.length, 0, "nothing was completed by opening it");
      // A stored step in the middle resumes there.
      await seed(page, { walkStep: 2 });
      await page.goto(base + "/walk");
      await page.locator("main h1").waitFor();
      assert.equal(await page.locator(".step-label").innerText(), "Step 3 of 6");
      assert.equal(await page.getByRole("heading", { name: "Devotional", exact: true }).count(), 1);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }

  // ---- leaving with "‹ Today" keeps the step; Today says so and leads back --------------------------------------------
  {
    const { context, page, problems } = await open(browser, base, "/walk");
    try {
      for (let i = 0; i < 2; i++) await page.getByRole("button", { name: /^Continue to / }).click();
      assert.equal(await page.locator(".step-label").innerText(), "Step 3 of 6");
      const focused = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent }));
      assert.deepEqual(focused, { tag: "H2", text: "Devotional" }, "focus follows to the new step's title");
      await page.getByRole("button", { name: "Back to Today", exact: true }).click();
      await page.waitForURL(base + "/");
      const row = page.locator('.today a[href="/walk"]');
      assert.equal(await row.locator(".list-row-title").innerText(), "Continue today's walk");
      assert.equal(await row.locator(".list-row-detail").innerText(), "Step 3 of 6");
      await row.click();
      await page.waitForURL("**/walk");
      assert.equal(await page.getByRole("progressbar", { name: "Walk progress" }).getAttribute("aria-valuenow"), "3");
      assert.equal(await page.getByRole("button", { name: "Back to Reflection", exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "Back to Context", exact: true }).count(), 1);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }

  // ---- text at 200 %: the steps and the finish hold on 390 and 320px -------------------------------------------------
  for (const width of [390, 320]) {
    const { context, page, problems } = await open(browser, base, "/walk", { width, height: 700 });
    try {
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "34px";
        window.dispatchEvent(new Event("resize"));
      });
      await page.waitForFunction(() => document.documentElement.dataset.text === "large");
      const where = " at " + width + "px, root 34px";
      const holds = async (what) => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll, " + what + where);
        const box = await page.locator(".flow-actions .flow-button").last().boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width, "the last button is inside the screen, " + what + where);
      };
      await holds("step 1");
      for (let i = 0; i < 4; i++) await page.getByRole("button", { name: /^Continue to / }).click();
      await holds("the Journal step");
      await page.getByRole("button", { name: "Continue to Prayer" }).click();
      await page.getByRole("button", { name: "Finish today's walk", exact: true }).scrollIntoViewIfNeeded();
      await holds("the Prayer step");
      await page.getByRole("button", { name: "Finish today's walk", exact: true }).click();
      await page.getByRole("heading", { name: "Walk complete", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll on the finish screen" + where);
      assert.equal(await page.locator(".walk-complete").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, "the title is not clipped" + where);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }
}
