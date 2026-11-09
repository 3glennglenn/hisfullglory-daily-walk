import assert from "node:assert/strict";
import { config, products } from "../src/config.ts";

// The shop made prominent (quick 261022-shop, founder 2026-10-22; 01.2 D-02, D-10), in a real browser: the bag in Today's
// title row opens the Shop screen and the You sheet holds no shop (the Shop card on You is gone; plan 06 replaces the bag with
// the Study Bibles card on Today); the product links point at the shop's product
// pages; it holds in both looks, in Lamplight and at 200 % text without sideways scroll; and nothing that is meant
// to stay calm (Pray, Community, topics, journal, the walk, the Bible) links to the shop.
// Each case opens a context of its own (the harness seeds a reader who already answered the welcome questions).
// The product pictures are answered locally, so the check does not depend on the shop's CDN.

const PICTURE = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="80"><rect width="60" height="80" fill="#cccccc"/></svg>';

async function open(browser, base, path, { look = "cover", lamplight = false, width = 390, height = 844, picture = true } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    serviceWorkers: "block",
    timezoneId: "Europe/Amsterdam",
    colorScheme: lamplight ? "dark" : "light",
  });
  await context.addInitScript(
    ({ look, lamplight }) => {
      localStorage.setItem("hfg-look", look);
      localStorage.setItem("hfg-lamplight", lamplight ? "on" : "off");
    },
    { look, lamplight },
  );
  await context.route("https://cdn.shopify.com/**", (route) =>
    picture ? route.fulfill({ status: 200, contentType: "image/svg+xml", body: PICTURE }) : route.abort(),
  );
  await context.route("https://shop.hisfullglory.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>shop</title><h1>The shop</h1>" }),
  );
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(base + path);
  await page.locator("main h1").first().waitFor();
  return { context, page, problems };
}

const noSidewaysScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function largeText(page) {
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "34px";
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForFunction(() => document.documentElement.dataset.text === "large");
  await page.waitForTimeout(100);
}

