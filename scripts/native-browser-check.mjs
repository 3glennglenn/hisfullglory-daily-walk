// Browser check of the store build (D-02, STORE-03), against npm run preview:native (dist-native on port 4174).
// The store app serves itself from its own files, so every request to another host is aborted and recorded, and
// the check fails if one was made. It opens Today and the Bible, opens and closes the You sheet, and proves that no service worker is registered.
// Later store plans extend this scaffold (native sign-in, giving hidden, back button stubs).
// DOM and behaviour only; no screenshots.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { freshPlatform } from "../src/platform/persistence.ts";

const base = (process.env.NATIVE_PREVIEW_URL ?? "http://127.0.0.1:4174").replace(/\/$/, "");
const origin = new URL(base).origin;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
});
// A reader who already answered the welcome questionnaire, as scripts/browser-check.mjs seeds it, so "/" is Today.
const answered = freshPlatform();
answered.local.onboarded = true;
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Europe/Amsterdam", colorScheme: "light" });
await context.addInitScript((value) => {
  try {
    if (!["hfg-daily-walk:v1", "hfg-daily-walk:v2", "hfg-daily-walk:v3"].some((key) => localStorage.getItem(key) !== null))
      localStorage.setItem("hfg-daily-walk:v3", value);
  } catch {
    // Storage that throws is not under test here.
  }
}, JSON.stringify(answered));
const offHost = [];
await context.route("**/*", (route) => {
  const url = route.request().url();
  if (url.startsWith("data:") || url.startsWith("blob:") || new URL(url).origin === origin) return route.continue();
  offHost.push(url);
  return route.abort();
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.setDefaultTimeout(15000);
let checks = 0;
async function check(label, fn) {
  await fn();
  checks++;
  console.log("PASS", label);
}

try {
  await page.goto(base + "/");
  await page.locator("main h1").first().waitFor();
  await check("Today opens from the store bundle", async () => {
    assert.equal(await page.locator("main h1").count(), 1, "one h1");
    assert.equal(await page.locator("main h1").innerText(), "Today");
  });
  await check("no service worker is registered after load", async () => {
    await page.waitForLoadState("load");
    await page.waitForTimeout(1000);
    const registrations = await page.evaluate(async () =>
      "serviceWorker" in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    );
    assert.equal(registrations, 0, "a store build registers no service worker");
    assert.equal(await page.locator('link[rel="manifest"]').count(), 0, "no web manifest link");
  });
  await page.goto(base + "/bible/john/3");
  await page.locator("main h1").first().waitFor();
  await check("the Bible opens John 3 from the bundled text, with verse 16", async () => {
    const verse = page.locator('[data-verse="16"]').first();
    await verse.waitFor();
    assert.match(await verse.innerText(), /For God so loved the world/);
  });
  await page.goto(base + "/");
  await page.locator("main h1").first().waitFor();
  await check("the You button opens the You sheet from the store bundle and Done closes it", async () => {
    await page.locator("main .title-row").getByRole("link", { name: "You", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "You", exact: true });
    await sheet.waitFor();
    assert.equal(new URL(page.url()).pathname, "/you");
    await sheet.getByRole("button", { name: "Done, close You", exact: true }).click();
    await sheet.waitFor({ state: "detached" });
    assert.equal(new URL(page.url()).pathname, "/", "Done returns to Today");
    assert.equal(await page.locator("main h1").innerText(), "Today");
  });
  await check("nothing was fetched from another host and no page error occurred", async () => {
    assert.deepEqual(offHost, [], "requests that left the preview's host");
    assert.deepEqual(errors, [], "page errors");
  });
  console.log(`PASS ${checks} store-build browser checks against ${base}`);
} catch (error) {
  console.error("FAIL", error instanceof Error ? error.message : error);
  if (offHost.length) console.error("Requests to other hosts:\n- " + offHost.join("\n- "));
  process.exitCode = 1;
} finally {
  await browser.close();
}
