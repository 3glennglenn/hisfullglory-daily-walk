import assert from "node:assert/strict";
import { freshPlatform } from "../src/platform/persistence.ts";
import { colour } from "./story.browser.mjs";

// Lamplight as direction B's room (plan 16, founder 2026-10-20), in a real browser: Today without a leather slab, the
// lamp glow, the salmon pill, the sky with one star for each day walked and its line, the walk finish with today's star
// lit, and the light modes left as they were. Both looks. Every case runs in a fresh context.
const KEY = "hfg-daily-walk:v3";

/** A reader who answered the welcome questionnaire, with `count` days walked (ending yesterday, or today). */
async function openApp(browser, base, path, { look = "cover", mode = "lamplight", count = 0, todayWalked = false, finish = false, reducedMotion = false, width = 390, height = 844 } = {}) {
  const answered = freshPlatform();
  answered.local.onboarded = true;
  // A context of its own state (browser.newContextFirstRun): the seed below is the whole state, never merged with another.
  const context = await browser.newContextFirstRun({
    viewport: { width, height },
    timezoneId: "Europe/Amsterdam",
    colorScheme: mode === "lamplight" ? "dark" : "light",
    ...(reducedMotion ? { reducedMotion: "reduce" } : {}),
  });
  await context.addInitScript(
    ({ look, mode, state, count, todayWalked, finish, key }) => {
      localStorage.setItem("hfg-look", look);
      localStorage.setItem("hfg-lamplight", mode === "lamplight" ? "on" : "off");
      if (localStorage.getItem(key)) return;
      const pad = (n) => String(n).padStart(2, "0");
      const day = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      };
      const last = todayWalked ? 0 : -1;
      state.local.completedDates = Array.from({ length: count }, (_, i) => day(last - (count - 1 - i)));
      if (finish) state.walkStep = { [day(0)]: 6 };
      localStorage.setItem(key, JSON.stringify(state));
    },
    { look, mode, state: answered, count, todayWalked, finish, key: KEY },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(m.text());
  });
  await page.goto(base + path);
  await page.locator("main h1").first().waitFor();
  return { context, page, problems };
}

const style = (locator, property, pseudo) => locator.evaluate((el, [p, ps]) => getComputedStyle(el, ps)[p], [property, pseudo]);

