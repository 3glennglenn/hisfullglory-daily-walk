import assert from "node:assert/strict";
import { aiUnreviewedCardLabel, checkUrl, editorialNote, refLabel, shareText, splitHook } from "../src/context/checks.ts";
import { STORAGE, colour, open } from "./story.browser.mjs";

/** The text of the filled buttons in main (the fill is the --button colour), apart from the toolbar's. */
const filledButtons = async (page) => {
  const fill = await colour(page, "--button");
  return page
    .locator("main button")
    .evaluateAll((list, fill) => list.filter((b) => getComputedStyle(b).backgroundColor === fill && b.closest(".toolbar") === null).map((b) => b.textContent), fill);
};

// The context checks list, the unavailable state, the shelf moment, the AI line at a story's end and the label on
// the share picture and text (plan 07, task 3; UI-SPEC A7, A8, A16, 7.4, D-06). Every case runs in a fresh context.
// The checks come from the content folder at run time (`published`, newest first); no slug is hard-coded.

/** Clicks Next to the last screen of a story. */
async function toTheEnd(page) {
  const next = page.getByRole("navigation", { name: "Story" }).getByRole("button", { name: /^Next: / });
  while ((await next.count()) > 0) await next.click();
}

export async function checkContextList(browser, base, published) {
  // ---- the list: every published check, newest first -----------------------------------------------------------------
  {
    const { context, page, problems } = await open(browser, base, "/context");
    try {
      assert.equal(await page.locator("main h1").innerText(), "Context checks");
      assert.equal(await page.getByRole("button", { name: "Back to Today", exact: true }).count(), 1, "opened directly, Back names Today");
      const rows = page.locator(".group-list > li > a");
      assert.equal(await rows.count(), published.length, "every published check is listed");
      for (let i = 0; i < published.length; i++) {
        const check = published[i];
        const row = rows.nth(i);
        assert.equal(await row.getAttribute("href"), "/context/" + check.slug, "newest first: row " + (i + 1));
        assert.equal(await row.locator(".list-row-title").evaluate((el) => el.firstChild.textContent), refLabel(check.verse));
        assert.equal(await row.locator(".check-row-hook").innerText(), splitHook(check.hook).first, "the hook's first sentence, whole");
        const ai = check.review === "ai-unreviewed";
        assert.equal(await row.locator(".check-row-ai").count(), ai ? 1 : 0, "the AI line on AI-written checks only");
        if (ai) assert.equal(await row.locator(".check-row-ai").innerText(), "AI\n" + aiUnreviewedCardLabel);
        assert.equal(await row.locator(".check-row-done").count(), 0, "nothing is marked on an empty shelf");
      }
      assert.equal(await page.getByText("no longer published").count(), 0, "no stray notice");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll");
      await rows.first().click();
      await page.waitForURL("**/context/" + published[0].slug);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }

  // ---- a finished check carries a mark and the hidden words; the unpublished line --------------------------------------
  {
    const { context, page, problems } = await open(browser, base, "/");
    try {
      await page.evaluate(
        ({ key, slug }) => {
          const state = JSON.parse(localStorage.getItem(key));
          state.shelf = [{ slug, finishedOn: "2026-03-02" }];
          localStorage.setItem(key, JSON.stringify(state));
        },
        { key: STORAGE, slug: published.at(-1).slug },
      );
      await page.goto(base + "/context?unpublished=1");
      await page.locator("main h1").waitFor();
      assert.equal(await page.getByText("This context check is no longer published.", { exact: true }).count(), 1);
      const rows = page.locator(".group-list > li > a");
      for (let i = 0; i < published.length; i++) {
        const done = i === published.length - 1;
        const row = rows.nth(i);
        assert.equal(await row.locator(".check-row-done").count(), done ? 1 : 0, "the mark is on the finished check only");
        if (done) {
          assert.equal(await row.locator(".check-row-done").getAttribute("aria-hidden"), "true");
          assert.equal(await row.locator(".sr-only").textContent(), "On your shelf");
        } else assert.equal(await row.locator(".sr-only").count(), 0);
      }
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }

  // ---- a slug that names no published check: the unavailable state with two ways on -----------------------------------
  {
    const { context, page, problems } = await open(browser, base, "/context/no-such-check");
    try {
      assert.equal(await page.locator("main h1").innerText(), "Context check not available");
      assert.equal(await page.getByText("This context check is not available. It may have been taken down.", { exact: true }).count(), 1);
      assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).count(), 1, "an error state keeps the tab bar");
      assert.deepEqual(await filledButtons(page), ["Read today's story"], "Read today's story is the one filled button");
      await page.getByRole("button", { name: "See all context checks", exact: true }).click();
      await page.waitForURL("**/context");
      assert.equal(await page.locator("main h1").innerText(), "Context checks");
      await page.goBack();
      await page.getByRole("button", { name: "Read today's story", exact: true }).click();
      await page.waitForURL("**/context/" + published[0].slug);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }
}

export async function checkStoryEnd(browser, base, published) {
  const ai = published.find((c) => c.review === "ai-unreviewed");
  const approved = published.find((c) => c.review === "approved");
  assert.ok(ai || approved, "at least one published check");

  for (const check of [ai, approved].filter(Boolean)) {
    const isAi = check.review === "ai-unreviewed";
    const { context, page, problems } = await open(browser, base, "/");
    try {
      // The page records what it draws and shares, and every animation that starts.
      await page.evaluate(() => {
        window.__drawn = [];
        window.__anims = [];
        window.__shared = null;
        const fill = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
          window.__drawn.push(String(text));
          return fill.call(this, text, ...rest);
        };
        navigator.canShare = () => true;
        navigator.share = async (data) => {
          window.__shared = { text: data.text, files: (data.files ?? []).length };
        };
        document.addEventListener(
          "animationstart",
          (e) => {
            const style = getComputedStyle(e.target);
            window.__anims.push({ name: e.animationName, duration: style.animationDuration, timing: style.animationTimingFunction });
          },
          true,
        );
      });
      // Opening the story is an in-app move, so the recorders above stay.
      await page.evaluate((path) => {
        history.pushState({ from: "/" }, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, "/context/" + check.slug);
      await page.locator("main h1").filter({ hasText: refLabel(check.verse) }).waitFor();
      const requests = [];
      page.on("request", (r) => requests.push(r.url()));
      await toTheEnd(page);
      await page.getByRole("heading", { name: "Added to your shelf", exact: true }).waitFor();
      const label = isAi ? "an AI-written check" : "an approved check";

      // The moment: the mini shelf, the new spine at full size with its badge when AI-written, the one animation.
      const moment = page.locator(".shelf-moment");
      assert.equal(await moment.locator(".mini-shelf").getAttribute("aria-hidden"), "true", "the mini shelf is a picture");
      const spine = moment.locator(".spine");
      assert.equal(Math.round((await spine.boundingBox()).width), 44, "the new spine is 44px wide");
      assert.equal(await spine.locator(".spine-ref").innerText(), refLabel(check.verse));
      assert.equal(await spine.locator(".ai-badge").count(), isAi ? 1 : 0, "the badge on the new spine of " + label);
      await page.waitForFunction(() => window.__anims.length > 0);
      const anims = await page.evaluate(() => window.__anims);
      assert.equal(anims.length, 1, "one animation for " + label);
      assert.deepEqual(anims[0], { name: "spine-settles", duration: "0.36s", timing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      // Going back and returning to the last screen shows the spine in place: nothing plays again.
      await page.getByRole("navigation", { name: "Story" }).getByRole("button", { name: /^Back to / }).click();
      await page.getByRole("navigation", { name: "Story" }).getByRole("button", { name: /^Next: / }).click();
      await page.getByRole("heading", { name: "Added to your shelf", exact: true }).waitFor();
      await page.waitForTimeout(600);
      assert.equal((await page.evaluate(() => window.__anims)).length, 1, "once per finished story");

      // The AI line above the buttons, the closing note, no sponsor.
      assert.equal(await page.locator(".flow-ai").count(), isAi ? 1 : 0, "the AI line is there for " + label + " only");
      if (isAi) {
        assert.equal(await page.locator(".flow-ai").innerText(), "AI\n" + aiUnreviewedCardLabel);
        assert.equal(Math.round(await page.locator(".flow-ai").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))), 13, "Footnote 13");
        const before = await page.evaluate(() => {
          const line = document.querySelector(".flow-ai"), button = document.querySelector(".story-actions button");
          return !!(line.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        assert.ok(before, "the label comes before the buttons");
      }
      assert.equal(await page.locator(".flow-note").innerText(), editorialNote(check.review, check.drafted));
      assert.equal(await page.locator('[data-slot="sponsor"]').count(), 0, "no sponsor slot on the last screen");
      assert.equal(await page.getByText(/sponsor/i).count(), 0, "no word Sponsor");
      const filled = await filledButtons(page);
      assert.equal(filled.length, 1, "one filled button on the last screen");
      assert.match(filled[0], /^Read .+ in full$/);

      // The share picture and the share text carry the label (T-01.1-22).
      for (const control of [page.locator("header.toolbar").getByRole("button", { name: "Share as a picture", exact: true }), page.locator(".story-actions").getByRole("button", { name: "Share as a picture", exact: true })]) {
        await page.evaluate(() => {
          window.__drawn = [];
          window.__shared = null;
        });
        await control.click();
        await page.waitForFunction(() => window.__shared !== null);
        const shared = await page.evaluate(() => window.__shared);
        assert.equal(shared.files, 1, "a picture goes with the text");
        assert.equal(shared.text, shareText(check), "the share text of " + label);
        assert.equal(shared.text, `${check.hook} ${isAi ? aiUnreviewedCardLabel + " " : ""}${checkUrl(check)}`);
        assert.equal(shared.text.includes(aiUnreviewedCardLabel), isAi, "the AI sentence is in the text of an AI-written check only");
        const drawn = await page.evaluate(() => window.__drawn);
        assert.ok(drawn.includes("Context check"), "the picture says Context check");
        assert.ok(!drawn.includes("CONTEXT CHECK"), "not the old uppercase line");
        assert.equal(drawn.join(" ").includes(aiUnreviewedCardLabel), isAi, "the AI sentence is drawn on the picture of an AI-written check only");
        assert.ok(drawn.includes(refLabel(check.verse)));
      }

      // T-01.1-23: nothing about the finished check left the page.
      assert.deepEqual(requests.filter((url) => url.includes(check.slug)), [], "no request carries the slug");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }

  // Reduce Motion: the spine appears in place, nothing animates.
  {
    const { context, page, problems } = await open(browser, base, "/", { reducedMotion: true });
    try {
      const check = published[0];
      await page.evaluate(() => {
        window.__anims = [];
        document.addEventListener("animationstart", (e) => window.__anims.push(e.animationName), true);
      });
      await page.evaluate((path) => {
        history.pushState({ from: "/" }, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, "/context/" + check.slug);
      await page.locator("main h1").filter({ hasText: refLabel(check.verse) }).waitFor();
      await toTheEnd(page);
      await page.getByRole("heading", { name: "Added to your shelf", exact: true }).waitFor();
      await page.waitForTimeout(500);
      assert.deepEqual(await page.evaluate(() => window.__anims), [], "no animation under Reduce Motion");
      const spine = page.locator(".shelf-moment-spine");
      assert.equal(await spine.evaluate((el) => getComputedStyle(el).animationName), "none");
      assert.equal(await spine.evaluate((el) => getComputedStyle(el).opacity), "1", "the spine is there");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  }
}