export async function checkShop(browser, base) {
  // Today: the bag, in both looks and both modes.
  for (const [look, lamplight] of [
    ["cover", false],
    ["cover", true],
    ["marked", false],
    ["marked", true],
  ]) {
    const name = `${look} ${lamplight ? "Lamplight" : "Light"}`;
    const { context, page, problems } = await open(browser, base, "/", { look, lamplight });
    try {
      await page.locator(".today .today-head").waitFor();
      const bag = page.locator('.today a[aria-label="Shop"]');
      assert.equal(await bag.count(), 1, name + ": one bag on Today");
      assert.equal(await page.locator('main a[href="/shop"]').count(), 1, name + ": the bag is the only shop link on Today");
      assert.equal(await bag.getAttribute("href"), "/shop");
      assert.equal(await bag.locator("svg").count(), 1, name + ": an icon from the app's icon set");
      assert.equal(await bag.locator("svg").getAttribute("aria-hidden"), "true");
      const box = await bag.boundingBox();
      assert.ok(box && box.width >= 44 && box.height >= 44, name + ": a 44px target " + JSON.stringify(box));
      assert.ok(box.x + box.width <= 390, name + ": inside the screen");
      // The title row is as tall as the title alone: the bag does not push the title or the context check down.
      const rows = await page.evaluate(() => {
        const head = document.querySelector(".today-head").getBoundingClientRect();
        const h1 = document.querySelector(".today-head h1").getBoundingClientRect();
        return { head: head.height, h1: h1.height, title: h1.top, headTop: head.top };
      });
      assert.ok(Math.abs(rows.head - rows.h1) < 1, name + ": the row is as tall as the title " + JSON.stringify(rows));
      assert.ok(rows.title - rows.headTop < 1, name + ": the title stays at the top of its row");
      // Tinted like the other toolbar icons (--link), never filled.
      const colours = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--link)";
        document.body.append(probe);
        const link = getComputedStyle(probe).color;
        probe.remove();
        const a = getComputedStyle(document.querySelector('.today a[aria-label="Shop"]'));
        return { link, color: a.color, background: a.backgroundColor };
      });
      assert.equal(colours.color, colours.link, name + ": the bag is --link");
      assert.equal(colours.background, "rgba(0, 0, 0, 0)", name + ": the bag is not filled");
      // The title does not run under the bag or, in Marked Light, under the ribbon.
      const title = await page.locator(".today-head h1").boundingBox();
      assert.ok(title.x + title.width <= box.x + 1, name + ": the title ends before the bag");
      if (look === "marked" && !lamplight) {
        const ribbon = await page.locator(".cover-ribbon").boundingBox();
        assert.ok(box.x + box.width <= ribbon.x, name + ": the bag leaves the ribbon's column free");
      }
      assert.equal(await noSidewaysScroll(page), true, name + ": no sideways scroll");
      // Keyboard: the bag takes focus and shows it.
      await bag.focus();
      assert.notEqual(await bag.evaluate((el) => getComputedStyle(el).outlineStyle), "none", name + ": a visible focus ring");
      await bag.click();
      await page.waitForURL("**/shop");
      assert.equal(await page.locator("main h1").innerText(), "Shop", name + ": the bag opens the Shop screen");
      assert.deepEqual(problems, [], name + ": no page errors");
    } finally {
      await context.close();
    }
  }

  // The You sheet holds no shop (01.2 D-02, D-10): no link to the shop, no Shop card, no Study Bibles words, no product
  // picture; in both looks and both modes. The Shop card that stood under the Give card is gone from You.
  for (const [look, lamplight] of [
    ["cover", false],
    ["cover", true],
    ["marked", false],
    ["marked", true],
  ]) {
    const name = `${look} ${lamplight ? "Lamplight" : "Light"}`;
    const { context, page, problems } = await open(browser, base, "/you", { look, lamplight });
    try {
      const sheet = page.getByRole("dialog", { name: "You", exact: true });
      await sheet.waitFor();
      assert.equal(await sheet.locator('a[href="/shop"], a[href*="shop.hisfullglory.com"]').count(), 0, name + ": no link to the shop in the sheet");
      assert.equal(await sheet.locator(".shop-feature, .give-feature").count(), 0, name + ": no Shop or Give card in the sheet");
      assert.equal(await sheet.getByText(/Study Bibles/).count(), 0, name + ": no shop words in the sheet");
      assert.equal(await sheet.getByText("Resources", { exact: true }).count(), 0, name + ": the old Resources row is gone");
      assert.equal(await sheet.locator("img").count(), 0, name + ": no product picture in the sheet");
      assert.equal(await sheet.getByRole("link", { name: /^Visit the shop/ }).count(), 0, name + ": no Visit the shop link");
      assert.equal(await noSidewaysScroll(page), true, name + ": no sideways scroll");
      assert.deepEqual(problems, [], name + ": no page errors");
    } finally {
      await context.close();
    }
  }

  // The covers that used to load on You are gone with the card: a failing picture host changes nothing there.
  {
    const { context, page } = await open(browser, base, "/you", { picture: false });
    try {
      const sheet = page.getByRole("dialog", { name: "You", exact: true });
      await sheet.waitFor();
      assert.equal(await sheet.locator(".book-placeholder, .shop-feature").count(), 0, "no cover placeholders and no Shop card on You");
      assert.equal(await page.locator('img[src*="cdn.shopify.com"]').count(), 0, "nothing on the Today screen behind the sheet loads a shop picture");
    } finally {
      await context.close();
    }
  }

  // The Shop screen.
  for (const [look, lamplight] of [
    ["cover", false],
    ["cover", true],
    ["marked", false],
  ]) {
    const name = `${look} ${lamplight ? "Lamplight" : "Light"}`;
    const { context, page, problems } = await open(browser, base, "/shop", { look, lamplight });
    try {
      assert.equal(await page.locator("main h1").innerText(), "Shop");
      assert.equal(await page.getByRole("button", { name: "Back to You", exact: true }).count(), 1);
      assert.equal(
        await page.locator(".screen-lede").innerText(),
        "Study Bibles we recommend. Price, stock and checkout are on the HisFullGlory shop.",
      );
      assert.deepEqual(await page.locator("main h2").allInnerTexts(), products.map((p) => p.title));
      const links = page.getByRole("link", { name: /^View in the shop/ });
      assert.equal(await links.count(), 3);
      assert.deepEqual(
        await links.evaluateAll((list) => list.map((a) => a.getAttribute("href"))),
        products.map((p) => `https://shop.hisfullglory.com/products/${p.handle}`),
        name + ": each product links to its page on the shop",
      );
      assert.equal(config.storeUrl, "https://shop.hisfullglory.com");
      for (const p of products) assert.ok((await page.locator("main").innerText()).includes(p.price), "the price " + p.price);
      assert.match(await page.locator("main").innerText(), /From \$49\.99 USD/);
      const all = page.getByRole("link", { name: "Visit the full shop", exact: true });
      assert.equal(await all.getAttribute("href"), "https://shop.hisfullglory.com");
      const lastCard = await page.locator(".product-card").last().boundingBox();
      const allBox = await all.boundingBox();
      assert.ok(allBox.y > lastCard.y + lastCard.height - 1, name + ": the full-shop link closes the list");
      assert.ok(allBox.height >= 44 && allBox.width > 300, name + ": full width and a 44px target");
      assert.equal(await page.locator("main a.button:not(.secondary)").count(), 0, name + ": no filled button on the Shop screen");
      assert.equal(await noSidewaysScroll(page), true, name + ": no sideways scroll");
      await links.first().click();
      await page.waitForURL("https://shop.hisfullglory.com/products/" + products[0].handle);
      assert.deepEqual(problems, [], name + ": no page errors");
    } finally {
      await context.close();
    }
  }
  {
    const { context, page } = await open(browser, base, "/shop");
    try {
      await page.getByRole("link", { name: "Visit the full shop", exact: true }).click();
      await page.waitForURL("https://shop.hisfullglory.com/");
    } finally {
      await context.close();
    }
  }

  // 200 % text: Today and the Shop screen, at 390 and 320px (the You sheet is measured by the text sweep of remaining.browser.mjs).
  for (const width of [390, 320]) {
    for (const path of ["/", "/shop"]) {
      const { context, page } = await open(browser, base, path, { width, height: 844 });
      try {
        await largeText(page);
        assert.equal(await noSidewaysScroll(page), true, `${path} at ${width}px, 200 %: no sideways scroll`);
        if (path === "/") {
          const bag = await page.locator('.today a[aria-label="Shop"]').boundingBox();
          assert.ok(bag.width >= 44 && bag.height >= 44 && bag.x >= 0 && bag.x + bag.width <= width, `bag at ${width}px, 200 %: ` + JSON.stringify(bag));
          const title = await page.locator(".today-head h1").boundingBox();
          assert.ok(title.x + title.width <= bag.x + 1, "the title does not run under the bag");
          const you = await page.locator(".today-head a.you-button").boundingBox();
          assert.ok(you.x >= bag.x + bag.width - 1 && you.x + you.width <= width, `the You button follows the bag inside the screen at ${width}px, 200 %: ` + JSON.stringify(you));
        }
      } finally {
        await context.close();
      }
    }
  }

  // Nothing calm links to the shop: prayers, community, topics, the journal, the walk, the Bible and the Give screens.
  for (const path of ["/pray", "/community", "/community/grief", "/community/circles", "/journal", "/my-walk", "/walk", "/bible/psalms/23", "/grow", "/grow/anxiety", "/give", "/shelf"]) {
    const { context, page } = await open(browser, base, path);
    try {
      assert.equal(await page.locator('main a[href="/shop"], main a[href*="shop.hisfullglory.com"]').count(), 0, path + ": no link to the shop");
      assert.equal(await page.locator('main a[aria-label="Shop"], main .shop-feature').count(), 0, path + ": no bag or Shop card");
      assert.equal(await page.locator("main").getByText(/Study Bibles/).count(), 0, path + ": no shop words");
    } finally {
      await context.close();
    }
  }
}
