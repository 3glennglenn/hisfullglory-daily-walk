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
    "primary/more routes fit 375/390/768/1280px in both themes with accessible controls",
    async () => {
      for (const width of [375, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 812 });
        for (const theme of ["light", "dark"]) {
          await go("/settings");
          await page.getByLabel("Theme", { exact: true }).selectOption(theme);
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
    "unknown routes and unavailable study context stay honest",
    async () => {
      await go("/grow/not-a-journey");
      await page.getByRole("heading", { name: "Journey not found" }).waitFor();
      await go("/unknown");
      assert.match(await page.locator("main").innerText(), /not found/i);
      await go("/bible/genesis/1?tab=context");
      assert.match(
        await page.locator("main").innerText(),
        /not available|unavailable|not yet/i,
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
        JSON.parse(localStorage.getItem("hfg-daily-walk:v2")),
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
