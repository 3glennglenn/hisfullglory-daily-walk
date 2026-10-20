import assert from "node:assert/strict";
import { editorialNote, refLabel } from "../src/context/checks.ts";

// The context-check story, the context checks list and Your shelf in a real browser (plan 07, UI-SPEC A7, A8, A9,
// A16). Every case runs in a fresh context so the reader's private state starts empty; "which check is newest" is
// computed from the content folder at run time (`published`, newest first), never a hard-coded slug.
export const STORAGE = "hfg-daily-walk:v3";

export const readState = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE);
export const localToday = (page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
/** The computed colour of a design token, read through a probe element. */
export const colour = (page, token) =>
  page.evaluate((name) => {
    const probe = document.createElement("i");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);

/** A fresh context and page; the page's errors and console warnings are collected and must stay empty. */
export async function open(browser, base, path, { width = 390, height = 844, look, lamplight, reducedMotion } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    timezoneId: "Europe/Amsterdam",
    colorScheme: "light",
    ...(reducedMotion ? { reducedMotion: "reduce" } : {}),
  });
  if (look) await context.addInitScript((v) => localStorage.setItem("hfg-look", v), look);
  if (lamplight) await context.addInitScript((v) => localStorage.setItem("hfg-lamplight", v), lamplight);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(m.text());
  });
  await page.goto(base + path);
  await page.locator("main h1").first().waitFor();
  return { context, page, problems };
}

/** Clicks "Next: ..." until the last screen; returns the titles of the parts in order, the cover's first. */
async function readToTheEnd(page, expectedTotal) {
  const bar = page.getByRole("progressbar", { name: "Story progress" });
  for (let step = 1; step < expectedTotal; step++) {
    assert.equal(await bar.getAttribute("aria-valuenow"), String(step), "the indicator is on step " + step);
    const next = page.getByRole("navigation", { name: "Story" }).getByRole("button", { name: /^Next: / });
    assert.equal(await next.count(), 1, "one Next button on step " + step);
    await next.click();
    assert.equal(await bar.getAttribute("aria-valuenow"), String(step + 1), "the indicator moved to step " + (step + 1));
  }
}

