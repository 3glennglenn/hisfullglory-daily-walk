import assert from "node:assert/strict";
import { colour, readState } from "./story.browser.mjs";

// The welcome questionnaire, once (plan 16, founder 2026-10-20) in a real browser. Every case opens a context that has
// never seen the app (browser.newContextFirstRun, set in scripts/browser-check.mjs); every other check starts as a
// reader who already answered. The five screens, Back and Skip, the focus, the storage, a deep link, both looks and
// both modes, 44px targets and text at 200 %.
const TITLES = ["Welcome to your daily walk", "What are you seeking?", "Where are you in your journey?", "Make a little room", "A rhythm made for you"];

async function openFresh(browser, base, path, { width = 390, height = 844, look, lamplight, dark = false } = {}) {
  const context = await browser.newContextFirstRun({ viewport: { width, height }, timezoneId: "Europe/Amsterdam", colorScheme: dark ? "dark" : "light" });
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

const title = (page) => page.locator("main h1");
const stepLabel = (page) => page.locator(".step-label").innerText();

async function targetsAreBigEnough(page, where) {
  const small = await page.locator("main button, main select, main summary").evaluateAll((list) =>
    list.filter((el) => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 44).map((el) => el.textContent.trim() + " " + Math.round(el.getBoundingClientRect().height)),
  );
  assert.deepEqual(small, [], "44px targets " + where);
}

export async function checkWelcome(browser, base) {
  // ---- first open: the five screens, then the choices are saved --------------------------------------------------------
  {
    const { context, page, problems } = await openFresh(browser, base, "/");
    assert.equal(await title(page).innerText(), TITLES[0], "the questionnaire takes over Today on the first open");
    assert.equal(await page.locator(".today").count(), 0, "Today waits behind it");
    assert.equal(await page.locator("nav.tabbar").count(), 0, "the tab bar is covered, as in the walk");
    assert.equal(await page.locator("main h1").count(), 1, "one h1");
    const bar = page.getByRole("progressbar", { name: "Welcome progress" });
    assert.equal(await bar.getAttribute("aria-valuenow"), "1");
    assert.equal(await bar.getAttribute("aria-valuemax"), "5");
    assert.equal(await stepLabel(page), "1 of 5");
    assert.equal(await page.getByRole("button", { name: "Back", exact: true }).count(), 0, "no Back on the first screen");
    assert.equal(await page.getByRole("button", { name: "Skip for now", exact: true }).count(), 1, "Skip for now on step 1");
    assert.equal(
      await page.locator("main p").filter({ hasText: "A few minutes of Scripture, honest reflection and prayer." }).innerText(),
      "A few minutes of Scripture, honest reflection and prayer. You can begin as a guest. Your private writing stays here on your device.",
    );
    await targetsAreBigEnough(page, "on step 1");
    const filled = await colour(page, "--button");
    assert.deepEqual(
      await page.locator("main button").evaluateAll((list, fill) => list.filter((b) => getComputedStyle(b).backgroundColor === fill).map((b) => b.textContent), filled),
      ["Continue"],
      "one filled button",
    );
    // Nothing was stored as answered yet.
    assert.equal((await readState(page)).local.onboarded, false);

    // Step 2: the goals, up to three; focus moved to the title.
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(await title(page).innerText(), TITLES[1]);
    assert.equal(await page.evaluate(() => document.activeElement?.tagName + ":" + document.activeElement?.textContent), "H1:" + TITLES[1], "focus moves to the step title");
    assert.equal(await stepLabel(page), "2 of 5");
    assert.equal(await bar.getAttribute("aria-valuenow"), "2");
    assert.equal(await page.getByRole("button", { name: "Back", exact: true }).count(), 1, "Back from step 2");
    assert.equal(await page.getByText("Choose up to three goals.").count(), 1);
    for (const goal of ["Prayer", "Peace", "Relationships"]) await page.getByRole("button", { name: goal, exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Understand the Bible", exact: true }).isDisabled(), true, "a fourth goal is not allowed");
    assert.equal(await page.getByRole("button", { name: "Prayer", exact: true }).getAttribute("aria-pressed"), "true");
    await targetsAreBigEnough(page, "on step 2");

    // Back keeps the choice; step 3: the journey.
    await page.getByRole("button", { name: "Back", exact: true }).click();
    assert.equal(await title(page).innerText(), TITLES[0]);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Peace", exact: true }).getAttribute("aria-pressed"), "true", "the goals are kept");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(await title(page).innerText(), TITLES[2]);
    await page.getByLabel("Your journey", { exact: true }).selectOption("Growing in faith");

    // Step 4: minutes, time, private topics, the reminder sentence.
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(await title(page).innerText(), TITLES[3]);
    await page.getByLabel("Minutes each day", { exact: true }).selectOption("10");
    await page.getByLabel("Your preferred time", { exact: true }).selectOption("evening");
    assert.equal(await page.getByText("You can turn on a daily reminder in Settings.").count(), 1);
    assert.equal(await page.getByText(/Push reminders are not configured/).count(), 0, "the old sentence about reminders is gone");
    assert.equal(await page.getByText(/This is a preference, not a scheduled notification/).count(), 0);
    await page.getByText("What are you walking through right now?").click();
    await targetsAreBigEnough(page, "on step 4");

    // Step 5: the summary and "Begin my walk".
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(await title(page).innerText(), TITLES[4]);
    assert.equal(await stepLabel(page), "5 of 5");
    assert.equal(await page.getByRole("button", { name: "Continue", exact: true }).count(), 0, "the last screen has no Continue");
    assert.match(await page.locator("main").innerText(), /Begin with 10 minutes in the evening\. Your focus: Prayer, Peace, Relationships\./);
    assert.equal(await page.getByText("Explore Grow for topic journeys. Change your preferences anytime in Settings.").count(), 1);
    assert.match(await page.locator("main").innerText(), /Your suggested starting topic: .+\./);
    await targetsAreBigEnough(page, "on step 5");
    await page.getByRole("button", { name: "Begin my walk", exact: true }).click();
    await page.locator("main h1", { hasText: "Today" }).waitFor();
    assert.equal(await page.locator(".today").count(), 1, "Today opens");
    assert.equal(await page.locator("nav.tabbar").count(), 1, "the tab bar is back");
    const state = await readState(page);
    assert.equal(state.local.onboarded, true);
    assert.deepEqual(state.preferences, { goals: ["Prayer", "Peace", "Relationships"], journey: "Growing in faith", minutes: 10, time: "evening" });
    assert.ok(Array.isArray(state.privateTopics));
    // It does not come back: not after a reload, not on a new visit to Today.
    await page.reload();
    await page.locator("main h1", { hasText: "Today" }).waitFor();
    assert.equal(await page.getByText(TITLES[0]).count(), 0, "not after a reload");
    // The reminder was not turned on by the questionnaire.
    assert.equal((await readState(page)).notifications?.["Daily Walk"] ?? false, false);
    assert.deepEqual(problems, []);
    await context.close();
  }

  // ---- "Skip for now" on any step sets onboarded, keeps what was chosen, and never comes back -------------------------
  {
    const { context, page, problems } = await openFresh(browser, base, "/");
    await page.getByRole("button", { name: "Skip for now", exact: true }).click();
    await page.locator("main h1", { hasText: "Today" }).waitFor();
    assert.equal((await readState(page)).local.onboarded, true, "skipping on step 1");
    await page.reload();
    await page.locator("main h1", { hasText: "Today" }).waitFor();
    assert.equal(await page.getByText(TITLES[0]).count(), 0, "it does not come back after a reload");
    await page.goto(base + "/");
    await page.locator("main h1", { hasText: "Today" }).waitFor();
    assert.deepEqual(problems, []);
    await context.close();

    const later = await openFresh(browser, base, "/");
    await later.page.getByRole("button", { name: "Continue", exact: true }).click();
    await later.page.getByRole("button", { name: "Peace", exact: true }).click();
    assert.equal(await later.page.getByRole("button", { name: "Skip for now", exact: true }).count(), 1, "Skip for now on step 2");
    await later.page.getByRole("button", { name: "Skip for now", exact: true }).click();
    await later.page.locator("main h1", { hasText: "Today" }).waitFor();
    const state = await readState(later.page);
    assert.equal(state.local.onboarded, true, "skipping on step 2");
    assert.deepEqual(state.preferences.goals, ["Peace"], "what was chosen is kept");
    await later.context.close();
  }

  // ---- a deep link is not blocked; the questionnaire waits for the app to open on Today --------------------------------
  {
    const { context, page } = await openFresh(browser, base, "/bible/john/3");
    await page.locator(".verse").first().waitFor();
    assert.ok(page.url().endsWith("/bible/john/3"), "the chapter opens");
    assert.equal(await page.getByText(TITLES[0]).count(), 0, "no questionnaire over a deep link");
    await page.getByRole("link", { name: "Today", exact: true }).first().click();
    await page.locator("main h1", { hasText: "Today" }).waitFor();
    assert.equal((await readState(page)).local.onboarded, false, "nothing was answered");
    // The next time the app opens on Today, it asks once.
    const next = await context.newPage();
    await next.goto(base + "/");
    await next.getByRole("heading", { name: TITLES[0] }).waitFor();
    await next.close();
    await context.close();

    const check = await openFresh(browser, base, "/context");
    assert.equal(await check.page.getByText(TITLES[0]).count(), 0, "the context checks list is not held back either");
    await check.context.close();
  }

  // ---- both looks, both modes: the same five screens, readable, one filled button ---------------------------------------
  for (const [look, lamplight, dark, name] of [
    [null, "off", false, "Cover Light"],
    [null, "on", true, "Cover Lamplight"],
    ["marked", "off", false, "Marked Light"],
    ["marked", "on", true, "Marked Lamplight"],
  ]) {
    const { context, page, problems } = await openFresh(browser, base, "/", { look, lamplight, dark });
    for (let step = 0; step < 5; step++) {
      assert.equal(await title(page).innerText(), TITLES[step], name + " step " + (step + 1));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ": no sideways scroll");
      const font = await title(page).evaluate((el) => getComputedStyle(el).fontFamily);
      assert.match(font, look === "marked" ? /system-ui|-apple-system/ : /Manrope/, name + ": the interface face of the look");
      if (step < 4) await page.getByRole("button", { name: "Continue", exact: true }).click();
    }
    assert.deepEqual(problems, [], name);
    await context.close();
  }

  // ---- 200 % text on two widths: nothing clipped, no sideways scroll, every button reachable --------------------------
  for (const width of [390, 320]) {
    const { context, page } = await openFresh(browser, base, "/", { width, height: 640 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "34px";
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(() => document.documentElement.dataset.text === "large");
    for (let step = 0; step < 5; step++) {
      const where = "at " + width + "px, 200 %, step " + (step + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal scroll " + where);
      assert.equal(await page.locator(".welcome-flow").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, "nothing clipped " + where);
      const skip = page.getByRole("button", { name: "Skip for now", exact: true });
      await skip.scrollIntoViewIfNeeded();
      assert.equal(await skip.isVisible(), true, "Skip for now can be reached " + where);
      if (step < 4) {
        await page.getByRole("button", { name: "Continue", exact: true }).scrollIntoViewIfNeeded();
        await page.getByRole("button", { name: "Continue", exact: true }).click();
      }
    }
    await context.close();
  }

  // ---- reduced motion: nothing moves in the questionnaire -------------------------------------------------------------------
  {
    const { context, page } = await openFresh(browser, base, "/");
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0, "nothing animates");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0, "nothing animates on the next screen either");
    await context.close();
  }
}
