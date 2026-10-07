// Run against npm run preview. DOM/behavior checks only; deliberately no screenshots.
import { chromium } from "playwright";
import assert from "node:assert/strict";
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
        JSON.parse(localStorage.getItem("hfg-daily-walk:v2")),
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
        JSON.parse(localStorage.getItem("hfg-daily-walk:v2")),
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
      await page
        .getByRole("heading", { name: "Curated passage context" })
        .waitFor();
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
        JSON.parse(localStorage.getItem("hfg-daily-walk:v2")),
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
        JSON.parse(localStorage.getItem("hfg-daily-walk:v2")),
      );
      assert.deepEqual(s.devotionalProgress.anxiety, [0]);
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
    "dark/light/system themes persist and respond to OS appearance",
    async () => {
      await go("/settings");
      await page.getByLabel("Theme", { exact: true }).selectOption("dark");
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.theme),
        "dark",
      );
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.body).color),
        "rgb(246, 240, 231)",
      );
      await page.reload();
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.theme),
        "dark",
      );
      await page.getByLabel("Theme", { exact: true }).selectOption("system");
      await page.emulateMedia({ colorScheme: "light" });
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.theme),
        "light",
      );
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === "dark",
      );
    },
  );
  await check(
    "all primary/more routes fit 375px in dark mode without horizontal overflow",
    async () => {
      for (const path of [
        "/",
        "/bible/psalms/23",
        "/pray",
        "/community",
        "/more",
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
            .getByRole("button")
            .count(),
          5,
        );
      }
    },
  );
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
      await context.setOffline(true);
      await go("/bible/john/3/16");
      await page.locator("#verse-16").waitFor();
      await go("/journal");
      await page.getByRole("button", { name: /A study note/ }).waitFor();
      await context.setOffline(false);
    },
  );
  assert.deepEqual(errors, []);
  console.log(
    `${checks} browser flow checks passed; no uncaught page errors; no screenshots captured.`,
  );
} finally {
  await browser.close();
}