export async function checkStoryFlow(browser, base, published) {
  const newest = published[0];
  assert.ok(newest, "at least one context check is published");
  const ref = refLabel(newest.verse);
  const total = 7 + (newest.argued ? 1 : 0);

  // ---- the flow: toolbar, indicator, the cover first, buttons named after the parts ------------------------------
  {
    const { context, page, problems } = await open(browser, base, "/context/" + newest.slug);
    try {
      assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).count(), 0, "the tab bar is covered while a story is open");
      const back = page.getByRole("button", { name: "Back to Today", exact: true });
      assert.equal(await back.count(), 1);
      assert.equal((await back.textContent()).trim(), "‹ Today");
      assert.equal(await page.locator("main h1").count(), 1, "one h1");
      assert.equal(await page.locator("main h1").innerText(), ref, "the reference is the title");
      assert.equal(await page.locator("header.toolbar").getByRole("button", { name: "Share as a picture", exact: true }).count(), 1, "the toolbar can share the picture");

      const bar = page.getByRole("progressbar", { name: "Story progress" });
      assert.equal(await bar.getAttribute("aria-valuemin"), "1");
      assert.equal(await bar.getAttribute("aria-valuemax"), String(total));
      assert.equal(await bar.getAttribute("aria-valuenow"), "1");
      assert.equal(await bar.getAttribute("aria-valuetext"), `1 of ${total}`);
      assert.equal(await page.locator(".step-label").innerText(), `1 of ${total}`, "the words are written next to the bar");
      const segments = page.locator(".step-segment");
      assert.equal(await segments.count(), total);
      assert.ok(await segments.nth(0).evaluate((el) => el.classList.contains("step-segment-done")), "the first segment is filled on the first step");
      assert.ok(!(await segments.nth(1).evaluate((el) => el.classList.contains("step-segment-done"))), "the second is not");
      assert.equal(await segments.nth(0).evaluate((el) => getComputedStyle(el).backgroundColor), await colour(page, "--link"), "done segments are --link");
      assert.equal(await segments.nth(1).evaluate((el) => getComputedStyle(el).borderTopWidth), "1px", "to-do segments carry a 1px edge");
      assert.equal(await segments.nth(1).evaluate((el) => getComputedStyle(el).height), "4px");

      // Screen 1 is the cover, with the hint and no button of its own.
      const cover = page.getByRole("region", { name: "Context check", exact: true });
      assert.equal(await cover.locator(".cover-ref").innerText(), ref);
      assert.equal(await cover.getByRole("button").count(), 0, "no button on the cover");
      assert.equal(await cover.locator(".cover-hint").innerText(), "Swipe or tap Next to read the story.");
      assert.equal(await page.getByText("Context check of the day").count(), 0, "the old eyebrow is gone");
      assert.equal(await page.getByRole("navigation", { name: "Story" }).getByRole("button").count(), 1, "the cover has only Next");

      // Stepping: the buttons name the parts, the indicator advances, focus follows to the part's title.
      const nav = page.getByRole("navigation", { name: "Story" });
      const titles = [];
      for (let step = 1; step < total; step++) {
        const next = nav.getByRole("button", { name: /^Next: / });
        const nextTitle = (await next.innerText()).replace(/^Next: /, "");
        titles.push(nextTitle);
        const before = step > 1 ? titles[step - 2] : "Context check";
        await next.click();
        assert.equal(await bar.getAttribute("aria-valuenow"), String(step + 1));
        assert.equal(await page.locator(".step-label").innerText(), `${step + 1} of ${total}`);
        const focused = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent }));
        assert.equal(focused.tag, "H2", "focus moves to the part's title on step " + (step + 1));
        assert.equal(focused.text, nextTitle, "the title is the one the button named");
        const prev = nav.getByRole("button", { name: `Back to ${before}`, exact: true });
        assert.equal(await prev.count(), 1, `a Back button names the previous part (${before})`);
        assert.equal((await prev.textContent()).trim(), `‹ ${before}`);
        // The shelf is written only at the last screen.
        if (step + 1 < total) assert.deepEqual((await readState(page)).shelf, [], "nothing on the shelf before the last screen");
      }
      assert.equal(titles.at(-1), "Keep going", "the last part is Keep going");
      assert.equal(await nav.getByRole("button", { name: /^Next: / }).count(), 0, "no Next on the last screen");
      assert.equal(titles.includes("The moment") && titles.includes("What the context adds"), true, "the part titles are unchanged");

      // The last screen: the heading after a real write, one shelf entry with today's local date, the closing note.
      await page.getByRole("heading", { name: "Added to your shelf", exact: true }).waitFor();
      const state = await readState(page);
      assert.deepEqual(state.shelf, [{ slug: newest.slug, finishedOn: await localToday(page) }], "one entry: slug and local date, nothing else");
      assert.equal(await page.locator(".flow-note").innerText(), editorialNote(newest.review, newest.drafted), "the closing note is editorialNote()");
      assert.equal(await page.getByRole("button", { name: /^Read .+ in full$/ }).count(), 1);

      // Stepping back and forward again adds nothing.
      await nav.getByRole("button", { name: /^Back to / }).click();
      await nav.getByRole("button", { name: /^Next: / }).click();
      assert.equal((await readState(page)).shelf.length, 1, "reaching the last screen again changes nothing");

      // "‹ Today" returns to Today, whose block now shows the finished state.
      await back.click();
      await page.waitForURL(base + "/");
      await page.locator(".cover-status").waitFor();
      assert.equal(await page.locator(".cover-status").innerText(), "On your shelf");
      assert.deepEqual(problems, [], "no page or console errors");
    } finally {
      await context.close();
    }
  }

  // ---- finishing it again: "On your shelf", still one entry, the first day stays --------------------------------
  {
    const { context, page, problems } = await open(browser, base, "/");
    try {
      await page.evaluate(
        ({ key, slug }) => {
          const state = JSON.parse(localStorage.getItem(key));
          state.shelf = [{ slug, finishedOn: "2026-01-02" }];
          localStorage.setItem(key, JSON.stringify(state));
        },
        { key: STORAGE, slug: newest.slug },
      );
      await page.goto(base + "/context/" + newest.slug);
      await page.locator("main h1").waitFor();
      await readToTheEnd(page, total);
      await page.getByRole("heading", { name: "On your shelf", exact: true }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "Added to your shelf" }).count(), 0);
      assert.deepEqual((await readState(page)).shelf, [{ slug: newest.slug, finishedOn: "2026-01-02" }], "still one entry, with the first day");
      assert.deepEqual(problems, [], "no page or console errors");
    } finally {
      await context.close();
    }
  }

  // ---- a storage that refuses the write: no heading, the shelf unchanged, the app says so -------------------------
  {
    const { context, page, problems } = await open(browser, base, "/context/" + newest.slug);
    try {
      await page.evaluate(() => {
        Storage.prototype.setItem = () => {
          throw new Error("QuotaExceededError");
        };
      });
      await readToTheEnd(page, total);
      await page.getByRole("button", { name: /^Read .+ in full$/ }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "Added to your shelf" }).count(), 0, "never claims what was not saved");
      assert.equal(await page.getByRole("heading", { name: "On your shelf" }).count(), 0);
      assert.match(await page.locator("aside.notice").innerText(), /Not saved/);
      assert.deepEqual((await readState(page)).shelf, [], "the stored shelf is unchanged");
      assert.ok(problems.every((p) => /QuotaExceededError|Not saved/.test(p)), "only the refused write is reported: " + JSON.stringify(problems));
    } finally {
      await context.close();
    }
  }
}
