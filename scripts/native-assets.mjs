// Makes the source images for the store app icon and launch screen from the existing logo (public/icon.svg).
// Run once; the output in assets/ is committed, and `npx @capacitor/assets generate --ios` (and later --android)
// turns it into the platform sizes. The logo itself is never redrawn or recoloured (02-CONTEXT, Claude's discretion):
// - assets/icon-only.png: the logo at 1024 x 1024 on its own background colour #F6F0E7, so the rounded corners
//   fill with that colour; flattened to RGB without alpha, because App Store icons must not be transparent.
// - assets/splash.png and assets/splash-dark.png: the logo at 512 px, centred on 2732 x 2732 canvases of #F6F0E7
//   (light) and #1A120E (Lamplight, so a dark device sees no light flash at launch).
// Usage: node scripts/native-assets.mjs   (BROWSER_CHANNEL=chrome to use the installed Chrome)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";

const LIGHT = "#F6F0E7";
const DARK = "#1A120E";
const svg = readFileSync("public/icon.svg");
const src = "data:image/svg+xml;base64," + svg.toString("base64");

const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
});

async function render(canvas, logo, background) {
  const page = await browser.newPage({ viewport: { width: canvas, height: canvas }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${canvas}px;height:${canvas}px;background:${background};` +
      `display:flex;align-items:center;justify-content:center">` +
      `<img src="${src}" width="${logo}" height="${logo}" alt=""></body></html>`,
  );
  await page.locator("img").evaluate((img) => (img.complete ? null : new Promise((r) => (img.onload = r))));
  const shot = await page.screenshot({ type: "png", omitBackground: false });
  await page.close();
  return sharp(shot).flatten({ background }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

mkdirSync("assets", { recursive: true });
const outputs = [
  ["assets/icon-only.png", await render(1024, 1024, LIGHT)],
  ["assets/splash.png", await render(2732, 512, LIGHT)],
  ["assets/splash-dark.png", await render(2732, 512, DARK)],
];
await browser.close();
for (const [path, png] of outputs) {
  const meta = await sharp(png).metadata();
  if (meta.hasAlpha || meta.channels !== 3) throw new Error(`${path} still has an alpha channel`);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${meta.width} x ${meta.height}, RGB)`);
}
