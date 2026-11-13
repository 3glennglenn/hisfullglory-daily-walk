import assert from "node:assert/strict";
import { config, products } from "../src/config.ts";

// The shop on Today and Bible (quick 261022-shop, founder 2026-10-22; 01.2 D-02, D-04, D-10), in a real browser: the Study
// Bibles card under Today's walk row (three covers drawn on the device, a Shop link, the lowest price computed from the
// products) and Bible, Study's row open the shop and the Shop screen; Today loads nothing from another host; the You sheet
// holds no shop; the product links point at the shop's product pages; it holds in both looks, in Night light and at
// 200 % text without sideways scroll; and nothing that is meant to stay calm (Pray, Community, topics, journal, the walk,
// the Bible's Read side, the shelf) links to the shop.
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
  const hosts = new Set();
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) hosts.add(new URL(request.url()).host);
  });
  await page.goto(base + path);
  await page.locator("main h1").first().waitFor();
  return { context, page, problems, hosts };
}

/** The computed colour of a design token, read through a probe element. */
const colour = (page, token) =>
  page.evaluate((name) => {
    const probe = document.createElement("i");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, token);

/** The lowest dollar amount in the products' price strings, worked out here on its own (not by the app's helper). */
const lowest = () => "$" + Math.min(...products.flatMap((p) => [...p.price.matchAll(/\d+\.\d+/g)].map((m) => Number(m[0])))).toFixed(2);
const spoken = (price) => price.replace(/\s+USD$/i, "").replace(/^From\b/, "from");

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
  // Today: the Study Bibles card, in both looks and both modes.
  for (const [look, lamplight] of [
    ["cover", false],
    ["cover", true],
    ["marked", false],
    ["marked", true],
  ]) {
    const name = `${look} ${lamplight ? "Night light" : "Day"}`;
    const { context, page, problems, hosts } = await open(browser, base, "/", { look, lamplight });
    try {
      const card = page.getByRole("region", { name: "Study Bibles for your walk", exact: true });
      await card.waitFor();
      assert.equal(await card.count(), 1, name + ": one card on Today");
      assert.equal(await card.locator("h2").innerText(), "Study Bibles for your walk");
      // The card follows the walk row and comes before nothing else of the shop: it is the only shop link block on Today.
      const order = await page.evaluate(() => {
        const walk = document.querySelector('.today a[href="/walk"]'), card = document.querySelector(".study-card");
        return !!(walk.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      assert.ok(order, name + ": the card is under the walk row");
      assert.equal(await page.locator(".today-head a, .today-head button").count(), 1, name + ": the title row holds only the You button");
      assert.equal(await page.locator('.today a[aria-label="Shop"]').count(), 0, name + ": no bag");
      // The Shop link.
      const shop = card.getByRole("link", { name: "Shop", exact: true });
      assert.equal(await shop.getAttribute("href"), "/shop");
      assert.equal(await page.locator('main a[href="/shop"]').count(), 1, name + ": the card's link is the only shop link on Today");
      const shopBox = await shop.boundingBox();
      assert.ok(shopBox.height >= 44 && shopBox.width >= 44, name + ": a 44px target " + JSON.stringify(shopBox));
      assert.equal(await shop.evaluate((el) => getComputedStyle(el).color), await colour(page, "--link"), name + ": Shop is --link");
      // The three covers: one link each to its page on the shop, in the order of the products, named with the book and its
      // price, drawn from the spine tokens, with no picture.
      const covers = card.locator(".study-cover");
      assert.equal(await covers.count(), 3);
      assert.deepEqual(
        await covers.evaluateAll((list) => list.map((a) => a.getAttribute("href"))),
        products.map((p) => `https://shop.hisfullglory.com/products/${p.handle}`),
        name + ": each cover opens its product page, in the order of config products",
      );
      assert.deepEqual(
        await covers.evaluateAll((list) => list.map((a) => a.getAttribute("aria-label"))),
        products.map((p) => `${p.title}, ${spoken(p.price)}`),
        name + ": each link is named with the book and its price",
      );
      assert.deepEqual(await covers.allInnerTexts(), products.map((p) => p.shortName), name + ": the short names are on the covers");
      for (const [i, cover] of (await covers.all()).entries()) {
        const box = await cover.boundingBox();
        assert.ok(box.width >= 44 && box.height >= 44, name + ": cover " + (i + 1) + " is a 44px target " + JSON.stringify(box));
        assert.equal(await cover.evaluate((el) => getComputedStyle(el).backgroundColor), await colour(page, `--spine-${i + 1}`), name + ": cover " + (i + 1) + " is --spine-" + (i + 1));
        assert.equal(await cover.evaluate((el) => getComputedStyle(el).color), await colour(page, "--spine-ink"), name + ": the name is --spine-ink");
        assert.equal(await cover.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1), true, name + ": the name is not clipped");
      }
      assert.equal(await card.locator("img, picture, svg, [style*='url(']").count(), 0, name + ": no picture in the card");
      // The price line, computed from the products.
      assert.equal(await card.locator(".study-card-note").innerText(), "Hand-picked, from " + lowest(), name + ": the lowest price");
      assert.equal(await card.locator(".study-card-note").evaluate((el) => getComputedStyle(el).color), await colour(page, "--muted"));
      // The surface is the grouped list's own.
      assert.equal(await card.evaluate((el) => getComputedStyle(el).backgroundColor), await colour(page, "--surface"), name + ": the card is --surface");
      // Today loads nothing from another host: not a picture, not a script, not a font.
      await page.waitForLoadState("networkidle");
      assert.deepEqual([...hosts], [new URL(base).host], name + ": Today makes no request to another host, cdn.shopify.com included");
      assert.equal(await page.locator('img[src*="cdn.shopify.com"]').count(), 0);
      const box = await card.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390, name + ": the card is inside the screen");
      assert.equal(await noSidewaysScroll(page), true, name + ": no sideways scroll");
      // Keyboard: Shop and every cover take focus and show it.
      for (const target of [shop, ...(await covers.all())]) {
        await target.focus();
        assert.notEqual(await target.evaluate((el) => getComputedStyle(el).outlineStyle), "none", name + ": a visible focus ring");
      }
      await shop.click();
      await page.waitForURL("**/shop");
      assert.equal(await page.locator("main h1").innerText(), "Shop", name + ": the Shop link opens the Shop screen");
      assert.deepEqual(problems, [], name + ": no page errors");
    } finally {
      await context.close();
    }
  }
  // A cover opens its product on the shop.
  {
    const { context, page } = await open(browser, base, "/");
    try {
      await page.locator(".study-cover").nth(1).click();
      await page.waitForURL("https://shop.hisfullglory.com/products/" + products[1].handle);
    } finally {
      await context.close();
    }
  }
  // A failing picture host changes nothing on Today: there is no picture to fail.
  {
    const { context, page } = await open(browser, base, "/", { picture: false });
    try {
      assert.equal(await page.locator(".study-card").count(), 1);
      assert.equal(await page.locator(".book-placeholder").count(), 0, "no cover placeholders on Today");
    } finally {
      await context.close();
    }
  }
  // Bible, Study's "Study Bibles" row opens the Shop screen.
  {
    const { context, page } = await open(browser, base, "/bible");
    try {
      await page.getByRole("radio", { name: "Study" }).click();
      await page.getByRole("link", { name: /^Study Bibles/ }).click();
      await page.waitForURL("**/shop");
      assert.equal(await page.locator("main h1").innerText(), "Shop");
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

  // 200 % text: Today (the card) and the Shop screen, at 390 and 320px (the You sheet is measured by the text sweep of remaining.browser.mjs).
  for (const width of [390, 320]) {
    for (const path of ["/", "/shop"]) {
      const { context, page } = await open(browser, base, path, { width, height: 844 });
      try {
        await largeText(page);
        assert.equal(await noSidewaysScroll(page), true, `${path} at ${width}px, 200 %: no sideways scroll`);
        if (path === "/") {
          const card = await page.locator(".study-card").boundingBox();
          assert.ok(card.x >= 0 && card.x + card.width <= width, `the card at ${width}px, 200 %: ` + JSON.stringify(card));
          for (const box of await page.locator(".study-card .study-cover, .study-card .study-card-shop, .study-card .study-card-note").evaluateAll((list) => list.map((el) => el.getBoundingClientRect().toJSON()))) {
            assert.ok(box.left >= 0 && box.right <= width + 0.5, `a part of the card stays inside the screen at ${width}px, 200 %: ` + JSON.stringify(box));
          }
          const covers = await page.locator(".study-cover").evaluateAll((list) => list.map((el) => ({ clipped: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 })));
          assert.deepEqual(covers.map((c) => c.clipped), [false, false, false], `no cover name is clipped at ${width}px, 200 %`);
        }
      } finally {
        await context.close();
      }
    }
  }

  // Nothing calm links to the shop (01.2 D-10): prayers, community, topics, circles, the journal, My walk, the walk, the
  // reader, Grow, Give and the shelf. Only Today's card, Bible, Study's row and /shop do.
  for (const path of ["/pray", "/community", "/community/grief", "/community/circles", "/journal", "/my-walk", "/walk", "/bible/psalms/23", "/grow", "/grow/anxiety", "/give", "/shelf", "/context"]) {
    const { context, page } = await open(browser, base, path);
    try {
      assert.equal(await page.locator('main a[href="/shop"], main a[href*="shop.hisfullglory.com"]').count(), 0, path + ": no link to the shop");
      assert.equal(await page.locator('main a[aria-label="Shop"], main .study-card, main .shop-feature').count(), 0, path + ": no bag or Study Bibles card");
      assert.equal(await page.locator("main").getByText(/Study Bibles/).count(), 0, path + ": no shop words");
    } finally {
      await context.close();
    }
  }
}
