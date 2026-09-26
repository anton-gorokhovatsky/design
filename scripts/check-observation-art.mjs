import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const require = createRequire(import.meta.url);
const { startStaticServer } = require("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || ".qa-artifacts/observation-release";
mkdirSync(directory, { recursive: true });
const { server, origin } = await startStaticServer({ projectRoot: process.cwd() });
const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
const errors = [];
const cardSelector = "[data-observation-title-card]";
const progress = page => page.locator("[data-observation-progress]").innerText();
const capture = (page, name) => page.screenshot({ path: join(directory, `${engine}-${name}.png`) });
try {
  for (const theme of ["light", "dark"]) {
    for (const [name, width, height, scale] of [
      ["desktop", 1440, 900, 1], ["tablet", 1024, 768, 1],
      ["mobile", 390, 844, 1], ["compact", 320, 568, 1], ["reflow", 720, 700, 2],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme });
      page.on("pageerror", error => errors.push(error.message));
      const requests = [];
      page.on("request", request => requests.push(request.url()));
      await page.goto(origin);
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${scale * 16}px`; }, scale);
      assert.equal(requests.filter(url => url.includes("/observation/")).length, 0);
      await page.locator("[data-start-observation]").click();
      await page.locator("[data-observation-pause]").click();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      assert.equal(await progress(page), "01 / 08");
      assert.ok(await page.locator(cardSelector).isVisible());
      assert.equal(await page.locator("[data-observation-preview]").isVisible(), false);
      const geometry = await page.locator(cardSelector).evaluate(card => {
        const rect = card.getBoundingClientRect();
        const intersects = other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top;
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          horizontal: rect.left >= 0 && rect.right <= innerWidth,
          obstructions: innerWidth > 900 ? [...document.querySelectorAll('[data-floating-console], [data-map-inspector]')]
            .filter(el => getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none")
            .filter(el => intersects(el.getBoundingClientRect())).map(el => el.className) : [],
        };
      });
      assert.equal(geometry.overflow, false, `${name}: no document overflow`);
      assert.ok(geometry.horizontal, name);
      assert.deepEqual(geometry.obstructions, [], `${name}: artwork clears the controls`);
      await capture(page, `intro-${name}-${theme}`);
      if (width === 1440) await page.locator(cardSelector).screenshot({ path: join(directory, `${engine}-intro-crop-${theme}.png`) });
      await page.getByRole("button", { name: "ПРОПУСТИТЬ", exact: true }).click();
      assert.equal(await progress(page), "02 / 08");
      assert.equal(await page.locator(cardSelector).isVisible(), false);
      assert.equal(await page.locator("[data-atlas-video]").evaluate(video => video.paused), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("[data-signal-field]").getAttribute("data-observation-active"), null);
      await page.close();
    }
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin);
  await page.locator("[data-start-observation]").click();
  await page.waitForFunction(() => document.querySelector('[data-atlas-video]').currentTime > .1);
  await page.locator("[data-observation-pause]").click();
  const frozen = await page.locator("[data-atlas-video]").evaluate(video => video.currentTime);
  await page.waitForTimeout(200);
  assert.ok(Math.abs(await page.locator("[data-atlas-video]").evaluate(video => video.currentTime) - frozen) < .05);
  await page.locator("[data-observation-next]").click();
  await page.locator("[data-observation-pause]").click();
  await page.locator("[data-observation-next]").click();
  await page.locator("[data-observation-next]").click();
  await page.waitForTimeout(450);
  assert.equal(await page.locator(cardSelector).getAttribute("data-scene"), "chapter");
  await capture(page, "filament-transition");
  await page.locator("[data-observation-pause]").click();
  await page.locator(cardSelector).evaluate(card => Promise.all(card.getAnimations().map(animation => animation.ready)));
  const animationTime = await page.locator(cardSelector).evaluate(card => card.getAnimations()[0].currentTime);
  await page.waitForTimeout(200);
  assert.equal(await page.locator(cardSelector).evaluate(card => card.getAnimations()[0].currentTime), animationTime);
  await page.locator("[data-observation-pause]").click();
  await page.locator(cardSelector).waitFor({ state: "hidden" });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(cardSelector).isVisible(), false);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("[data-start-observation]").click();
  assert.equal(await page.locator("[data-observation-pause]").innerText(), "ПРОДОЛЖИТЬ");
  assert.equal(await page.locator("[data-atlas-video]").evaluate(video => video.paused), true);
  await capture(page, "reduced-motion");
  await page.keyboard.press("Escape");
  await page.close();

  // Verify the visitor's 90-second route, including pause/resume, without waiting 90 s.
  const timed = await browser.newPage();
  await timed.clock.install();
  await timed.goto(origin);
  await timed.locator("[data-start-observation]").click();
  await timed.clock.fastForward(1000);
  await timed.locator("[data-observation-pause]").click();
  await timed.clock.fastForward(5000);
  assert.equal(await progress(timed), "01 / 08");
  await timed.locator("[data-observation-pause]").click();
  await timed.clock.fastForward(2000);
  assert.equal(await progress(timed), "02 / 08");
  for (let step = 3; step <= 8; step++) {
    await timed.clock.fastForward(14500);
    assert.equal(await progress(timed), `${String(step).padStart(2, "0")} / 08`);
  }
  await timed.locator("[data-observation-next]").click();
  assert.equal(await timed.locator(cardSelector).isVisible(), false);
  await timed.close();
  assert.deepEqual(errors, []);
  console.log(`${engine}: route artwork, motion, skip, pause, timing, Escape, responsive placement PASS`);
} finally {
  await browser.close();
  server.close();
}
