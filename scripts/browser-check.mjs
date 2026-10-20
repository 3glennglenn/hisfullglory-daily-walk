import {checkCircles} from "../tests/circles.browser.mjs";
import {checkSafety} from "../tests/safety.browser.mjs";
import {checkDialogs} from "../tests/dialogs.browser.mjs";
// Run against npm run preview. DOM/behavior checks only; deliberately no screenshots.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
// Node strips the types, so the app's own rules decide which context check Today should open with (Node 24, local and CI).
import {aiUnreviewedCardLabel,publishedChecks,refLabel,splitHook,todaysCheck} from "../src/context/checks.ts";
import {checkTopicComposer} from "../tests/topic-hub.browser.mjs";
import {checkToday,checkTodayFixture,checkTodayLargeText} from "../tests/today.browser.mjs";
import {checkSponsor} from "../tests/sponsor.browser.mjs";
import {checkStoryFlow} from "../tests/story.browser.mjs";
import {checkShelfScreen} from "../tests/shelf.browser.mjs";
import {checkContextList,checkStoryEnd} from "../tests/storyend.browser.mjs";
import {checkWalkFinish} from "../tests/walk.browser.mjs";
import {checkReaderText,checkLibrary,checkReaderSheets,checkChapterEnd,checkListen,checkVerseSheet,checkLayers,checkLayersCommunity,checkChapterSheet,checkCommunityLink} from "../tests/reader.browser.mjs";
import {checkAuthBoundary} from "../tests/auth-boundary.browser.mjs";
import {checkProfile} from "../tests/profile.browser.mjs";
import {checkPushedScreens,checkSurfaces} from "../tests/remaining.browser.mjs";
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173";
// Every context check the site publishes, newest first, read at run time (the daily routine adds one a day).
const contentDir = "site/content/context-checks";
const published = publishedChecks(readdirSync(contentDir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(contentDir + "/" + f, "utf8"))));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  timezoneId: "Europe/Amsterdam",
  colorScheme: "light",
});
const page = await context.newPage();
const errors = [];
const consoleErrors = [];
const consoleWarnings = [];
const networkFailures = [];
page.on("console",message=>{if(message.type()==="error")consoleErrors.push(message.text());if(message.type()==="warning")consoleWarnings.push(message.text());});
page.on("requestfailed",request=>networkFailures.push(new URL(request.url()).pathname));
page.on("pageerror", (e) => errors.push(e.message));
let checks = 0;
page.setDefaultTimeout(10000);
async function check(label, fn) {
  await fn();
  checks++;
  console.log("PASS", label);
}
async function go(path) {
  await page.goto(base + path);
  await page.locator("main h1").first().waitFor();
}
try {
  await go("/");
  await check(
    "Today opens with the newest context check, AI-written ones included and labelled (D-05, D-06)",
    async () => {
      // The expected check is computed from the content folder at run time: the daily routine adds a file every day.
      const expected = todaysCheck(published, [], "2026-10-20")?.check;
      assert.ok(expected, "at least one context check is published");
      assert.equal(await page.locator("main h1").count(), 1, "one h1");
      assert.equal(await page.locator("main h1").innerText(), "Today");
      assert.match(
        await page.locator(".today-date").innerText(),
        /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Z][a-z]+ \d{1,2}$/,
        "the date line in English",
      );
      const cover = page.getByRole("region", { name: "Today's context check", exact: true });
      assert.equal(await cover.count(), 1, "the cover is one section named by its hidden heading");
      assert.equal(await cover.locator("h2.sr-only").innerText(), "Today's context check");
      assert.equal(await cover.locator(".cover-ref").innerText(), refLabel(expected.verse));
      const { first, second } = splitHook(expected.hook);
      assert.equal(await cover.locator(".cover-display").innerText(), first, "the hook's first part is the Display line");
      if (second) assert.equal(await cover.locator(".cover-body").innerText(), second, "the second part is the Body line");
      else assert.equal(await cover.locator(".cover-body").count(), 0);
      assert.equal(await cover.locator("h1, h2:not(.sr-only), h3").count(), 0, "no other heading inside the cover: the hook is a paragraph");
      // The label row is there exactly when no person checked the check.
      const aiRows = await cover.locator(".cover-ai").count();
      assert.equal(aiRows, expected.review === "ai-unreviewed" ? 1 : 0, "AI row iff AI-unreviewed");
      if (expected.review === "ai-unreviewed") {
        assert.equal(await cover.locator(".cover-ai").innerText(), "AI\n" + aiUnreviewedCardLabel, "badge and label in words");
        assert.equal(await cover.locator(".cover-ai .ai-badge").getAttribute("aria-hidden"), "true");
        assert.equal(await cover.locator(".cover-ai").evaluate((el) => parseFloat(getComputedStyle(el).fontSize)), 17, "the label is Body 17");
        // The label comes before the button.
        const order = await cover.evaluate((el) => {
          const ai = el.querySelector(".cover-ai"), button = el.querySelector("button");
          return !!(ai.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        assert.ok(order, "the label row is before the button");
      }
      // One filled button on the screen, named with the reference, leading to the story.
      const filled = await page.locator("main button").evaluateAll(
        (list) => list.filter((b) => getComputedStyle(b).backgroundColor !== "rgba(0, 0, 0, 0)").map((b) => b.getAttribute("aria-label") ?? b.textContent),
      );
      assert.deepEqual(filled, ["Read the story: " + refLabel(expected.verse)], "exactly one filled button in main");
      assert.equal(await cover.getByRole("button").innerText(), "Read the story");
      // The old Home furniture is gone.
      for (const gone of ["Walk with Jesus", "Welcome to your daily walk", "A gentle rhythm", "Read Scripture", "Bring a prayer", "Reflect privately"])
        assert.equal(await page.getByText(gone).count(), 0, gone + " is gone from Today");
      await cover.getByRole("button").click();
      await page.waitForURL("**/context/" + expected.slug);
      await page.goBack();
      await page.locator("main h1", { hasText: "Today" }).waitFor();

      // A reader who finished every check newer than the newest AI-written one on earlier days sees that one, labelled.
      const ai = published.find((c) => c.review === "ai-unreviewed");
      if (ai) {
        const newer = published.slice(0, published.indexOf(ai)).map((c) => ({ slug: c.slug, finishedOn: "2026-01-02" }));
        await page.evaluate((shelf) => {
          const state = JSON.parse(localStorage.getItem("hfg-daily-walk:v3"));
          state.shelf = shelf;
          localStorage.setItem("hfg-daily-walk:v3", JSON.stringify(state));
        }, newer);
        await page.reload();
        await page.locator("main h1").waitFor();
        const forced = page.getByRole("region", { name: "Today's context check", exact: true });
        assert.equal(await forced.locator(".cover-ref").innerText(), refLabel(ai.verse), "Today shows the AI-written check");
        assert.equal(await forced.locator(".cover-ai").innerText(), "AI\n" + aiUnreviewedCardLabel, "with its label");
        await page.evaluate(() => {
          const state = JSON.parse(localStorage.getItem("hfg-daily-walk:v3"));
          state.shelf = [];
          localStorage.setItem("hfg-daily-walk:v3", JSON.stringify(state));
        });
        await page.reload();
        await page.locator("main h1").waitFor();
      }
    },
  );
  await check(
    "Settings, Daily rhythm saves up to three goals, the journey and the minutes (onboarding left Today)",
    async () => {
      await go("/settings");
      for (const goal of ["Prayer", "Peace", "Consistency"])
        await page.getByRole("button", { name: goal, exact: true }).click();
      assert.equal(
        await page
          .getByRole("button", { name: "Understand the Bible", exact: true })
          .isDisabled(),
        true,
        "a fourth goal is not allowed",
      );
      await page.getByLabel("Faith journey", { exact: true }).selectOption("Growing in faith");
      await page.getByLabel("Minutes", { exact: true }).selectOption("10");
      await page.reload();
      await page.locator("main h1").waitFor();
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("hfg-daily-walk:v3")),
      );
      assert.equal(saved.preferences.goals.length, 3);
      assert.equal(saved.preferences.journey, "Growing in faith");
      assert.equal(saved.preferences.minutes, 10);
      assert.equal(await page.getByLabel("Minutes", { exact: true }).inputValue(), "10");
    },
  );
  await check("Today: its states, the walk and shelf rows, and what each look draws (UI-SPEC A1)", () => checkToday(browser, base, published));
  await check("Today on controlled content: no published check, an AI-written newest check, files the app cannot read", () => checkTodayFixture(browser, base));
  await check("Today at 200 % text on 390 and 320px: no sideways scroll, nothing clipped, the button and the last row above the tab bar, tab labels on one line", () => checkTodayLargeText(browser, base, published));
  await check("sponsor slot: nothing at any of the six places while no sponsor is set; a fixture sponsor shows only where it is listed, as a sponsored link without a query string", () => checkSponsor(browser, base));
  await check("context-check story: a full-screen flow with named steps that puts a finished story on the shelf once, and says so only when it was saved (UI-SPEC A7)", () => checkStoryFlow(browser, base, published));
  await check("Your shelf: spines on boards (7 at 390px), AI badges and legend, tomorrow place, empty and large-text states, Back and the You row (UI-SPEC A9)", () => checkShelfScreen(browser, base, published));
  await check("Context checks list newest first with its marks and AI labels; an unknown check shows two ways on (UI-SPEC A8, A16)", () => checkContextList(browser, base, published));
  await check("story end: the shelf moment settles once (none under Reduce Motion), the AI line, no sponsor, and the label on the share picture and the share text (UI-SPEC A7, D-06)", () => checkStoryEnd(browser, base, published));
  await check(
    "complete daily walk: six named steps with the step indicator, the private reflection saved, finishing on the Prayer step, idempotent completion (UI-SPEC A5)",
    async () => {
      await go("/walk");
      assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).count(), 0, "the tab bar is covered while the walk is open");
      assert.equal(await page.locator("main h1").innerText(), "Today's walk", "the toolbar title is the h1");
      assert.equal(await page.getByRole("button", { name: "Back to Today", exact: true }).count(), 1);
      const bar = page.getByRole("progressbar", { name: "Walk progress" });
      assert.equal(await bar.getAttribute("aria-valuenow"), "1");
      assert.equal(await bar.getAttribute("aria-valuemin"), "1");
      assert.equal(await bar.getAttribute("aria-valuemax"), "6");
      assert.equal(await bar.getAttribute("aria-valuetext"), "Step 1 of 6, Scripture");
      assert.equal(await page.locator(".step-label").innerText(), "Step 1 of 6");
      assert.equal(await page.locator(".step-segment-done").count(), 1, "the first segment is filled on the first step");
      assert.equal(await page.locator(".flow-actions").getByRole("button").count(), 1, "step 1 has no back button");
      for (let i = 0; i < 4; i++) {
        await page.getByRole("button", { name: /^Continue to / }).click();
        assert.equal(await bar.getAttribute("aria-valuenow"), String(i + 2));
      }
      assert.equal(await page.locator(".step-label").innerText(), "Step 5 of 6");
      await page.locator("#journal").fill("An honest private reflection for testing.");
      await page.getByRole("button", { name: "Continue to Prayer" }).click();
      assert.equal(await page.locator(".step-label").innerText(), "Step 6 of 6");
      assert.equal(await page.getByRole("button", { name: /^Continue to / }).count(), 0, "no Continue on the last step");
      assert.equal(await page.getByRole("button", { name: "Back to Journal", exact: true }).count(), 1, "the safe choice names the step");
      await page.getByRole("button", { name: "Finish today's walk", exact: true }).click();
      await page.getByRole("heading", { name: "Walk complete", exact: true }).waitFor();
      const s = await page.evaluate(() => JSON.parse(localStorage.getItem("hfg-daily-walk:v3")));
      assert.equal(s.local.completedDates.length, 1);
      assert.ok(s.entries.some((e) => e.body.includes("honest private")), "the private reflection is kept");
      // Reopening shows the finish screen and completes nothing a second time.
      await go("/walk");
      await page.getByRole("heading", { name: "Walk complete", exact: true }).waitFor();
      const again = await page.evaluate(() => JSON.parse(localStorage.getItem("hfg-daily-walk:v3")));
      assert.equal(again.local.completedDates.length, 1, "completion stays idempotent");
    },
  );
  await check("walk finish: days walked counted and never reset, tomorrow named, today's context check while unread, reminders Off unless turned on, no guilt words; old stored steps; Back keeps the step; 200 % text (UI-SPEC A5, A6, D-11)", () => checkWalkFinish(browser, base, published));
  await check(
    "deep-linked WEB chapter: the linked verse is selected; the old ?tab= addresses still open the context layers",
    async () => {
      await go("/bible/romans/8/28");
      await page.getByRole("heading", { level: 1, name: "Romans 8", exact: true }).waitFor();
      assert.ok((await page.locator("#verse-28").innerText()).includes("all things work together"));
      assert.equal(await page.locator("#verse-28.selected").count(), 1, "the linked verse is selected");
      // The view buttons are gone; the old address opens the verse's sheet at Context (plan 10).
      await page.goto(base + "/bible/romans/8/28?tab=context");
      const sheet = page.getByRole("dialog", { name: "Romans 8:28" });
      await sheet.waitFor();
      // Romans 8 has a sourced chapter note (no verse note for 8:28) and an AI explanation.
      const sourced = sheet.locator('article[data-layer="sourced"]');
      await sourced.getByRole("heading", { name: "Context", exact: true }).waitFor();
      const sourcedText = await sourced.textContent();
      assert.match(sourcedText, /Verse 28 belongs with verses 29–30/);
      assert.match(sourcedText, /No note for this verse yet, so this shows the wider chapter context\./);
      assert.doesNotMatch(sourcedText, /\bAI\b/, "sourced note stays free of AI text");
      await sourced.getByText("Why we say this", { exact: true }).click();
      assert.equal(
        await sourced.getByRole("link", { name: "Primary source", exact: true }).getAttribute("href"),
        "https://ebible.org/engwebp/ROM08.htm",
      );
      assert.equal(await sourced.locator("[data-layer]").count(), 0);
      // The AI explanation is its own page in the same sheet, after the context page.
      await sheet.getByRole("button", { name: "Back to Romans 8:28", exact: true }).click();
      await sheet.locator('[data-layer-row="ai"]').filter({ hasNotText: "Loading…" }).click();
      const ai = sheet.locator('article[data-layer="ai"]');
      await ai.getByRole("heading", { name: /^AI explanation/ }).waitFor();
      assert.equal(await ai.locator(".layer-note").textContent(), "Written by an AI model. Not reviewed by a theological reader.");
      await ai.getByRole("heading", { name: "What this chapter says", exact: true }).waitFor();
      assert.deepEqual(
        await sheet.locator("[data-layer]").evaluateAll((nodes) => nodes.map((n) => n.dataset.layer)),
        ["ai"],
        "one layer on a page: AI explanation never shares a page with the sourced note",
      );
    },
  );
  await check("the reader puts Scripture first: sticky toolbar, verses as text with one Tab stop, a heading per look (UI-SPEC A3)", () => checkReaderText(browser, base));
  await check("the Bible library: context checks first, saved passages, testaments, books, chapter grids, Continue reading, the download states (UI-SPEC A2, A16)", () => checkLibrary(browser, base));
  await check("the title opens the picker, search sits behind More or an icon, sheets keep focus and swipe (UI-SPEC A3, A4)", () => checkReaderSheets(browser, base));
  await check("the end of the chapter: one filled Next, Mark as read, questions to carry, topics, the WEB line (UI-SPEC A3)", () => checkChapterEnd(browser, base));
  await check("Listen plays in a mini player above the tab bar, the spoken verse is gold, Stop gives focus back (UI-SPEC A3)", () => checkListen(browser, base));
  await check("a verse opens one sheet: highlight, save, journal, copy and share; a tap or a number opens it, a selection or a long press does not (UI-SPEC A4)", () => checkVerseSheet(browser, base));
  await check("the layers around a verse: Context, AI explanation, Community in a fixed order, each apart by words, icon, frame and colour; loading, none and failure say so (UI-SPEC 5.3, A4, A16)", () => checkLayers(browser, base));
  await check("the Community layer on a controlled service: its row, its page, its words offline (UI-SPEC A4, A16)", () => checkLayersCommunity(browser, base));
  await check("the chapter sheet and its capsule: above the tab bar and the Lamplight notice, the old ?tab= links land in the right place, no unavailable feature is announced (UI-SPEC A3, A4, 8.2)", () => checkChapterSheet(browser, base));
  await check("?tab=community opens the chapter sheet at Community on a controlled service", () => checkCommunityLink(browser, base));
  await check(
    "private prayer lifecycle creates an answered journal without automatic publishing",
    async () => {
      await go("/pray");
      await page.getByLabel("Title", { exact: true }).fill("A private prayer");
      await page
        .getByLabel("Prayer", { exact: true })
        .fill("Please guide this ordinary day.");
      await page
        .getByRole("button", { name: "Save private prayer", exact: true })
        .click();
      await page.getByLabel("Move to").selectOption("Waiting");
      await page.getByLabel("Move to").selectOption("Answered");
      await page
        .getByRole("heading", { name: "How did God answer your prayer?" })
        .waitFor();
      await page.locator("textarea").last().fill("Someone helped me today.");
      await page
        .getByRole("button", { name: "Keep private", exact: true })
        .click();
      const s = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("hfg-daily-walk:v3")),
      );
      assert.equal(s.prayers[0].status, "Answered");
      assert.ok(s.entries.some((e) => e.type === "answered prayer"));
      assert.equal(
        await page
          .getByRole("heading", { name: "Share with the community" })
          .count(),
        0,
      );
    },
  );
  await check(
    "Pray is one quiet screen; updates and edits of a private prayer use a text sheet, deletion a confirmation (UI-SPEC A10, A15, E18)",
    async () => {
      const browserDialogs = [];
      const onDialog = (d) => {
        browserDialogs.push(d.type());
        void d.dismiss();
      };
      page.on("dialog", onDialog);
      const prayers = () =>
        page.evaluate(() => JSON.parse(localStorage.getItem("hfg-daily-walk:v3")).prayers);
      try {
        await go("/pray");
        assert.equal(await page.locator("main h1").count(), 1);
        assert.equal(await page.locator("main h1").innerText(), "Pray");
        const segments = page.getByRole("radiogroup", { name: "Prayer views", exact: true });
        assert.deepEqual(await segments.getByRole("radio").allInnerTexts(), ["Private prayers", "Prayer and praise"]);
        assert.equal(await segments.getByRole("radio", { name: "Private prayers" }).getAttribute("aria-checked"), "true");
        assert.deepEqual(
          await page.evaluate(() =>
            [...document.querySelectorAll("main button")]
              .filter((b) => !b.classList.contains("secondary") && b.getAttribute("role") !== "radio")
              .map((b) => b.textContent.trim()),
          ),
          ["Save private prayer"],
          "the only filled button on the private view",
        );
        const mainText = await page.locator("main").innerText();
        assert.ok(!/Resources|shop/i.test(mainText), "no Resources or shop link on Pray");
        assert.equal(await page.locator('main a[href*="shop"]').count(), 0);

        // An update, in a sheet.
        const update = page.getByRole("dialog", { name: "A private prayer update", exact: true });
        await page.getByRole("button", { name: "Add private update", exact: true }).click();
        await update.waitFor();
        const field = update.getByLabel("Your update", { exact: true });
        const save = update.getByRole("button", { name: "Save update", exact: true });
        assert.deepEqual(await update.getByRole("button").allInnerTexts(), ["Don't save update", "Save update"]);
        assert.equal(await save.isDisabled(), true, "the action waits for words");
        await field.fill("   ");
        assert.equal(await save.isDisabled(), true, "spaces are not words");
        // On a phone the sheet sits on the bottom edge with 28px top corners, at most 90 % of the screen high.
        // (It slides up for 280ms: measure once it has arrived.)
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
        const box = await update.evaluate((d) => {
          const r = d.getBoundingClientRect();
          const style = getComputedStyle(d);
          return { bottom: r.bottom, left: r.left, right: r.right, height: r.height, radius: style.borderTopLeftRadius, bottomRadius: style.borderBottomLeftRadius, screen: innerHeight, width: innerWidth };
        });
        assert.equal(Math.round(box.bottom), box.screen, "anchored to the bottom");
        assert.equal(box.radius, "28px");
        assert.equal(box.bottomRadius, "0px");
        assert.ok(box.height <= box.screen * 0.9 + 1);
        assert.equal(Math.round(box.right - box.left), box.width, "full width on a phone");
        await field.fill("A first update.");
        assert.equal(await save.isEnabled(), true);
        await save.click();
        await update.waitFor({ state: "detached" });
        assert.equal((await prayers())[0].updates.at(-1).body, "A first update.");
        assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "Add private update", "focus returns");

        // Escape asks nothing and the words are still there when the sheet opens again; the named safe button drops them.
        await page.getByRole("button", { name: "Add private update", exact: true }).click();
        await update.waitFor();
        await field.fill("Half a thought");
        await page.keyboard.press("Escape");
        await update.waitFor({ state: "detached" });
        assert.equal((await prayers())[0].updates.length, 1, "Escape saved nothing");
        await page.getByRole("button", { name: "Add private update", exact: true }).click();
        await update.waitFor();
        assert.equal(await field.inputValue(), "Half a thought", "the words are kept in this session");
        await update.getByRole("button", { name: "Don't save update", exact: true }).click();
        await update.waitFor({ state: "detached" });
        await page.getByRole("button", { name: "Add private update", exact: true }).click();
        await update.waitFor();
        assert.equal(await field.inputValue(), "", "the named safe choice lets the words go");
        // A long text: the field grows to 40 % of the sheet, then scrolls inside itself.
        await field.fill(Array.from({ length: 80 }, (_, i) => `Line ${i} of a long prayer update`).join("\n"));
        const grown = await field.evaluate((el) => ({ height: el.getBoundingClientRect().height, scrolls: el.scrollHeight > el.clientHeight + 1, screen: innerHeight }));
        assert.ok(grown.scrolls, "the field scrolls");
        assert.ok(grown.height <= grown.screen * 0.9 * 0.4 + 2, "the field stops at 40 % of the sheet: " + grown.height);
        assert.ok(grown.height >= grown.screen * 0.9 * 0.4 - 40, "and has grown to it: " + grown.height);
        await field.fill("");
        // From 600px it is a centred dialog 480px wide.
        await page.setViewportSize({ width: 700, height: 900 });
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
        const wide = await update.evaluate((d) => {
          const r = d.getBoundingClientRect();
          return { width: Math.round(r.width), centre: Math.round((r.left + r.right) / 2), top: r.top, bottom: r.bottom, radius: getComputedStyle(d).borderBottomLeftRadius };
        });
        await page.setViewportSize({ width: 375, height: 812 });
        assert.equal(wide.width, 480);
        assert.ok(Math.abs(wide.centre - 350) <= 1, "centred");
        assert.ok(wide.top > 0 && wide.bottom < 900, "floating, not on the edge");
        assert.notEqual(wide.radius, "0px");
        await page.keyboard.press("Escape");
        await update.waitFor({ state: "detached" });

        // An edit: the original is kept by name.
        const edit = page.getByRole("dialog", { name: "Edit your private prayer", exact: true });
        const original = (await prayers())[0].body;
        await page.getByRole("button", { name: "Edit", exact: true }).click();
        await edit.waitFor();
        assert.equal(await edit.getByLabel("Your prayer", { exact: true }).inputValue(), original, "prefilled");
        assert.deepEqual(await edit.getByRole("button").allInnerTexts(), ["Keep the original", "Save changes"]);
        await edit.getByLabel("Your prayer", { exact: true }).fill("Something else entirely.");
        await edit.getByRole("button", { name: "Keep the original", exact: true }).click();
        await edit.waitFor({ state: "detached" });
        assert.equal((await prayers())[0].body, original, "Keep the original changes nothing");
        await page.getByRole("button", { name: "Edit", exact: true }).click();
        await edit.waitFor();
        assert.equal(await edit.getByLabel("Your prayer", { exact: true }).inputValue(), original, "the discarded change does not come back");
        await edit.getByLabel("Your prayer", { exact: true }).fill("Please guide this ordinary day, and the next.");
        await edit.getByRole("button", { name: "Save changes", exact: true }).click();
        await edit.waitFor({ state: "detached" });
        assert.equal((await prayers())[0].body, "Please guide this ordinary day, and the next.");

        // Deleting asks first; Keep prayer is the safe way out.
        const del = page.getByRole("dialog", { name: "Delete this private prayer?", exact: true });
        await page.getByRole("button", { name: "Delete", exact: true }).click();
        await del.waitFor();
        assert.deepEqual(await del.getByRole("button").allInnerTexts(), ["Delete prayer", "Keep prayer"]);
        await del.getByRole("button", { name: "Keep prayer", exact: true }).click();
        await del.waitFor({ state: "detached" });
        assert.equal((await prayers()).length, 1);
        await page.getByRole("button", { name: "Delete", exact: true }).click();
        await del.waitFor();
        await page.keyboard.press("Escape");
        await del.waitFor({ state: "detached" });
        assert.equal((await prayers()).length, 1, "Escape keeps the prayer");
        await page.getByRole("button", { name: "Delete", exact: true }).click();
        await del.waitFor();
        await del.getByRole("button", { name: "Delete prayer", exact: true }).click();
        await del.waitFor({ state: "detached" });
        assert.equal((await prayers()).length, 0);
        assert.deepEqual(browserDialogs, [], "no browser pop-up appeared");
      } finally {
        page.off("dialog", onDialog);
        await page.setViewportSize({ width: 375, height: 812 });
      }
    },
  );
  await check("typed journal edits persist after refresh", async () => {
    await go("/journal");
    await page.getByRole("button", { name: "New entry", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("A study note");
    await page.getByLabel("Type", { exact: true }).selectOption("study note");
    await page
      .getByLabel("Your words", { exact: true })
      .fill("A private observation.");
    await page.getByRole("button", { name: "Close entry", exact: true }).click();
    await page.reload();
    await page
      .getByRole("button", { name: /A study note.*study note/s })
      .waitFor();
    await page
      .getByRole("searchbox", { name: "Search private journal" })
      .fill("private observation");
    assert.equal(await page.locator("main ul.group-list button.list-row").count(), 1);
  });
  await check(
    "deleting a journal entry asks in the app's own dialog: Keep entry, Escape and the backdrop keep it, Delete entry removes it, focus comes back (UI-SPEC A15)",
    async () => {
      const browserDialogs = [];
      const onDialog = (d) => {
        browserDialogs.push(d.type());
        void d.dismiss();
      };
      page.on("dialog", onDialog);
      const entries = () =>
        page.evaluate(() => JSON.parse(localStorage.getItem("hfg-daily-walk:v3")).entries.map((e) => e.title));
      const dialog = page.getByRole("dialog", { name: "Delete this private entry?", exact: true });
      const trigger = page.getByRole("button", { name: "Delete entry", exact: true });
      const focusedText = () => page.evaluate(() => document.activeElement?.textContent?.trim());
      try {
        await go("/journal");
        await page.getByRole("button", { name: "New entry", exact: true }).click();
        await page.getByLabel("Title", { exact: true }).fill("Entry for the dialog check");
        await trigger.click();
        await dialog.waitFor();
        assert.equal(
          await dialog.getByText("It is removed from this device. This cannot be undone.", { exact: true }).count(),
          1,
        );
        assert.deepEqual(await dialog.getByRole("button").allInnerTexts(), ["Delete entry", "Keep entry"]);
        assert.equal(await dialog.getByRole("button", { name: "Cancel" }).count(), 0, "no button says only Cancel");
        assert.equal(await focusedText(), "Delete entry", "focus moves into the dialog, onto the action first");
        assert.ok(await page.evaluate(() => document.activeElement.closest("dialog") !== null));
        // The safe choice by name.
        await dialog.getByRole("button", { name: "Keep entry", exact: true }).click();
        await dialog.waitFor({ state: "detached" });
        assert.ok((await entries()).includes("Entry for the dialog check"), "Keep entry keeps the entry");
        assert.equal(
          await page.evaluate(() => document.activeElement.closest("article") !== null && document.activeElement.textContent.trim()),
          "Delete entry",
          "focus returns to the control that opened the dialog",
        );
        // Escape is the safe choice.
        await trigger.click();
        await dialog.waitFor();
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
        assert.ok((await entries()).includes("Entry for the dialog check"), "Escape keeps the entry");
        assert.equal(await focusedText(), "Delete entry");
        // So is a tap on the dimmed page behind it.
        await trigger.click();
        await dialog.waitFor();
        await page.mouse.click(4, 4);
        await dialog.waitFor({ state: "detached" });
        assert.ok((await entries()).includes("Entry for the dialog check"), "the backdrop keeps the entry");
        // The action removes it; the control that opened the dialog is gone, so focus goes to the page's main region.
        await trigger.click();
        await dialog.waitFor();
        await dialog.getByRole("button", { name: "Delete entry", exact: true }).click();
        await dialog.waitFor({ state: "detached" });
        assert.ok(!(await entries()).includes("Entry for the dialog check"), "Delete entry removes the entry");
        assert.equal(await page.evaluate(() => document.activeElement?.id), "main");
        assert.deepEqual(browserDialogs, [], "no browser pop-up appeared");
      } finally {
        page.off("dialog", onDialog);
      }
    },
  );
  await check(
    "Recover older data asks in the app's own dialog; Escape and Keep things as they are leave the data alone",
    async () => {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", acceptDownloads: true });
      // The first load of this profile finds a stored state it cannot read, which is what offers the recovery.
      await c.addInitScript(() => {
        if (!sessionStorage.getItem("seeded")) {
          localStorage.setItem("hfg-daily-walk:v3", "not json");
          sessionStorage.setItem("seeded", "1");
        }
      });
      const p = await c.newPage();
      p.setDefaultTimeout(10000);
      const browserDialogs = [];
      p.on("dialog", (d) => {
        browserDialogs.push(d.type());
        void d.dismiss();
      });
      try {
        await p.goto(base + "/settings");
        await p.locator("main h1").waitFor();
        const trigger = p.getByRole("button", { name: "Recover older data", exact: true });
        assert.equal(await p.getByRole("button", { name: /Recover legacy/ }).count(), 0, "the old button name is gone");
        assert.equal(await trigger.isDisabled(), true, "recovery waits for the backup");
        await p.getByRole("button", { name: "Export private backup", exact: true }).click();
        await p.waitForFunction(() => {
          const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Recover older data");
          return b && !b.disabled;
        });
        const dialog = p.getByRole("dialog", { name: "Recover older data?", exact: true });
        await trigger.click();
        await dialog.waitFor();
        assert.equal(
          await dialog.locator("p").innerText(),
          "We keep a copy of your current data, then bring back anything an older version of the app saved on this device. If there is nothing older, you start fresh.",
        );
        assert.deepEqual(await dialog.getByRole("button").allInnerTexts(), ["Recover older data", "Keep things as they are"]);
        assert.ok(!/v3|v2|v1/.test(await dialog.innerText()), "no version numbers in the dialog");
        await p.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
        assert.equal(await p.evaluate(() => localStorage.getItem("hfg-daily-walk:v3")), "not json", "Escape recovers nothing");
        assert.equal(
          await p.evaluate(() => document.activeElement?.textContent?.trim()),
          "Recover older data",
          "focus returns to the control that opened the dialog",
        );
        await trigger.click();
        await dialog.waitFor();
        await dialog.getByRole("button", { name: "Keep things as they are", exact: true }).click();
        await dialog.waitFor({ state: "detached" });
        assert.equal(await p.evaluate(() => localStorage.getItem("hfg-daily-walk:v3")), "not json", "Keep things as they are recovers nothing");
        await trigger.click();
        await dialog.waitFor();
        await dialog.getByRole("button", { name: "Recover older data", exact: true }).click();
        await dialog.waitFor({ state: "detached" });
        await p.waitForFunction(() => localStorage.getItem("hfg-daily-walk:v3") !== "not json");
        assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem("hfg-daily-walk:v3")).version), 3);
        assert.deepEqual(browserDialogs, [], "no browser pop-up appeared");
      } finally {
        await c.close();
      }
    },
  );
  await check(
    "all 15 topic journeys are browsable and progress is saved",
    async () => {
      await go("/grow");
      assert.equal(await page.locator("main ul.group-list button.list-row").count(), 15);
      await page
        .getByRole("button", { name: /Walking with God through anxiety/ })
        .click();
      await page
        .getByRole("button", { name: "Complete this day", exact: true })
        .click();
      const s = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("hfg-daily-walk:v3")),
      );
      assert.deepEqual(s.devotionalProgress.anxiety, [0]);
      await page.reload();
      await page.getByRole("button", { name: "Day 2", exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Day 2", exact: true })
          .getAttribute("aria-pressed"),
        "true",
        "direct refresh resumes the next unfinished day",
      );
      // The in-progress journey is reached from You, Grow (Today no longer carries a quick link to it).
      await go("/grow/anxiety");
      assert.equal(
        await page
          .getByRole("button", { name: "Day 2", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
    },
  );
  await check(
    "giving verifies external destination and guest support cannot publish",
    async () => {
      await go("/give");
      await page
        .getByRole("button", { name: "Learn about this cause" })
        .first()
        .click();
      await page
        .getByRole("button", { name: "Give through the official provider" })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      assert.equal(
        await dialog
          .getByRole("link", { name: "Continue to provider" })
          .getAttribute("href"),
        "https://secure.givewell.org/",
      );
      const checkoutLink = dialog.getByRole("link", {
        name: "Continue to provider",
      });
      assert.equal(await checkoutLink.getAttribute("target"), "_blank");
      assert.match(await checkoutLink.getAttribute("rel"), /noopener/);
      assert.match(await dialog.innerText(), /secure.givewell.org/);
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await dialog.evaluate(
            (d) =>
              d.matches(":modal") &&
              (d.contains(document.activeElement) ||
                document.activeElement === document.body),
          ),
          true,
          "native modal prevents background controls receiving focus (browser chrome is allowed)",
        );
      }
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page
        .getByRole("button", { name: "My requests", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("button", {
            name: "Submit for manual review",
            exact: true,
          })
          .count(),
        0,
      );
    },
  );
  await check(
    "You, Appearance: theme and Lamplight apply at once, survive a reload, and Automatic follows the device",
    async () => {
      // The row on You names the current choice; Settings no longer has a Theme select.
      await go("/you");
      const row = page.getByRole("link", { name: /^Appearance/ });
      assert.equal(await row.locator(".list-row-value").innerText(), "Cover and story, Automatic");
      assert.equal(await row.getAttribute("href"), "/settings/appearance");
      await go("/settings");
      assert.equal(await page.getByLabel("Theme", { exact: true }).count(), 0, "no Theme select in Settings");
      await go("/settings/appearance");
      assert.equal(await page.locator("main h1").innerText(), "Appearance");
      const themes = page.getByRole("radiogroup", { name: "Theme", exact: true });
      const lamplight = page.getByRole("radiogroup", { name: "Lamplight", exact: true });
      assert.deepEqual(await themes.getByRole("radio").allInnerTexts(), ["Cover and story", "Marked page"]);
      assert.deepEqual(await lamplight.getByRole("radio").allInnerTexts(), ["Automatic", "On", "Off"]);
      assert.equal(await themes.getByRole("radio", { name: "Cover and story" }).getAttribute("aria-checked"), "true");
      assert.equal(await lamplight.getByRole("radio", { name: "Automatic" }).getAttribute("aria-checked"), "true");
      assert.equal(await page.getByRole("button", { name: /save/i }).count(), 0, "no Save button");
      assert.ok(
        await page
          .getByText("Lamplight dims the page to warm browns for reading at night. Automatic follows your device.", { exact: true })
          .isVisible(),
      );
      // The tiles are at least 152 x 176 and the segments 44px tall.
      for (const tile of await themes.getByRole("radio").all()) {
        const box = await tile.boundingBox();
        assert.ok(box.width >= 152 && box.height >= 176, "tile size " + JSON.stringify(box));
      }
      for (const segment of await lamplight.getByRole("radio").all())
        assert.ok((await segment.boundingBox()).height >= 43.9, "segment is 44px tall");
      // Choosing applies at once, with no Save.
      await themes.getByRole("radio", { name: "Marked page" }).click();
      await lamplight.getByRole("radio", { name: "On", exact: true }).click();
      const seen = () =>
        page.evaluate(() => ({
          look: document.documentElement.dataset.look,
          mode: document.documentElement.dataset.mode,
          color: getComputedStyle(document.body).color,
          background: getComputedStyle(document.body).backgroundColor,
          stored: [localStorage.getItem("hfg-look"), localStorage.getItem("hfg-lamplight")],
          themeColor: document.querySelector('meta[name="theme-color"]').getAttribute("content"),
        }));
      const marked = { look: "marked", mode: "lamplight", color: "rgb(246, 240, 231)", background: "rgb(26, 18, 14)", stored: ["marked", "on"], themeColor: "#1A120E" };
      assert.deepEqual(await seen(), marked, "Marked page and Lamplight On apply at once");
      assert.equal(await themes.getByRole("radio", { name: "Marked page" }).getAttribute("aria-checked"), "true");
      await page.reload();
      await page.locator("main h1").waitFor();
      assert.deepEqual(await seen(), marked, "both choices survive a reload");
      assert.equal(await lamplight.getByRole("radio", { name: "On", exact: true }).getAttribute("aria-checked"), "true");
      // The old key is not written any more.
      assert.equal(await page.evaluate(() => localStorage.getItem("hfg-appearance")), null);
      // Arrow keys move the choice within a group, and only the chosen option is in the Tab order.
      await lamplight.getByRole("radio", { name: "On", exact: true }).focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await lamplight.getByRole("radio", { name: "Off", exact: true }).getAttribute("aria-checked"), "true");
      assert.equal(await page.evaluate(() => document.activeElement.textContent), "Off");
      assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), "light");
      assert.deepEqual(
        await lamplight.getByRole("radio").evaluateAll((list) => list.map((r) => r.tabIndex)),
        [-1, -1, 0],
      );
      // Automatic follows the device while the app is open, and says what it does now.
      await themes.getByRole("radio", { name: "Cover and story" }).click();
      await lamplight.getByRole("radio", { name: "Automatic" }).click();
      await page.emulateMedia({ colorScheme: "light" });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.mode), "light");
      assert.equal(await page.getByRole("status").filter({ hasText: "Off now" }).innerText(), "Off now, because your device is set to light.");
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(() => document.documentElement.dataset.mode === "lamplight");
      assert.equal(await page.getByRole("status").filter({ hasText: "On now" }).innerText(), "On now, because your device is set to dark.");
      assert.equal(await page.evaluate(() => document.documentElement.dataset.look), "cover");
      // On and Off say nothing about the device.
      await lamplight.getByRole("radio", { name: "Off", exact: true }).click();
      assert.equal(await page.locator("p.appearance-now").innerText(), "");
      // Back to the state the other checks expect: Cover and story, Automatic, a light device.
      await lamplight.getByRole("radio", { name: "Automatic" }).click();
      await page.emulateMedia({ colorScheme: "light" });
      await page.waitForFunction(() => document.documentElement.dataset.mode === "light");
    },
  );
  await check(
    "a v3 state saved before plan 04 loads without a recovery notice, and the old appearance key moves to hfg-lamplight once",
    async () => {
      const c = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
      const p = await c.newPage();
      p.setDefaultTimeout(10000);
      try {
        await p.goto(base + "/");
        await p.locator("main h1").waitFor();
        // Make the stored state look like one saved before this plan: no lamplight, shelf or lastChapter, theme dark.
        await p.evaluate(() => {
          const state = JSON.parse(localStorage.getItem("hfg-daily-walk:v3"));
          delete state.lamplight;
          delete state.shelf;
          delete state.lastChapter;
          state.theme = "dark";
          localStorage.setItem("hfg-daily-walk:v3", JSON.stringify(state));
          localStorage.removeItem("hfg-lamplight");
          localStorage.setItem("hfg-appearance", "dark");
        });
        await p.goto(base + "/settings");
        await p.locator("main h1").waitFor();
        await p.waitForFunction(() => localStorage.getItem("hfg-lamplight") === "on");
        const seen = await p.evaluate(() => ({
          mode: document.documentElement.dataset.mode,
          old: localStorage.getItem("hfg-appearance"),
          recovery: Object.keys(localStorage).filter((key) => key.includes(":recovery:")),
          text: document.querySelector("main").innerText,
        }));
        assert.equal(seen.mode, "lamplight", "the old dark choice still applies");
        assert.equal(seen.old, null, "the old key is removed");
        assert.deepEqual(seen.recovery, [], "no recovery copy was written");
        assert.ok(!/needed recovery|Recover legacy/.test(seen.text), "no recovery notice is shown");
        // Run again: the choice stays, nothing new appears.
        await p.reload();
        await p.locator("main h1").waitFor();
        assert.equal(await p.evaluate(() => localStorage.getItem("hfg-lamplight")), "on");
      } finally {
        await c.close();
      }
    },
  );
  await check(
    "Lamplight notice: says why, is announced once without moving focus, offers Keep or Turn off, steps aside, and never shows when the reader chose On or Off",
    async () => {
      const sentence = "Lamplight is on, because your device is set to dark.";
      const turnedOff = "Lamplight is off. You can turn it on in You, Appearance.";
      // A new context per case: nothing stored unless the case presets it (only when absent, so a reload keeps
      // what the app wrote). The status region is watched from the first moment it exists.
      async function withNotice(options, run) {
        const { store = {}, scheme = "dark", width = 390, path = "/" } = options;
        const c = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: scheme, serviceWorkers: "block" });
        const p = await c.newPage();
        p.setDefaultTimeout(10000);
        await p.addInitScript((pairs) => {
          for (const [key, value] of pairs) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
          window.__status = [];
          let last;
          new MutationObserver(() => {
            const region = document.getElementById("lamplight-status");
            if (!region) return;
            if (region.textContent !== last) {
              last = region.textContent;
              window.__status.push(last);
            }
          }).observe(document, { childList: true, subtree: true, characterData: true });
        }, Object.entries(store));
        try {
          await p.goto(base + path);
          await p.locator("main h1").waitFor();
          await run(p);
        } finally {
          await c.close();
        }
      }
      const card = (p) => p.getByRole("region", { name: "Lamplight", exact: true });
      const noticeKey = (p) => p.evaluate(() => localStorage.getItem("hfg-lamplight-notice"));
      // Longer than the notice's own start delay, so "never" means never.
      const settle = (p) => p.waitForTimeout(1000);

      // Shows with the sentence, announced once through the pre-rendered region, focus untouched, 44px buttons.
      await withNotice({}, async (p) => {
        const focusBefore = await p.evaluate(() => document.activeElement?.tagName);
        await card(p).waitFor();
        assert.equal(await card(p).locator("p").innerText(), sentence);
        assert.deepEqual(await p.evaluate(() => window.__status), ["", sentence], "the region exists empty first, then holds the sentence once");
        assert.equal(await p.locator("#lamplight-status").getAttribute("aria-live"), "polite");
        assert.equal(await p.locator("#lamplight-status").getAttribute("role"), "status");
        assert.equal(await p.evaluate(() => document.activeElement?.tagName), focusBefore, "focus is not moved");
        assert.equal(await card(p).evaluate((el) => el.contains(document.activeElement)), false);
        assert.deepEqual(await card(p).getByRole("button").allInnerTexts(), ["Keep Lamplight", "Turn off"]);
        for (const button of await card(p).getByRole("button").all())
          assert.ok((await button.boundingBox()).height >= 43.9, "button is 44px tall");
        assert.equal(await noticeKey(p), '{"shown":1,"done":false}', "one showing is counted");
        assert.equal(await p.evaluate(() => document.documentElement.dataset.mode), "lamplight");
        // Above the tab bar, 20px from the edges, nothing covered, nothing wider than the screen.
        const geometry = await p.evaluate(() => {
          const box = (el) => el.getBoundingClientRect();
          const c = box(document.querySelector(".lamplight-notice"));
          return {
            card: { left: c.left, right: c.right, bottom: c.bottom, top: c.top },
            bar: box(document.querySelector("nav.tabbar")).top,
            width: innerWidth,
            scrolls: document.documentElement.scrollWidth > innerWidth,
            padding: parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom),
            variable: document.documentElement.style.getPropertyValue("--notice-h"),
          };
        });
        assert.equal(geometry.card.left, 20);
        assert.equal(geometry.width - geometry.card.right, 20);
        assert.ok(geometry.card.bottom <= geometry.bar - 11.9, "12px above the tab bar: " + JSON.stringify(geometry));
        assert.equal(geometry.scrolls, false);
        assert.match(geometry.variable, /^\d+px$/);
        // Main's bottom padding grows by the card while it shows, and shrinks back after.
        await card(p).getByRole("button", { name: "Keep Lamplight" }).click();
        const after = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom));
        assert.ok(geometry.padding - after >= geometry.card.bottom - geometry.card.top, "padding grew by at least the card's height");
        assert.equal(await p.evaluate(() => document.documentElement.style.getPropertyValue("--notice-h")), "");
        assert.deepEqual(await p.evaluate(() => window.__status), ["", sentence, ""], "the region is emptied when the card closes");
      });

      // Turn off: Light at once, the key written, the second sentence and one button; gone after a reload.
      await withNotice({}, async (p) => {
        await card(p).waitFor();
        await card(p).getByRole("button", { name: "Turn off" }).click();
        assert.equal(await p.evaluate(() => document.documentElement.dataset.mode), "light");
        assert.equal(await p.evaluate(() => localStorage.getItem("hfg-lamplight")), "off");
        assert.equal(await card(p).locator("p").innerText(), turnedOff);
        assert.deepEqual(await card(p).getByRole("button").allInnerTexts(), ["Hide notice"]);
        assert.equal((await p.evaluate(() => window.__status)).at(-1), turnedOff, "the second sentence is announced too");
        assert.equal(await p.evaluate(() => document.activeElement?.textContent), "Hide notice", "the pressed button's place is taken, focus is not lost");
        assert.equal(await noticeKey(p), '{"shown":1,"done":true}');
        await p.reload();
        await p.locator("main h1").waitFor();
        await settle(p);
        assert.equal(await card(p).count(), 0, "no card after a reload");
      });
      await withNotice({}, async (p) => {
        await card(p).waitFor();
        await card(p).getByRole("button", { name: "Turn off" }).click();
        await card(p).getByRole("button", { name: "Hide notice" }).click();
        assert.equal(await card(p).count(), 0);
        assert.equal(await p.evaluate(() => document.documentElement.dataset.mode), "light");
      });
      // After Turn off the card also leaves on the next navigation.
      await withNotice({}, async (p) => {
        await card(p).waitFor();
        await card(p).getByRole("button", { name: "Turn off" }).click();
        await card(p).getByRole("button", { name: "Hide notice" }).waitFor();
        await p.getByRole("link", { name: "Bible", exact: true }).click();
        await card(p).waitFor({ state: "detached" });
      });

      // Keep closes, keeps Automatic, and a reload shows nothing.
      await withNotice({}, async (p) => {
        await card(p).waitFor();
        await card(p).getByRole("button", { name: "Keep Lamplight" }).click();
        assert.equal(await card(p).count(), 0);
        assert.equal(await noticeKey(p), '{"shown":1,"done":true}');
        assert.equal(await p.evaluate(() => document.documentElement.dataset.mode), "lamplight", "Lamplight stays on");
        assert.equal(await p.evaluate(() => localStorage.getItem("hfg-lamplight")), "auto", "the setting stays Automatic");
        await p.reload();
        await p.locator("main h1").waitFor();
        await settle(p);
        assert.equal(await card(p).count(), 0);
      });

      // Escape acts only while focus is inside the card, closes it and leaves it unanswered.
      await withNotice({}, async (p) => {
        await card(p).waitFor();
        await p.getByRole("link", { name: "Pray", exact: true }).focus();
        await p.keyboard.press("Escape");
        assert.equal(await card(p).count(), 1, "Escape elsewhere does not dismiss the notice");
        await card(p).getByRole("button", { name: "Keep Lamplight" }).focus();
        await p.keyboard.press("Escape");
        assert.equal(await card(p).count(), 0);
        assert.equal(await noticeKey(p), '{"shown":1,"done":false}', "shown 1, still unanswered");
        await p.waitForFunction(() => document.activeElement?.closest("nav.tabbar"));
        assert.equal(await p.evaluate(() => document.documentElement.dataset.mode), "lamplight");
      });
      // Unanswered and under three showings, it comes back at the next start.
      await withNotice({ store: { "hfg-lamplight-notice": '{"shown":2,"done":false}' } }, async (p) => {
        await card(p).waitFor();
        assert.equal(await noticeKey(p), '{"shown":3,"done":false}');
      });

      // Three showings are the most there are; an answer ends it; unreadable values count as none.
      await withNotice({ store: { "hfg-lamplight-notice": '{"shown":3,"done":false}' } }, async (p) => {
        await settle(p);
        assert.equal(await card(p).count(), 0, "after three showings");
      });
      await withNotice({ store: { "hfg-lamplight-notice": '{"shown":0,"done":true}' } }, async (p) => {
        await settle(p);
        assert.equal(await card(p).count(), 0, "after an answer");
      });
      await withNotice({ store: { "hfg-lamplight-notice": "garbage" } }, async (p) => {
        await card(p).waitFor();
        assert.equal(await noticeKey(p), '{"shown":1,"done":false}');
      });

      // Never when the reader chose On or Off, and nothing is written about the notice then.
      for (const choice of ["on", "off"]) {
        await withNotice({ store: { "hfg-lamplight": choice } }, async (p) => {
          await settle(p);
          assert.equal(await card(p).count(), 0, "Lamplight " + choice);
          assert.equal(await noticeKey(p), null);
          assert.deepEqual(await p.evaluate(() => window.__status), [""], "the region stayed empty");
        });
      }
      // Nor on a light device at start.
      await withNotice({ scheme: "light" }, async (p) => {
        await settle(p);
        assert.equal(await card(p).count(), 0);
        // The device switches to dark while the app is open: the card appears, and closes silently when it turns light.
        await p.emulateMedia({ colorScheme: "dark" });
        await card(p).waitFor();
        assert.equal(await p.evaluate(() => document.documentElement.dataset.mode), "lamplight");
        assert.equal(await noticeKey(p), '{"shown":1,"done":false}');
        await p.emulateMedia({ colorScheme: "light" });
        await card(p).waitFor({ state: "detached" });
        assert.equal(await p.evaluate(() => document.documentElement.dataset.mode), "light");
        assert.equal((await p.evaluate(() => window.__status)).at(-1), "", "the region is empty again");
      });

      // Ignored: it stays while the reader stays, and goes when another tab is opened (for this session).
      await withNotice({}, async (p) => {
        await card(p).waitFor();
        await p.waitForTimeout(600);
        assert.equal(await card(p).count(), 1, "no timer takes it away");
        await p.getByRole("link", { name: "Bible", exact: true }).click();
        await card(p).waitFor({ state: "detached" });
        assert.equal(await noticeKey(p), '{"shown":1,"done":false}');
        await p.getByRole("link", { name: "Today", exact: true }).click();
        await settle(p);
        assert.equal(await card(p).count(), 0, "it does not come back during the session");
      });

      // Large text on a narrow screen: the card stacks, stays above the tab bar and the page does not scroll sideways.
      await withNotice({ width: 320 }, async (p) => {
        await card(p).waitFor();
        await p.evaluate(() => {
          document.documentElement.style.fontSize = "34px";
          window.dispatchEvent(new Event("resize"));
        });
        const geometry = await p.evaluate(() => {
          const c = document.querySelector(".lamplight-notice").getBoundingClientRect();
          return {
            bottom: c.bottom,
            left: c.left,
            right: c.right,
            bar: document.querySelector("nav.tabbar").getBoundingClientRect().top,
            scrolls: document.documentElement.scrollWidth > innerWidth,
            width: innerWidth,
          };
        });
        assert.ok(geometry.bottom <= geometry.bar, "above the tab bar at 200 % text: " + JSON.stringify(geometry));
        assert.ok(geometry.left >= 0 && geometry.right <= geometry.width);
        assert.equal(geometry.scrolls, false);
      });
    },
  );
  await check(
    "five tabs are links with aria-current; no brand header or settings heart; /more lands on /you; You shows its sections",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await go("/");
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      assert.equal(await nav.count(), 1, "one main navigation");
      assert.deepEqual(await nav.getByRole("link").allInnerTexts(), ["Today", "Bible", "Pray", "Community", "You"]);
      assert.equal(await nav.getByRole("button").count(), 0, "tabs are links, not buttons");
      const hrefs = await nav.getByRole("link").evaluateAll((list) => list.map((a) => a.getAttribute("href")));
      assert.deepEqual(hrefs, ["/", "/bible", "/pray", "/community", "/you"]);
      assert.equal(await page.locator("header.brand, .brand-name").count(), 0, "no wordmark-and-slogan header");
      assert.equal(await page.getByRole("button", { name: "Open settings" }).count(), 0, "no heart button that opens settings");
      assert.equal(await page.getByText("JESUS AT THE CENTER").count(), 0, "no slogan row");
      // The selected tab is the only one marked, for the route and for the screens pushed from it.
      const selected = async () => nav.locator('a[aria-current="page"]').allInnerTexts();
      for (const [path, tab] of [
        ["/", "Today"],
        ["/bible/psalms/23", "Bible"],
        ["/pray", "Pray"],
        ["/community", "Community"],
        ["/community/circles", "Community"],
        ["/you", "You"],
        ["/profile", "You"],
        ["/settings", "You"],
        ["/settings/reminders", "You"],
        ["/my-walk", "You"],
        ["/journal", "You"],
        ["/grow", "You"],
        ["/give", "You"],
        ["/shop", "You"],
      ]) {
        await go(path);
        assert.deepEqual(await selected(), [tab], path);
      }
      // A tap on a tab navigates without a page load, and the selection follows.
      await go("/");
      await nav.getByRole("link", { name: "Bible", exact: true }).click();
      await page.waitForURL("**/bible");
      assert.deepEqual(await selected(), ["Bible"]);
      await nav.getByRole("link", { name: "You", exact: true }).click();
      await page.waitForURL("**/you");
      assert.deepEqual(await selected(), ["You"]);
      // An old /more link is replaced by /you in place, so Back does not return to it.
      await page.goto(base + "/");
      await page.goto(base + "/more");
      await page.locator("main h1").first().waitFor();
      assert.equal(new URL(page.url()).pathname, "/you");
      assert.equal(await page.locator("main h1").innerText(), "You");
      await page.goBack();
      assert.equal(new URL(page.url()).pathname, "/", "Back from /you returns to where the old link was opened, not to /more");
      // The sub-path allowlist: anything else is not found.
      await go("/settings/other");
      assert.equal(await page.locator("main h1").innerText(), "Page not found");
      // You: the sections of UI-SPEC A12, in order, and one way to each screen.
      await go("/you");
      assert.deepEqual(await page.locator("main h2").allInnerTexts(), ["Your walk", "Settings", "Give and resources", "About"]);
      assert.match(await page.locator("main").innerText(), /Sign in\s+Join the community and keep your account safe\./);
      assert.match(await page.locator("main").innerText(), /Days walked\s+\d+/);
      assert.match(await page.locator("main").innerText(), /Daily reminder\s+Off/);
      assert.match(await page.locator("main").innerText(), /Scripture: World English Bible, public domain\./);
      for (const [name, path] of [
        ["Sign in", "/profile"],
        ["My Walk", "/my-walk"],
        ["Journal", "/journal"],
        ["Grow", "/grow"],
        ["Daily rhythm", "/settings"],
        ["Daily reminder", "/settings/reminders"],
        ["Privacy and your data", "/settings#privacy"],
        ["Give", "/give"],
        ["Resources", "/shop"],
      ]) {
        const row = page.getByRole("link", { name: new RegExp("^" + name) }).first();
        assert.equal(await row.getAttribute("href"), path, name);
        const box = await row.boundingBox();
        assert.ok(box && box.height >= 52, name + " row is at least 52px tall");
      }
      assert.equal(await page.getByRole("link", { name: /^Privacy policy/ }).count(), 1, "the PR 27 legal links sit under About");
      // Account and Settings are named for what they are, with the sections of UI-SPEC A12.
      await go("/profile");
      assert.equal(await page.locator("main h1").innerText(), "Account");
      assert.ok((await page.locator("main h2").allInnerTexts()).includes("Account and privacy"));
      assert.equal(await page.getByText("daily walks completed").count(), 0, "the stats card left Account");
      await go("/settings");
      assert.equal(await page.locator("main h1").innerText(), "Settings");
      const settingsSections = await page.locator("main h2").allInnerTexts();
      for (const name of ["Daily rhythm", "Privacy and your data", "About and legal"]) assert.ok(settingsSections.includes(name), name);
      assert.equal(await page.getByText("Your rhythm, your settings.").count(), 0);
      assert.equal(await page.getByText(/Browser storage\s+is unencrypted/).count(), 0, "the long privacy paragraph is gone");
      assert.equal(await page.getByText("Your journal, prayers and reading progress stay on this device.").count(), 1);
      // /settings/reminders opens the Reminders screen under a way back to You.
      await go("/settings/reminders");
      assert.equal(await page.locator("main h1").innerText(), "Daily reminder");
      // Privacy and your data is reached from You and scrolls into view.
      await go("/you");
      await page.getByRole("link", { name: /^Privacy and your data/ }).click();
      await page.waitForURL("**/settings#privacy");
      await page.locator("#privacy").waitFor();
    },
  );
  await check(
    "primary routes fit 375/390/768/1280px in both themes with accessible controls",
    async () => {
      for (const width of [375, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 812 });
        for (const [theme, lamplightKey] of [["light", "off"], ["dark", "on"]]) {
          // The next page load reads the key at first paint (UI-SPEC 3.3).
          await page.evaluate((value) => localStorage.setItem("hfg-lamplight", value), lamplightKey);
          for (const path of [
            "/",
            "/bible/psalms/23",
            "/pray",
            "/community",
            "/community/grief",
            "/my-walk",
            "/you",
            "/settings/reminders",
            "/grow",
            "/journal",
            "/give",
            "/profile",
            "/settings",
            "/shop",
          ]) {
            await go(path);
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            );
            assert.equal(overflow, false, path);
            assert.equal(
              await page
                .getByRole("navigation", { name: "Main navigation" })
                .getByRole("link")
                .count(),
              5,
            );
            const invalidControls = await page
              .locator(
                "button, input:not([type=checkbox]), textarea, select, label.check",
              )
              .evaluateAll((nodes) =>
                nodes
                  .filter(
                    (n) =>
                      n.getClientRects().length &&
                      // A verse number draws its 44px target with ::after (measured in tests/reader.browser.mjs).
                      !n.classList.contains("verse-num") &&
                      (n.getBoundingClientRect().height < 43.9 ||
                        !(
                          n.labels?.length ||
                          n.getAttribute("aria-label") ||
                          n.getAttribute("aria-labelledby") ||
                          n.textContent?.trim()
                        )),
                  )
                  .map((n) => ({
                    tag: n.tagName,
                    text: n.textContent?.trim(),
                    height: n.getBoundingClientRect().height,
                  })),
              );
            assert.deepEqual(
              invalidControls,
              [],
              `${path} ${width} ${theme}: labels and 44px targets`,
            );
            assert.equal(
              await page.locator("main h1").count(),
              1,
              `${path}: one primary heading`,
            );
          }
        }
      }
    },
  );
  await check(
    "tab bar: labels on one line inside the screen at 320/390/768/1280px, a 280px sidebar from 768px, content column at most 680px",
    async () => {
      const original = page.viewportSize();
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      const measure = () =>
        page.evaluate(() => {
          const plain = (b) => ({ left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height });
          const nav = document.querySelector("nav.tabbar");
          const bar = nav.getBoundingClientRect();
          const items = [...nav.querySelectorAll("a")].map((a) => {
            const label = a.querySelector(".tab-label");
            const style = getComputedStyle(label);
            return {
              text: label.textContent,
              box: plain(a.getBoundingClientRect()),
              labelBox: plain(label.getBoundingClientRect()),
              iconBox: plain(a.querySelector(".tab-icon").getBoundingClientRect()),
              line: parseFloat(style.lineHeight),
              size: parseFloat(style.fontSize),
            };
          });
          return {
            bar: plain(bar),
            overflows: nav.scrollWidth > nav.clientWidth,
            items,
            main: plain(document.querySelector("main").getBoundingClientRect()),
            width: innerWidth,
            height: innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
          };
        });
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 812 });
        for (const path of ["/", "/you", "/settings"]) {
          await go(path);
          const m = await measure();
          const where = `${path} at ${width}px`;
          assert.deepEqual(m.items.map((i) => i.text), ["Today", "Bible", "Pray", "Community", "You"], where);
          for (const item of m.items) {
            assert.ok(item.labelBox.height <= item.line + 0.5, `${where}: "${item.text}" is on one line (${item.labelBox.height} > ${item.line})`);
            assert.ok(item.box.left >= m.bar.left - 0.5 && item.box.right <= m.bar.right + 0.5, `${where}: "${item.text}" stays inside the bar`);
            assert.ok(item.box.height >= 44 && item.box.width >= 44, `${where}: "${item.text}" is at least 44px`);
          }
          assert.equal(m.overflows, false, `${where}: the bar does not overflow`);
          assert.ok(m.bar.left >= 0 && m.bar.right <= m.width + 0.5 && m.bar.bottom <= m.height + 0.5, `${where}: the bar is on screen`);
          assert.ok(m.scrollWidth <= m.width, `${where}: no sideways scroll`);
          if (width < 768) {
            assert.equal(Math.round(m.bar.height), 64, `${where}: the capsule is 64px tall`);
            assert.equal(Math.round(m.bar.left), 12, `${where}: 12px off the left edge`);
            assert.equal(Math.round(m.width - m.bar.right), 12, `${where}: 12px off the right edge`);
            assert.equal(Math.round(m.height - m.bar.bottom), 12, `${where}: 12px above the bottom edge`);
            assert.ok(m.items.every((i) => i.size === m.items[0].size && Math.abs(i.size - 13) < 0.1), `${where}: labels are 13px`);
            assert.ok(m.items.every((i) => Math.abs(i.iconBox.width - 24) < 0.6), `${where}: icons are 24px`);
            assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("nav.tabbar")).borderRadius), "999px");
            // The last content scrolls clear of the bar.
            assert.ok((await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom))) >= 88, `${where}: main pads its bottom`);
          } else {
            assert.equal(Math.round(m.bar.width), 280, `${where}: a 280px sidebar`);
            assert.equal(Math.round(m.bar.left), 0);
            assert.equal(await nav.getByRole("link").count(), 5, `${where}: five links in the sidebar`);
            for (let i = 1; i < m.items.length; i++) assert.ok(m.items[i].box.top >= m.items[i - 1].box.bottom - 0.5, `${where}: the items are stacked`);
            for (const item of m.items) assert.ok(item.iconBox.right <= item.labelBox.left + 0.5, `${where}: "${item.text}" label sits beside its icon`);
            assert.ok(m.main.left >= 280 && m.main.width <= 680.5, `${where}: the content column is at most 680px, right of the sidebar (${m.main.left}, ${m.main.width})`);
            const gapLeft = m.main.left - 280;
            const gapRight = m.width - m.main.right;
            assert.ok(Math.abs(gapLeft - gapRight) <= 40, `${where}: the column is centred in the rest (${gapLeft} / ${gapRight})`);
            assert.ok(m.main.width >= Math.min(680, m.width - 280 - 64) - 1, `${where}: the column uses the room it has`);
          }
          assert.equal(await nav.locator('a[aria-current="page"]').count(), 1, `${where}: one selected tab`);
        }
      }
      await page.setViewportSize(original);
    },
  );
  await check(
    "a long press on a tab shows its label at twice the size above it; a short tap navigates; Escape and release dismiss it",
    async () => {
      const original = page.viewportSize();
      await page.setViewportSize({ width: 390, height: 844 });
      await go("/pray");
      const nav = page.getByRole("navigation", { name: "Main navigation" });
      const community = nav.getByRole("link", { name: "Community", exact: true });
      const box = await community.boundingBox();
      const labelSize = await community.locator(".tab-label").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      assert.equal(await page.getByRole("tooltip").count(), 0, "no popover before a long press");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(700);
      const tip = page.getByRole("tooltip");
      await tip.waitFor();
      assert.equal(await tip.innerText(), "Community");
      assert.equal(await community.getAttribute("aria-describedby"), await tip.getAttribute("id"), "the tab is described by the popover");
      const tipBox = await tip.boundingBox();
      const tipSize = await tip.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(Math.abs(tipSize - 2 * labelSize) < 0.6, `the label is shown at twice its size (${tipSize} vs ${labelSize})`);
      assert.ok(tipBox.y + tipBox.height <= box.y, "the popover sits above the tab");
      assert.ok(tipBox.x >= 0 && tipBox.x + tipBox.width <= 390, "and inside the screen");
      await page.mouse.up();
      await tip.waitFor({ state: "detached" });
      assert.equal(new URL(page.url()).pathname, "/pray", "a long press does not navigate");
      // Even the first tab, whose centre is near the edge, keeps its popover on screen.
      const today = nav.getByRole("link", { name: "Today", exact: true });
      await today.dispatchEvent("contextmenu");
      await tip.waitFor();
      assert.equal(await tip.innerText(), "Today");
      const todayTip = await tip.boundingBox();
      assert.ok(todayTip.x >= 0 && todayTip.x + todayTip.width <= 390, "the popover of the first tab stays on screen");
      await page.keyboard.press("Escape");
      await tip.waitFor({ state: "detached" });
      assert.equal(new URL(page.url()).pathname, "/pray");
      // A short tap still navigates, and no popover remains.
      await community.click();
      await page.waitForURL("**/community");
      assert.equal(await page.getByRole("tooltip").count(), 0);
      await page.setViewportSize(original);
    },
  );
  await check(
    "text at 200 %: data-text=large, tab labels at most 16px on one line, a bar of at most 83px, the skip link off screen, no route scrolls sideways at 390 and 320px",
    async () => {
      const original = page.viewportSize();
      const routes = [
        "/",
        "/bible/psalms/23",
        "/pray",
        "/community",
        "/community/grief",
        "/my-walk",
        "/you",
        "/settings/reminders",
        "/grow",
        "/journal",
        "/give",
        "/profile",
        "/settings",
        "/shop",
      ];
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 812 });
        for (const path of routes) {
          await go(path);
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "34px";
            window.dispatchEvent(new Event("resize"));
          });
          await page.waitForFunction(() => document.documentElement.dataset.text === "large");
          const m = await page.evaluate(() => {
            const nav = document.querySelector("nav.tabbar");
            const bar = nav.getBoundingClientRect();
            return {
              labels: [...nav.querySelectorAll(".tab-label")].map((l) => ({ text: l.textContent, height: l.getBoundingClientRect().height, line: parseFloat(getComputedStyle(l).lineHeight), size: parseFloat(getComputedStyle(l).fontSize) })),
              icons: [...nav.querySelectorAll(".tab-icon")].map((i) => i.getBoundingClientRect().width),
              items: [...nav.querySelectorAll("a")].map((a) => a.getBoundingClientRect()).map((b) => ({ left: b.left, right: b.right })),
              bar: { left: bar.left, right: bar.right, height: bar.height },
              overflows: nav.scrollWidth > nav.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              width: innerWidth,
              skipBottom: document.querySelector(".skip-link").getBoundingClientRect().bottom,
            };
          });
          const where = `${path} at ${width}px, root 34px`;
          for (const l of m.labels) {
            assert.ok(l.size <= 16.01, `${where}: "${l.text}" is capped at 16px (${l.size})`);
            assert.ok(l.height <= l.line + 0.5, `${where}: "${l.text}" stays on one line`);
          }
          for (const w of m.icons) assert.ok(w <= 32.01, `${where}: icons are capped at 32px`);
          assert.ok(m.items.every((i) => i.left >= m.bar.left - 0.5 && i.right <= m.bar.right + 0.5), `${where}: items stay inside the bar`);
          assert.equal(m.overflows, false, `${where}: the bar does not overflow`);
          assert.ok(m.bar.height <= 83.5, `${where}: the bar is at most 83px tall (${m.bar.height})`);
          if (width < 360) assert.ok(m.bar.left <= 0.5 && m.bar.right >= m.width - 0.5, `${where}: below 360px the bar uses the full width`);
          assert.ok(m.scrollWidth <= m.width, `${where}: no sideways scroll (${m.scrollWidth} > ${m.width})`);
          assert.ok(m.skipBottom <= 0, `${where}: the skip link is outside the viewport (${m.skipBottom})`);
        }
      }
      await page.setViewportSize(original);
    },
  );
  await check(
    "safe areas: the top is padded once, the bar rides above the home indicator, the toolbar sticks below the notch, main clears the bar",
    async () => {
      const original = page.viewportSize();
      await page.setViewportSize({ width: 390, height: 844 });
      const session = await context.newCDPSession(page);
      try {
        await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
        await go("/settings");
        const first = await page.evaluate(() => {
          const top = (selector) => document.querySelector(selector).getBoundingClientRect().top;
          return {
            toolbarTop: top(".toolbar"),
            titleTop: top("main h1"),
            bar: document.querySelector("nav.tabbar").getBoundingClientRect().bottom,
            height: innerHeight,
            mainPad: parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom),
          };
        });
        assert.ok(first.toolbarTop >= 47 - 0.5, `the first bar starts below the notch (${first.toolbarTop})`);
        assert.ok(first.toolbarTop <= 47 + 0.5, `and is padded once, not twice (${first.toolbarTop})`);
        assert.ok(first.titleTop >= 47 + 52 - 0.5, "the large title follows the toolbar");
        assert.equal(Math.round(first.height - first.bar), 34, "the tab bar rides above the home indicator");
        assert.ok(first.mainPad >= 64 + 24 + 34 - 0.5, `main pads its bottom by the bar, a gap and the indicator (${first.mainPad})`);
        // Scrolled: the toolbar sticks just below the notch and turns into the floating bar.
        await page.evaluate(() => window.scrollTo(0, 300));
        await page.waitForFunction(() => document.querySelector(".toolbar")?.dataset.scrolled === "true");
        const stuck = await page.evaluate(() => document.querySelector(".toolbar").getBoundingClientRect().top);
        assert.ok(Math.abs(stuck - 47) <= 0.5, `the toolbar sticks below the notch (${stuck})`);
        // Every other screen's first element is below the notch too.
        for (const path of ["/", "/pray", "/community", "/bible/psalms/23"]) {
          await go(path);
          const heading = await page.evaluate(() => document.querySelector("main h1").getBoundingClientRect().top);
          assert.ok(heading >= 47, `${path}: the first heading starts below the notch (${heading})`);
        }
        // Landscape: the side safe areas push the content in.
        await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 21, left: 44, right: 44 } });
        await page.setViewportSize({ width: 700, height: 390 });
        await go("/you");
        const side = await page.evaluate(() => {
          const h = document.querySelector("main h1").getBoundingClientRect();
          const bar = document.querySelector("nav.tabbar").getBoundingClientRect();
          return { left: h.left, bar: bar.left, barRight: innerWidth - bar.right };
        });
        assert.ok(side.left >= 44 - 0.5, `content keeps clear of the left safe area (${side.left})`);
        assert.ok(side.bar >= 44 - 0.5 && side.barRight >= 44 - 0.5, "so does the tab bar");
      } finally {
        await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 0, left: 0, right: 0 } });
        await session.detach();
      }
      await page.setViewportSize(original);
    },
  );
  await check(
    "unknown routes and unavailable study context stay honest",
    async () => {
      await go("/grow/not-a-journey");
      await page.getByRole("heading", { name: "Journey not found" }).waitFor();
      await go("/unknown");
      assert.match(await page.locator("main").innerText(), /not found/i);
      await go("/bible/genesis/1?tab=context");
      // Genesis has no sourced note yet; only the labelled AI explanation is behind its own row.
      const sheet = page.getByRole("dialog", { name: "Around Genesis 1" });
      await sheet.waitFor();
      const sourced = sheet.locator('article[data-layer="sourced"]');
      await sourced.getByRole("heading", { name: "Context", exact: true }).waitFor();
      assert.match(
        await sourced.textContent(),
        /Context for this book is being written\..*A note appears here only once it names its sources\./s,
      );
      assert.equal(await sourced.locator("details, a").count(), 0);
      await sheet.getByRole("button", { name: "Back to Around Genesis 1", exact: true }).click();
      await sheet.locator('[data-layer-row="ai"]').filter({ hasNotText: "Loading…" }).click();
      const ai = sheet.locator('article[data-layer="ai"]');
      await ai.getByRole("heading", { name: /^AI explanation/ }).waitFor();
      assert.match(
        await ai.textContent(),
        /Written by an AI model.*It names no sources and can contain mistakes\./s,
      );
      await go("/bible/luke/17/36");
      assert.match(
        await page.locator("#verse-36").innerText(),
        /omitted|not included/i,
      );
    },
  );
  await check(
    "v1 browser migration avoids onboarding and preserves the private journal",
    async () => {
      const migrated = await browser.newContext();
      const p = await migrated.newPage();
      await p.addInitScript(() => {
        if (!localStorage.getItem("hfg-daily-walk:v1"))
          localStorage.setItem(
            "hfg-daily-walk:v1",
            JSON.stringify({
              version: 1,
              onboarded: true,
              goal: "peace-in-god",
              activePlan: "closer-to-god",
              installDismissed: true,
              journals: { "2026-10-05": "Preserved production-shaped journal" },
              completedDates: ["2026-10-04", "2026-10-05"],
              progress: {
                "closer-to-god": [0, 1],
                "consistent-in-the-word": [2],
                "peace-in-god": [3],
              },
            }),
          );
      });
      await p.goto(base);
      await p.locator("main h1").waitFor();
      assert.equal(
        await p
          .getByRole("heading", { name: "Welcome to your daily walk" })
          .count(),
        0,
      );
      await p.goto(base + "/journal");
      await p
        .getByRole("button", { name: /Preserved production-shaped journal/ })
        .waitFor();
      await p.reload();
      const s = await p.evaluate(() =>
        JSON.parse(localStorage.getItem("hfg-daily-walk:v3")),
      );
      assert.equal(s.local.activePlan, "closer-to-god");
      assert.deepEqual(s.local.completedDates, ["2026-10-04", "2026-10-05"]);
      assert.deepEqual(s.local.progress["closer-to-god"], [0, 1]);
      assert.equal(s.local.installDismissed, true);
      await migrated.close();
    },
  );
  await check(
    "full/unavailable/corrupt storage displays a recoverable state",
    async () => {
      for (const mode of ["full", "unavailable", "corrupt"]) {
        const c = await browser.newContext();
        const p = await c.newPage();
        await p.addInitScript((mode) => {
          if (mode === "corrupt")
            localStorage.setItem("hfg-daily-walk:v2", "original corrupt data");
          if (mode === "full")
            localStorage.setItem(
              "hfg-daily-walk:v1",
              JSON.stringify({
                version: 1,
                onboarded: true,
                journals: { "2026-10-05": "Readable quota-full journal" },
              }),
            );
          if (mode !== "corrupt")
            Storage.prototype.setItem = () => {
              throw new DOMException("Storage full", "QuotaExceededError");
            };
          if (mode === "unavailable")
            Storage.prototype.getItem = () => {
              throw new DOMException("Storage unavailable", "SecurityError");
            };
        }, mode);
        await p.goto(base + "/journal");
        await p.locator("main h1").waitFor();
        assert.match(await p.locator("body").innerText(), /storage|recovery/i);
        if (mode === "full")
          await p
            .getByRole("button", { name: /Readable quota-full journal/ })
            .waitFor();
        if (mode === "corrupt")
          assert.equal(
            await p.evaluate(() => localStorage.getItem("hfg-daily-walk:v2")),
            "original corrupt data",
          );
        await c.close();
      }
    },
  );
  await check("failed Scripture download offers a working retry", async () => {
    const c = await browser.newContext({ serviceWorkers: "block" });
    const p = await c.newPage();
    await p.route("**/bible/web.json", (route) =>
      route.fulfill({ status: 503, body: "Unavailable" }),
    );
    await p.goto(base + "/bible/romans/8/28");
    await p.getByRole("button", { name: "Try downloading again" }).waitFor();
    assert.equal(await p.getByText("The Bible could not be opened. Check your connection and try again.").count(), 1);
    await p.unroute("**/bible/web.json");
    await p.getByRole("button", { name: "Try downloading again" }).click();
    await p.locator("#verse-28").waitFor();
    await c.close();
  });
  await check(
    "installed static Bible and local journal reload offline",
    async () => {
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await page.reload();
      await page.waitForFunction(
        () => navigator.serviceWorker.controller !== null,
      );
      // Let the reloaded page finish its own fetches (such as /ai/luke.json) first, or going
      // offline makes them fail and they count as failures of this check.
      await page.waitForLoadState("networkidle");
      await context.setOffline(true);
      // AI explanations stay out of the installed cache by design (vite.config.ts,
      // docs/AI_EXPLANATIONS.md), so only that fetch may fail while Scripture still loads.
      const failedBefore = networkFailures.length;
      const errorsBefore = consoleErrors.length;
      const aiFailed = page.waitForEvent(
        "requestfailed",
        (r) => new URL(r.url()).pathname === "/ai/john.json",
      );
      const aiLogged = page.waitForEvent(
        "console",
        (m) => m.type() === "error" && m.location().url.endsWith("/ai/john.json"),
      );
      await go("/bible/john/3/16");
      await page.locator("#verse-16").waitFor();
      await Promise.all([aiFailed, aiLogged]);
      assert.deepEqual(networkFailures.splice(failedBefore), ["/ai/john.json"]);
      assert.deepEqual(consoleErrors.splice(errorsBefore), [
        "Failed to load resource: net::ERR_INTERNET_DISCONNECTED",
      ]);
      await go("/journal");
      await page.getByRole("button", { name: /A study note/ }).waitFor();
      await context.setOffline(false);
    },
  );
  await check("topic preferences stay local, following is explicit, aliases and invalid links are safe", async()=>{
    await go("/settings");
    await page.getByText("What are you walking through right now? · optional",{exact:true}).click();
    await page.getByRole("button",{name:"Grief",exact:true}).click();
    await page.reload();
    const state=await page.evaluate(()=>JSON.parse(localStorage.getItem("hfg-daily-walk:v3")));
    assert.deepEqual(state.privateTopics,["grief"]);assert.deepEqual(state.followedTopics,[]);
    await go("/community");await page.getByRole("link",{name:"Grief",exact:true}).click();
    await page.getByRole("button",{name:"Follow privately on this device",exact:true}).click();
    await page.reload();await page.getByRole("button",{name:"Unfollow topic",exact:true}).waitFor();
    assert.match(await page.locator("main").innerText(),/not configured/);
    assert.equal(await page.getByRole("button",{name:"Publish publicly",exact:true}).count(),0);
    await go("/community/sexual-temptation");await page.getByRole("heading",{name:"Temptation",exact:true}).waitFor();
    await go("/community/unknown");await page.getByRole("heading",{name:"Topic not found",exact:true}).waitFor();
    await go("/community/grief?thread=private-words");assert.match(await page.locator("main").innerText(),/not found/i);
    await go("/my-walk");assert.match(await page.locator("main").innerText(),/Grief/);
  });
  await check(
    "Community is one calm screen: large title, the sentence, a Circles row, five sub-tabs in one scrolling row, topics without the repeated subtitle, the original chat as a disclosure row (UI-SPEC A11)",
    async () => {
      try {
        await page.setViewportSize({ width: 320, height: 568 });
        await go("/community");
        assert.equal(await page.locator("main h1").count(), 1);
        assert.equal(await page.locator("main h1").innerText(), "Community");
        assert.equal(await page.locator("main h1").getAttribute("class"), "large-title");
        assert.equal(
          await page.getByText("Scripture, practical help and encouragement. Community experience and reputation are not verified expertise.", { exact: true }).count(),
          1,
        );
        const circles = page.getByRole("link", { name: "Circles", exact: true });
        assert.equal(await circles.getAttribute("href"), "/community/circles");
        assert.ok((await circles.evaluate((el) => el.getBoundingClientRect().height)) >= 52);
        // The five sections: one row that scrolls sideways and never wraps; the page itself does not.
        const row = page.getByRole("radiogroup", { name: "Community sections", exact: true });
        assert.deepEqual(await row.getByRole("radio").allInnerTexts(), ["Topics", "Following", "Saved", "Testimonies", "Community feed"]);
        const shape = await row.evaluate((el) => ({
          scrolls: el.scrollWidth > el.clientWidth + 1,
          overflowX: getComputedStyle(el).overflowX,
          tops: [...el.querySelectorAll('[role="radio"]')].map((r) => Math.round(r.getBoundingClientRect().top)),
          heights: [...el.querySelectorAll('[role="radio"]')].map((r) => r.getBoundingClientRect().height),
          page: document.documentElement.scrollWidth <= innerWidth + 1,
        }));
        assert.ok(shape.scrolls, "five sections need more than 320px");
        assert.equal(shape.overflowX, "auto");
        assert.equal(new Set(shape.tops).size, 1, "no section wraps onto a second line");
        for (const h of shape.heights) assert.ok(h >= 44, "section height " + h);
        assert.ok(shape.page, "the page does not scroll sideways");
        // The current section is brought into view; the edge shadow shows on the side with more to see.
        await row.getByRole("radio", { name: "Community feed", exact: true }).click();
        const seen = await row.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const q = el.querySelector('[aria-checked="true"]').getBoundingClientRect();
          return { inside: q.left >= r.left - 1 && q.right <= r.right + 1, label: el.querySelector('[aria-checked="true"]').textContent };
        });
        assert.equal(seen.label, "Community feed");
        assert.ok(seen.inside, "the chosen section is scrolled into view");
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await row.getByRole("radio", { name: "Topics", exact: true }).click();
        // Topics: a grouped list of rows, each only its name.
        const names = await page.locator('main .group a.list-row[href^="/community/"]:not([href="/community/circles"])').allInnerTexts();
        assert.equal(names.length, 8, "the eight launch topics");
        for (const name of names) assert.ok(!name.includes("·") && !name.includes("Scripture"), "no repeated subtitle: " + name);
        assert.equal((await page.locator("main").innerText()).includes("practical encouragement"), false);
        // The original chat and prayer wall is the last row, closed.
        const chat = page.locator("details.group-disclosure");
        assert.equal(await chat.locator("summary").innerText(), "Live chat and the original prayer wall");
        assert.equal(await chat.evaluate((el) => el.open), false);
        assert.ok((await chat.locator("summary").evaluate((el) => el.getBoundingClientRect().height)) >= 52);
        assert.equal(await page.evaluate(() => document.querySelector("main").lastElementChild.tagName), "DETAILS");
        // The Circles row goes to Circles and back.
        await circles.click();
        await page.waitForURL("**/community/circles");
        await page.goBack();
        await page.locator("main h1").waitFor();
        assert.equal(await page.locator("main h1").innerText(), "Community");
      } finally {
        await page.setViewportSize({ width: 375, height: 812 });
      }
    },
  );
  await check("path and private challenge progress survive leave, rejoin and reload",async()=>{
    await go("/grow");await page.locator("summary").filter({hasText:"Return to Scripture"}).click();
    await page.getByRole("button",{name:"Mark step complete",exact:true}).first().click();
    await page.locator("summary").filter({hasText:"Seven days in Scripture"}).click();
    await page.getByRole("button",{name:"Join challenge privately",exact:true}).click();
    await page.getByRole("button",{name:"Mark practice complete",exact:true}).first().click();
    await page.getByRole("button",{name:"Leave challenge",exact:true}).click();
    await page.reload();await page.locator("summary").filter({hasText:"Seven days in Scripture"}).click();
    await page.getByRole("button",{name:"Join challenge privately",exact:true}).click();
    assert.equal(await page.getByRole("button",{name:"Practice complete",exact:true}).isDisabled(),true);
    const state=await page.evaluate(()=>JSON.parse(localStorage.getItem("hfg-daily-walk:v3")));
    assert.deepEqual(state.pathProgress["return-to-scripture"],[0]);assert.deepEqual(state.challengeProgress["seven-days-in-scripture"],[0]);
  });
  await check("saved thread links persist locally and route through visibility checks",async()=>{
    const id="a0000000-0000-4000-8000-000000000001";
    await page.evaluate(id=>{const s=JSON.parse(localStorage.getItem("hfg-daily-walk:v3"));s.savedDiscussions=[id];s.savedDiscussionTopics={[id]:"grief"};localStorage.setItem("hfg-daily-walk:v3",JSON.stringify(s));},id);
    await go("/community");await page.getByRole("radio",{name:"Saved",exact:true}).click();
    await page.getByRole("link",{name:"Saved discussion · Grief",exact:true}).click();
    assert.equal(new URL(page.url()).searchParams.get("thread"),id);
    assert.match(await page.locator("main").innerText(),/not configured/);
    assert.equal(await page.locator("main > section:first-child article").count(),0);
  });
  await check("first paint reproduces baseline light flash and sets look, mode and theme-color before React",async()=>{
    const baseline=readFileSync("tests/fixtures/pre-expansion-index.html","utf8");
    const state=theme=>["hfg-daily-walk:v3",JSON.stringify({version:3,theme})];
    // JavaScript files are aborted, so only index.html's inline script can have set the attributes.
    const scenarios=[
      {name:"baseline index.html has no script",baseline:true,os:"dark",look:null,mode:null,color:"#F6F0E7"},
      {name:"nothing stored, light device",os:"light",look:"cover",mode:"light",color:"#F3F1EE"},
      {name:"nothing stored, dark device",os:"dark",look:"cover",mode:"lamplight",color:"#1A120E"},
      {name:"marked look, light device",os:"light",store:[["hfg-look","marked"]],look:"marked",mode:"light",color:"#FFFDF9"},
      {name:"marked look, dark device",os:"dark",store:[["hfg-look","marked"]],look:"marked",mode:"lamplight",color:"#1A120E"},
      {name:"unknown look value",os:"light",store:[["hfg-look","sepia"]],look:"cover",mode:"light",color:"#F3F1EE"},
      {name:"lamplight on, light device",os:"light",store:[["hfg-lamplight","on"]],look:"cover",mode:"lamplight",color:"#1A120E"},
      {name:"lamplight off, dark device",os:"dark",store:[["hfg-lamplight","off"]],look:"cover",mode:"light",color:"#F3F1EE"},
      {name:"lamplight auto, dark device",os:"dark",store:[["hfg-lamplight","auto"]],look:"cover",mode:"lamplight",color:"#1A120E"},
      {name:"old hfg-appearance dark, light device",os:"light",store:[["hfg-appearance","dark"]],look:"cover",mode:"lamplight",color:"#1A120E"},
      {name:"old hfg-appearance system, dark device",os:"dark",store:[["hfg-appearance","system"]],look:"cover",mode:"lamplight",color:"#1A120E"},
      {name:"old hfg-theme light, dark device",os:"dark",store:[["hfg-theme","light"]],look:"cover",mode:"light",color:"#F3F1EE"},
      {name:"saved v3 state with theme dark, light device",os:"light",store:[state("dark")],look:"cover",mode:"lamplight",color:"#1A120E"},
      {name:"saved v3 state with theme light, dark device",os:"dark",store:[state("light")],look:"cover",mode:"light",color:"#F3F1EE"},
      {name:"new key wins over the old ones",os:"light",store:[["hfg-lamplight","off"],["hfg-appearance","dark"]],look:"cover",mode:"light",color:"#F3F1EE"},
      {name:"unreadable saved state, dark device",os:"dark",store:[["hfg-daily-walk:v3","{not json"]],look:"cover",mode:"lamplight",color:"#1A120E"},
    ];
    for(const scenario of scenarios) {
      const c=await browser.newContext({colorScheme:scenario.os,serviceWorkers:"block"});const p=await c.newPage();
      if(scenario.store)await p.addInitScript(pairs=>{for(const [key,value] of pairs)localStorage.setItem(key,value);},scenario.store);
      await p.route("**/*.js",route=>route.abort());
      if(scenario.baseline) await p.route(base+"/",route=>route.fulfill({contentType:"text/html",body:baseline}));
      await p.goto(base,{waitUntil:"domcontentloaded"});
      const seen=await p.evaluate(()=>({look:document.documentElement.dataset.look??null,mode:document.documentElement.dataset.mode??null}));
      assert.deepEqual(seen,{look:scenario.look,mode:scenario.mode},scenario.name);
      assert.equal(await p.locator('meta[name="theme-color"]').getAttribute("content"),scenario.color,scenario.name+": theme-color");
      assert.equal(await p.locator("#root").innerText(),"");await c.close();
    }
    // Storage that throws must leave the defaults, not a blank page.
    const c=await browser.newContext({colorScheme:"dark",serviceWorkers:"block"});const p=await c.newPage();
    await p.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error("blocked");};});
    await p.route("**/*.js",route=>route.abort());
    await p.goto(base,{waitUntil:"domcontentloaded"});
    assert.deepEqual(await p.evaluate(()=>({look:document.documentElement.dataset.look,mode:document.documentElement.dataset.mode})),{look:"cover",mode:"lamplight"},"blocked storage: Cover and Automatic");
    await c.close();
  });
  await check("bundled faces and text size: fonts come from the app's own origin, only the active look's faces load, body text is 17px and follows the system size",async()=>{
    const origin=new URL(base).origin;
    const fontFiles=requests=>requests.filter(url=>/\.woff2?$/.test(new URL(url).pathname));
    const visit=async(look)=>{
      // The service worker would precache every face, so it is blocked to see which faces the page itself asks for.
      const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:"block",colorScheme:"light"});const p=await c.newPage();
      const requests=[];p.on("request",request=>requests.push(request.url()));
      if(look)await p.addInitScript(look=>localStorage.setItem("hfg-look",look),look);
      await p.goto(base+"/bible/john/3");await p.locator(".verse").first().waitFor();await p.evaluate(()=>document.fonts.ready);
      return {c,p,fonts:fontFiles(requests),requests};
    };
    const cover=await visit(null);
    assert.ok(cover.fonts.length>0,"font files were requested");
    for(const url of cover.requests.filter(url=>/\.(woff2?|ttf|otf)$/.test(new URL(url).pathname)||/fonts\.(googleapis|gstatic)/.test(url)))
      assert.equal(new URL(url).origin,origin,"font served from the app's own origin: "+url);
    assert.ok(cover.fonts.some(url=>/gelasio/i.test(url)),"Cover loads Gelasio");
    assert.ok(!cover.fonts.some(url=>/literata/i.test(url)),"Cover loads no Literata");
    assert.equal(await cover.p.evaluate(()=>getComputedStyle(document.body).fontSize),"17px");
    assert.equal(await cover.p.evaluate(()=>document.documentElement.dataset.text??null),null);
    // A text size of 200 %: the root grows to 34px and the large-text flag follows on resize.
    await cover.p.evaluate(()=>{document.documentElement.style.fontSize="34px";window.dispatchEvent(new Event("resize"));});
    assert.equal(await cover.p.evaluate(()=>document.documentElement.dataset.text),"large");
    await cover.p.evaluate(()=>{document.documentElement.style.fontSize="";window.dispatchEvent(new Event("resize"));});
    assert.equal(await cover.p.evaluate(()=>document.documentElement.dataset.text??null),null);
    await cover.c.close();
    const marked=await visit("marked");
    assert.ok(marked.fonts.some(url=>/literata/i.test(url)),"Marked loads Literata");
    assert.ok(!marked.fonts.some(url=>/gelasio/i.test(url)),"Marked loads no Gelasio");
    for(const url of marked.fonts)assert.equal(new URL(url).origin,origin,"font served from the app's own origin: "+url);
    assert.equal(await marked.p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue("--font-scripture").trim().startsWith("Literata")),true);
    await marked.c.close();
  });
  await check("actual account boundary isolates guest/A/B drafts and rejects stale Terms after token refresh (controlled SDK)",()=>checkAuthBoundary(browser,base));
  await check("account deletion flow (controlled SDK)",()=>checkProfile(browser,base));
  await check("topic voting preserves drafts and late publishing cannot erase a new topic draft (controlled SDK)",()=>checkTopicComposer(browser,base));
  await check("Circle SPA routes reload/back/forward and installed shell launches offline without a fake backend",async()=>{
    await go("/community/circles");await page.getByRole("heading",{name:"Circles",exact:true}).waitFor();
    assert.match(await page.locator("main").innerText(),/Live Circles are not configured/);
    await go("/community/circles/private-walk");await page.reload();await page.getByRole("heading",{name:"Circles",exact:true}).waitFor();
    await page.goBack();await page.goForward();await page.getByRole("heading",{name:"Circles",exact:true}).waitFor();
    await context.setOffline(true);await page.reload();await page.getByRole("heading",{name:"Circles",exact:true}).waitFor();
    assert.match(await page.locator("main").innerText(),/not configured/);await context.setOffline(false);
  });
  await check("Circles public/private lifecycle, roles, privacy, errors and responsive UI (controlled SDK)",()=>checkCircles(browser,base));
  await check("report dialog states, focus and sizes (controlled SDK)",()=>checkSafety(browser,base));
  await check("dialogs that replaced browser pop-ups: public contributions, public prayer updates, support requests (controlled SDK)",()=>checkDialogs(browser,base));
  await check("Journal, My Walk and Grow are pushed screens of You: Back to You, one large title, no eyebrow, no uppercase text (UI-SPEC D-10, A12)",()=>checkPushedScreens(browser,base));
  await check("Give and its policy, Resources, Circles, the not-found and crash screens and the install offer: shared primitives, one filled button, the words of A16 (UI-SPEC A12, A16, 9.3)",()=>checkSurfaces(browser,base));
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, [], "no unexpected main-page console errors");
  assert.deepEqual(consoleWarnings, [], "no unexpected main-page console warnings");
  assert.deepEqual(networkFailures, [], "no unexpected main-page network failures");
  console.log(
    `${checks} browser flow checks passed; no page/console errors/warnings or unexpected main-page network failures; no screenshots captured.`,
  );
} finally {
  await browser.close();
}
