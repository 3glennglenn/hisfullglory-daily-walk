import {checkCircles} from "../tests/circles.browser.mjs";
import {checkSafety} from "../tests/safety.browser.mjs";
// Run against npm run preview. DOM/behavior checks only; deliberately no screenshots.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {checkTopicComposer} from "../tests/topic-hub.browser.mjs";
import {checkAuthBoundary} from "../tests/auth-boundary.browser.mjs";
import {checkProfile} from "../tests/profile.browser.mjs";
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173";
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
    "guest onboarding saves up to three goals and chosen rhythm",
    async () => {
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      for (const goal of ["Prayer", "Peace", "Consistency"])
        await page.getByRole("button", { name: goal, exact: true }).click();
      assert.equal(
        await page
          .getByRole("button", { name: "Understand the Bible", exact: true })
          .isDisabled(),
        true,
      );
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByLabel("Your journey").selectOption("Growing in faith");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByLabel("Minutes each day").selectOption("10");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("button", { name: "Begin my walk", exact: true })
        .click();
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("hfg-daily-walk:v3")),
      );
      assert.equal(saved.local.onboarded, true);
      assert.equal(saved.preferences.goals.length, 3);
      assert.equal(saved.preferences.minutes, 10);
    },
  );
  await check(
    "complete daily walk saves private reflection and idempotent completion",
    async () => {
      await go("/walk");
      for (let i = 0; i < 4; i++)
        await page.getByRole("button", { name: /Continue to/ }).click();
      await page
        .locator("#journal")
        .fill("An honest private reflection for testing.");
      await page.getByRole("button", { name: "Continue to Prayer" }).click();
      await page
        .getByRole("button", { name: "Continue to Completion" })
        .click();
      await page
        .getByRole("button", { name: "Complete today’s walk", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("button", { name: "Completed · come back anytime" })
          .isDisabled(),
        true,
      );
      const s = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("hfg-daily-walk:v3")),
      );
      assert.equal(s.local.completedDates.length, 1);
      assert.ok(s.entries.some((e) => e.body.includes("honest private")));
    },
  );
  await check(
    "deep-linked WEB chapter, selection, bookmark, search and history work",
    async () => {
      await go("/bible/romans/8/28");
      await page
        .getByRole("heading", { name: "Romans 8:28", exact: true })
        .waitFor();
      assert.ok(
        (await page.locator("#verse-28").innerText()).includes(
          "all things work together",
        ),
      );
      await page
        .getByRole("button", { name: "Bookmark / save", exact: true })
        .click();
      await page.getByLabel("Highlight").selectOption("sage");
      await page.reload();
      await page.locator("#verse-28").waitFor();
      assert.equal(await page.getByLabel("Highlight").inputValue(), "sage");
      assert.equal(
        await page
          .getByRole("button", { name: "Remove bookmark", exact: true })
          .count(),
        1,
      );
      await page.getByRole("button", { name: "context", exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get("tab"), "context");
      // Romans 8 has a sourced chapter note (no verse note for 8:28) and an AI explanation.
      const sourced = page.locator('article[data-layer="sourced"]');
      await sourced
        .getByRole("heading", { name: "Chapter context", exact: true })
        .waitFor();
      const sourcedText = await sourced.textContent();
      assert.match(sourcedText, /Verse 28 belongs with verses 29–30/);
      assert.match(
        sourcedText,
        /No note for this verse yet, so this shows the wider chapter context\./,
      );
      assert.doesNotMatch(sourcedText, /\bAI\b/, "sourced note stays free of AI text");
      await sourced.getByText("Why we say this", { exact: true }).click();
      assert.equal(
        await sourced
          .getByRole("link", { name: "Primary source", exact: true })
          .getAttribute("href"),
        "https://ebible.org/engwebp/ROM08.htm",
      );
      const ai = page.locator('article[data-layer="ai"]');
      await ai.getByRole("heading", { name: /^AI explanation/ }).waitFor();
      assert.match(
        await ai.locator(".eyebrow").textContent(),
        /^Romans 8 · Written by an AI model · /,
      );
      await ai
        .getByRole("heading", { name: "What this chapter says", exact: true })
        .waitFor();
      assert.equal(await sourced.locator("[data-layer]").count(), 0);
      assert.deepEqual(
        await page
          .locator("main [data-layer]")
          .evaluateAll((nodes) => nodes.map((n) => n.dataset.layer)),
        ["sourced", "ai"],
        "AI explanation is a separate card after the sourced note",
      );
      await page.goBack();
      await page.locator("#verse-28").waitFor();
      await page
        .getByRole("searchbox", { name: "Search WEB text" })
        .fill("For God so loved");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page.getByRole("button", { name: /John 3:16/ }).click();
      await page
        .getByRole("heading", { name: "John 3:16", exact: true })
        .waitFor();
      await page.reload();
      await page.locator("#verse-16").waitFor();
    },
  );
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
  await check("typed journal edits persist after refresh", async () => {
    await go("/journal");
    await page.getByRole("button", { name: "New entry", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("A study note");
    await page.getByLabel("Type", { exact: true }).selectOption("study note");
    await page
      .getByLabel("Your words", { exact: true })
      .fill("A private observation.");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.reload();
    await page
      .getByRole("button", { name: /study note.*A study note/s })
      .waitFor();
    await page
      .getByRole("searchbox", { name: "Search private journal" })
      .fill("private observation");
    assert.equal(await page.locator("button.entry").count(), 1);
  });
  await check(
    "all 15 topic journeys are browsable and progress is saved",
    async () => {
      await go("/grow");
      assert.equal(await page.locator("button.entry").count(), 15);
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
      await go("/");
      await page.getByRole("button", { name: /Continue your journey/ }).click();
      assert.equal(new URL(page.url()).pathname, "/grow/anxiety");
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
        ["/walk", "Today"],
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
      // Genesis has no sourced note yet; only the labelled AI explanation is shown.
      const sourced = page.locator('article[data-layer="sourced"]');
      await sourced
        .getByRole("heading", { name: "Context", exact: true })
        .waitFor();
      assert.match(
        await sourced.textContent(),
        /Context for this book is being written\..*A note appears here only once it names its sources\./s,
      );
      assert.equal(await sourced.locator("details, a").count(), 0);
      const ai = page.locator('article[data-layer="ai"]');
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
    await p.getByRole("button", { name: "Try again" }).waitFor();
    await p.unroute("**/bible/web.json");
    await p.getByRole("button", { name: "Try again" }).click();
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
    await go("/community");await page.getByRole("button",{name:/Grief.*Scripture/}).click();
    await page.getByRole("button",{name:"Follow privately on this device",exact:true}).click();
    await page.reload();await page.getByRole("button",{name:"Unfollow topic",exact:true}).waitFor();
    assert.match(await page.locator("main").innerText(),/not configured/);
    assert.equal(await page.getByRole("button",{name:"Publish publicly",exact:true}).count(),0);
    await go("/community/sexual-temptation");await page.getByRole("heading",{name:"Temptation",exact:true}).waitFor();
    await go("/community/unknown");await page.getByRole("heading",{name:"Topic not found",exact:true}).waitFor();
    await go("/community/grief?thread=private-words");assert.match(await page.locator("main").innerText(),/not found/i);
    await go("/my-walk");assert.match(await page.locator("main").innerText(),/Grief/);
  });
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
    await go("/community");await page.getByRole("button",{name:"Saved",exact:true}).click();
    await page.getByRole("button",{name:"Saved discussion · Grief",exact:true}).click();
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
