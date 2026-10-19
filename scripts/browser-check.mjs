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
    "dark/light/system themes persist and respond to OS appearance",
    async () => {
      await go("/settings");
      await page.getByLabel("Theme", { exact: true }).selectOption("dark");
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.mode),
        "lamplight",
      );
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.body).color),
        "rgb(246, 240, 231)",
      );
      await page.reload();
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.mode),
        "lamplight",
      );
      await page.getByLabel("Theme", { exact: true }).selectOption("system");
      await page.emulateMedia({ colorScheme: "light" });
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.mode),
        "light",
      );
      await page.emulateMedia({ colorScheme: "dark" });
      await page.waitForFunction(
        () => document.documentElement.dataset.mode === "lamplight",
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
            "/community/grief",
            "/my-walk",
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
