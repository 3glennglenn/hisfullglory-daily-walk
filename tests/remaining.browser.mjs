import assert from "node:assert/strict";

// Plan 11 (UI-SPEC D-10, A12, A16, 14, 15): the screens that were not part of an earlier plan, the surfaces around
// the app, and the 200 % text sweep over every route. Each function opens its own context, so it leaves the main
// check page and its storage alone.

async function open(browser, base, path, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block", timezoneId: "Europe/Amsterdam", colorScheme: "light" });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(base + path);
  await page.locator("main h1").first().waitFor();
  return { context, page, problems };
}

// Task 1: Journal, My Walk and Grow are pushed screens of You: Back to You, one h1 in the large title style and no
// uppercase text anywhere on the screen.
export async function checkPushedScreens(browser, base) {
  for (const [path, title] of [
    ["/journal", "Your journal."],
    ["/my-walk", "My Walk"],
    ["/grow", "Room to grow."],
  ]) {
    const { context, page, problems } = await open(browser, base, path);
    try {
      assert.equal(await page.locator("main h1").count(), 1, path + ": one h1");
      assert.equal(await page.locator("main h1").innerText(), title, path + ": the title keeps its words");
      assert.equal(await page.locator("main h1").getAttribute("class"), "large-title", path + ": the large title style");
      assert.equal(await page.getByRole("button", { name: "Back to You", exact: true }).count(), 1, path + ": Back to You");
      const uppercase = await page.evaluate(() =>
        [...document.querySelectorAll("main *")].filter((el) => getComputedStyle(el).textTransform === "uppercase").map((el) => el.className || el.tagName),
      );
      assert.deepEqual(uppercase, [], path + ": no uppercase text transform");
      assert.equal(await page.locator("main .eyebrow").count(), 0, path + ": no eyebrow");
      await page.getByRole("button", { name: "Back to You", exact: true }).click();
      await page.waitForURL("**/you");
      assert.deepEqual(problems, [], path + ": no page errors");
    } finally {
      await context.close();
    }
  }
  // A journey keeps its way back to the list of journeys.
  const { context, page } = await open(browser, base, "/grow/anxiety");
  try {
    assert.equal(await page.locator("main h1").count(), 1);
    assert.equal(await page.getByRole("button", { name: "Back to All journeys", exact: true }).count(), 1);
    assert.equal(await page.locator("main .eyebrow").count(), 0);
    await page.getByRole("button", { name: "Back to All journeys", exact: true }).click();
    await page.waitForURL("**/grow");
  } finally {
    await context.close();
  }
}
