import { build } from "esbuild";
import assert from "node:assert/strict";

// The sponsor slot in a real browser (UI-SPEC 13, D-13): with no sponsor nothing at all reaches the page at any of the
// six candidate places; with a fixture sponsor the row shows only at the place it lists, as a sponsored link with no
// query string, followed by the sentence that says nothing about the reader is sent.
export async function checkSponsor(browser, base) {
  const result = await build({
    entryPoints: ["tests/fixtures/sponsor.tsx"],
    bundle: true,
    write: false,
    outfile: ".tooling/sponsor-fixture.js",
    format: "iife",
    jsx: "automatic",
    loader: { ".svg": "dataurl" },
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
  const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(m.text());
  });
  try {
    await page.route(base + "/__sponsor-fixture", (route) =>
      route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><style>' + css + '</style></head><body><div id="root"></div><script>' + js + "</script></body></html>" }),
    );
    await page.goto(base + "/__sponsor-fixture");
    await page.locator("#set").waitFor();

    // No sponsor: every place renders nothing at all. Not a wrapper, not a margin, not a word.
    const empty = page.locator("#empty");
    assert.equal(await empty.locator('[data-slot="sponsor"]').count(), 0, 'no data-slot="sponsor" at any of the six places');
    assert.equal(await empty.getByText("Sponsor").count(), 0, 'no word "Sponsor"');
    assert.equal(await empty.getByText("Sponsors do not receive anything about you.").count(), 0);
    assert.equal(await empty.locator("[data-place]").count(), 6);
    for (const place of ["today-end", "story-end", "site-home-end", "site-context-check-end", "pray", "community"]) {
      const box = empty.locator(`[data-place="${place}"]`);
      assert.equal(await box.evaluate((el) => el.childElementCount), 0, place + ": no element");
      assert.equal(await box.evaluate((el) => el.textContent), "", place + ": no text");
      assert.equal(await box.evaluate((el) => el.getBoundingClientRect().height), 0, place + ": no space");
    }

    // A fixture sponsor listing only today-end: exactly one row, at that place.
    const set = page.locator("#set");
    assert.equal(await set.locator('[data-slot="sponsor"]').count(), 1, "exactly one row");
    assert.equal(await set.locator('[data-place="today-end"] [data-slot="sponsor"]').count(), 1, "at today-end");
    for (const place of ["story-end", "site-home-end", "site-context-check-end", "pray", "community"])
      assert.equal(await set.locator(`[data-place="${place}"] [data-slot="sponsor"]`).count(), 0, place + " stays empty");
    const row = set.locator('[data-slot="sponsor"]');
    const link = row.getByRole("link");
    assert.equal(await link.getAttribute("rel"), "sponsored noopener");
    assert.equal(await link.getAttribute("target"), "_blank");
    const href = await link.getAttribute("href");
    assert.equal(href, "https://sponsor.example/path");
    assert.equal(new URL(href).search, "", "no query string");
    assert.match(await link.innerText(), /Sponsor\s+Fixture Sponsor\s+A line a sponsor would write\./);
    assert.equal(await row.getByText("Sponsors do not receive anything about you.", { exact: true }).count(), 1);
    assert.equal(await row.locator("img, script, iframe, video, audio").count(), 0, "no image, script or frame");
    assert.equal(await link.locator("svg").getAttribute("aria-hidden"), "true", "the external-link icon is decoration");
    assert.equal(await link.evaluate((el) => el.getBoundingClientRect().height >= 52), true, "a row of at least 52px");
    assert.deepEqual(problems, [], "no page or console errors");
  } finally {
    await context.close();
  }
}