export async function checkLamplight(browser, base) {
  // ---- the cover is not a block any more: both looks, 0, 1, 12 and 60 days -------------------------------------------------
  for (const look of ["cover", "marked"]) {
    for (const [count, line, stars] of [
      [0, "Today's walk lights your first star.", 1],
      [1, "1 day walked. It stays.", 2],
      [12, "12 days walked. Each one stays.", 13],
      [60, "60 days walked. Each one stays.", 40],
    ]) {
      const name = `${look} Lamplight, ${count} days`;
      const { context, page, problems } = await openApp(browser, base, "/", { look, count });
      await page.locator(".today .cover-wrap").waitFor();
      // The sky: decoration (hidden from assistive technology), at most 40 places, today's place an empty ring.
      const sky = page.locator(".today .sky");
      assert.equal(await sky.isVisible(), true, name + ": the sky is drawn");
      assert.equal(await sky.getAttribute("aria-hidden"), "true", name + ": decoration only");
      assert.equal(await sky.locator(".star").count(), stars, name + ": a star for each day walked, at most 40, and today's ring");
      assert.equal(await sky.locator(".star-today:not(.star-walked)").count(), 1, name + ": today's place is an empty ring until today's walk is done");
      assert.equal(await page.locator(".today .sky-caption").innerText(), line, name + ": the line says it in words");
      assert.equal(await page.locator(".today .sky-caption").evaluate((el) => getComputedStyle(el).color), await colour(page, "--muted"), name + ": the line is --muted");
      const inside = await sky.locator(".star").evaluateAll((list, box) => list.every((s) => { const r = s.getBoundingClientRect(); return r.left >= box.left - 8 && r.right <= box.right + 8 && r.top >= box.top - 8 && r.bottom <= box.bottom + 8; }), await sky.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
      assert.equal(inside, true, name + ": every star is inside the sky");
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0, name + ": nothing moves on Today");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name + ": no sideways scroll");

      // No leather slab, no gilt rule, no ornaments, no ribbon.
      const cover = page.locator(".today .cover");
      assert.equal(await style(cover, "backgroundColor"), "rgba(0, 0, 0, 0)", name + ": no slab");
      assert.ok(["none", "normal"].includes(await style(cover, "content", "::before")) || (await style(cover, "display", "::before")) === "none", name + ": no gilt frame");
      for (const part of [".cover-orn", ".cover-ribbon"])
        for (const el of await page.locator(".today " + part).all()) assert.equal(await style(el, "display"), "none", name + ": " + part + " is not drawn");
      // One soft pool of lamp light behind the hook, fading out (never a box edge).
      const glow = await style(page.locator(".today .cover-wrap"), "backgroundImage", "::before");
      assert.match(glow, /radial-gradient\(closest-side/, name + ": a radial pool of light");
      assert.match(glow, /rgba\(240, 201, 135, 0\.17\)/, name + ": B's glow colour");
      assert.match(glow, /rgba\(0, 0, 0, 0\)|transparent/, name + ": fading to nothing");
      // The words: the reference small in --link, the hook in --ink, the second line --muted.
      assert.equal(await style(page.locator(".today .cover-ref"), "color"), await colour(page, "--link"), name + ": the reference is --link");
      assert.equal(await style(page.locator(".today .cover-ref"), "fontWeight"), "600");
      assert.equal(await style(page.locator(".today .cover-ref"), "fontStyle"), "normal");
      assert.ok(parseFloat(await style(page.locator(".today .cover-ref"), "fontSize")) <= 17, name + ": the reference is small");
      assert.match(await style(page.locator(".today .cover-ref"), "fontFamily"), look === "marked" ? /system-ui|-apple-system/ : /Manrope/, name + ": the interface face of the look");
      assert.equal(await style(page.locator(".today .cover-display"), "color"), await colour(page, "--ink"), name + ": the hook is --ink");
      assert.match(await style(page.locator(".today .cover-display"), "fontFamily"), look === "marked" ? /Literata/ : /Gelasio/, name + ": the hook is in the serif of the look");
      assert.equal(await style(page.locator(".today .cover-body"), "color"), await colour(page, "--muted"), name + ": the second line is --muted");
      // The one filled pill.
      const pill = page.locator(".today .cover-button");
      assert.equal(await style(pill, "backgroundColor"), await colour(page, "--button"), name + ": the pill is --button");
      assert.equal(await style(pill, "color"), await colour(page, "--on-button"), name + ": the pill text is --on-button");
      assert.equal(await style(pill, "backgroundColor"), "rgb(185, 120, 98)");
      assert.equal(await style(pill, "color"), "rgb(26, 18, 14)");
      assert.ok(parseFloat(await style(pill, "borderTopLeftRadius")) >= 24, name + ": a pill");
      const box = await pill.boundingBox();
      const column = await page.locator(".today .cover").boundingBox();
      assert.ok(box.height >= 48, name + ": 48px or more");
      assert.ok(Math.abs(box.width - column.width) <= 1, name + ": full width on a phone");
      // The label of an AI-written check is still there, in words, with the badge.
      if ((await page.locator(".today .cover-ai").count()) > 0) {
        assert.match(await page.locator(".today .cover-ai").innerText(), /^AI\nContext written by AI, from named sources\.$/, name + ": the AI row");
      }
      // The rows below keep the raised surface.
      assert.equal(await style(page.locator(".today .group-list").first(), "backgroundColor"), "rgb(37, 25, 20)", name + ": the raised surface #251914");
      assert.deepEqual(problems, [], name);
      await context.close();
    }
  }

  // ---- today's walk done: the ring becomes a star ----------------------------------------------------------------------------
  {
    const { context, page } = await openApp(browser, base, "/", { count: 5, todayWalked: true });
    await page.locator(".today .sky").waitFor();
    assert.equal(await page.locator(".today .sky .star").count(), 5);
    assert.equal(await page.locator(".today .sky .star-today:not(.star-walked)").count(), 0, "no empty ring once today is walked");
    assert.equal(await page.locator(".today .sky-caption").innerText(), "5 days walked. Each one stays.");
    await context.close();
  }

  // ---- the light modes are exactly as they were: no sky, the leather block stays --------------------------------------------
  for (const look of ["cover", "marked"]) {
    const { context, page } = await openApp(browser, base, "/", { look, mode: "light", count: 12 });
    await page.locator(".today .cover-wrap").waitFor();
    assert.equal(await style(page.locator(".today .sky"), "display"), "none", look + " Light: no sky");
    assert.equal(await style(page.locator(".today .sky-caption"), "display"), "none", look + " Light: no sky line");
    if (look === "cover") {
      assert.equal(await style(page.locator(".today .cover"), "backgroundColor"), await colour(page, "--sig"), "Cover Light keeps the leather block");
      assert.equal(await page.locator(".today .cover-orn").first().evaluate((el) => getComputedStyle(el).display), "block", "and its ornaments");
      assert.equal(await style(page.locator(".today .cover-button"), "backgroundColor"), await colour(page, "--sig-button"), "and its button");
    } else {
      assert.equal(await style(page.locator(".today .cover"), "backgroundColor"), await colour(page, "--bg"), "Marked Light keeps the page (the cover is the page's own colour)");
      assert.equal(await style(page.locator(".today .cover-ribbon"), "display"), "block", "and its ribbon");
    }
    await context.close();
  }

  // ---- the walk finish: today's star lit with one soft glow, a single 600 ms fade-in -----------------------------------------
  for (const look of ["cover", "marked"]) {
    const { context, page, problems } = await openApp(browser, base, "/walk", { look, count: 12, todayWalked: true, finish: true });
    await page.getByRole("heading", { name: "Walk complete", exact: true }).waitFor();
    const sky = page.locator(".walk-finish .sky");
    assert.equal(await sky.isVisible(), true, look + ": the sky stands at the top of the finish");
    assert.equal(await sky.getAttribute("aria-hidden"), "true");
    assert.equal(await sky.locator(".star").count(), 12);
    assert.equal(await sky.locator(".star-lit").count(), 1, look + ": today's star is lit");
    const lit = sky.locator(".star-lit");
    assert.match(await style(lit, "boxShadow"), /rgba\(240, 201, 135, 0\.35\)/, look + ": one soft glow around it");
    const fades = await page.evaluate(() => document.getAnimations().map((a) => ({ name: a.animationName, duration: a.effect.getTiming().duration })));
    assert.deepEqual(fades, [{ name: "star-lit-in", duration: 600 }], look + ": one animation, a 600 ms fade-in");
    // The words of the finish are unchanged.
    assert.equal(await page.locator(".walk-finish .row-with-icon").innerText(), "12 days walked");
    assert.equal(await page.locator(".walk-finish .row-detail-body").innerText(), "A day away is an invitation to begin again. There is no penalty.");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, look + ": no sideways scroll");
    assert.deepEqual(problems, [], look);
    await context.close();
  }
  {
    const { context, page } = await openApp(browser, base, "/walk", { count: 12, todayWalked: true, finish: true, reducedMotion: true });
    await page.getByRole("heading", { name: "Walk complete", exact: true }).waitFor();
    assert.equal(await page.locator(".walk-finish .star-lit").count(), 1, "with Reduce Motion the lit star is simply there");
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0, "and nothing moves");
    await context.close();
  }
  {
    const { context, page } = await openApp(browser, base, "/walk", { mode: "light", count: 12, todayWalked: true, finish: true });
    await page.getByRole("heading", { name: "Walk complete", exact: true }).waitFor();
    assert.equal(await style(page.locator(".walk-finish .sky"), "display"), "none", "no sky on the finish in a light mode");
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0, "nothing animates there");
    await context.close();
  }

  // ---- 200 % text: the sky, the line and the pill do not clip ----------------------------------------------------------------
  for (const width of [390, 320]) {
    const { context, page } = await openApp(browser, base, "/", { count: 12, width, height: 640 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "34px";
      window.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(() => document.documentElement.dataset.text === "large");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `no horizontal scroll at ${width}px, 200 %`);
    assert.equal(await page.locator(".today .cover").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, "the hook is not clipped");
    assert.equal(await page.locator(".today .sky-caption").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true, "the sky line is not clipped");
    const pill = await page.locator(".today .cover-button").boundingBox();
    assert.ok(pill.width <= width, "the pill fits the screen");
    await context.close();
  }
}
