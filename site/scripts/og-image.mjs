// Makes public/og.png (1200 x 630), the image shown when a page is shared.
// Run by hand after changing og-image.html: `npm run og`. It uses the app's Playwright, so
// install the app's packages in the repository root first. To use a browser that is
// already on the computer, as scripts/browser-check.mjs does: BROWSER_CHANNEL=chrome.
// The result is committed, so the Vercel build never runs this.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(join(site, "src", "styles", "tokens.generated.css")))
  throw new Error("og-image: run `npm run sync` first, for the colour tokens.");

const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  await page.goto(pathToFileURL(join(site, "scripts", "og-image.html")).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const out = join(site, "public", "og.png");
  await page.screenshot({ path: out });
  console.log(`og-image: wrote ${out}`);
} finally {
  await browser.close();
}
