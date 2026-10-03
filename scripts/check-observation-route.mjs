import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const { startStaticServer } = createRequire(import.meta.url)("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || ".qa-artifacts/observation-direct";
mkdirSync(directory, { recursive: true });
const { server, origin } = await startStaticServer({ projectRoot: process.cwd() });
const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
const errors = [];
const progress = page => page.locator("[data-observation-progress]").innerText();
const capture = async (page, name) => {
  await page.locator("[data-observation-showcase].is-visible img[src], [data-observation-preview]:not([hidden]) img").evaluateAll(
    images => Promise.all(images.map(image => image.decode())),
  );
  return page.screenshot({ path: join(directory, `${engine}-${name}.png`), animations: "disabled" });
};
const waitForAuthor = async (page, foreground) => {
  await page.waitForFunction(foreground => {
    const author = document.querySelector(".site-header");
    const card = getComputedStyle(author);
    const glow = getComputedStyle(document.querySelector(".whoop-field"));
    return author.inert === !foreground && [card, glow].every(style => (
      style.visibility === "visible" && (foreground
        ? Number(style.opacity) > .99
        : Number(style.opacity) <= .16 && style.filter === "blur(3px)" && style.pointerEvents === "none")
    ));
  }, foreground);
};

try {
  for (const theme of ["light", "dark"]) {
    for (const [name, width, height, scale] of [
      ["desktop", 1440, 900, 1], ["tablet", 1024, 768, 1],
      ["mobile", 390, 844, 1], ["compact", 320, 568, 1], ["reflow", 720, 700, 2],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme, reducedMotion: "no-preference" });
      page.on("pageerror", error => errors.push(error.message));
      const requests = [];
      page.on("request", request => requests.push(request.url()));
      await page.goto(origin);
      await page.evaluate(scale => { document.documentElement.style.fontSize = `${scale * 16}px`; }, scale);
      await waitForAuthor(page, true);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.querySelector('[data-whoop-recovery]').textContent.includes('77'));
      const authorBefore = await page.locator(".site-header").boundingBox();
      await page.locator("[data-start-observation]").click();
      await page.locator("[data-observation-pause]").click();
      await page.evaluate(() => document.fonts.ready);
      await waitForAuthor(page, false);
      assert.deepEqual(await page.locator(".site-header").boundingBox(), authorBefore);
      assert.equal(await progress(page), "01 / 14");
      assert.equal(await page.locator("[data-observation-next]").getAttribute("aria-label"), "Следующий шаг");
      assert.equal(await page.locator("[data-observation-title-card]").count(), 0);
      await page.locator(width > 900 ? "[data-observation-showcase]" : "[data-observation-preview]").waitFor({ state: "visible", timeout: 5000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await capture(page, `start-${name}-${theme}`);
      if (width === 1440) await page.locator("[data-map-inspector]").screenshot({ path: join(directory, `${engine}-readout-${theme}.png`) });
      // Every case and principle retains a real visual on both layouts.
      for (let step = 2; step <= 13; step++) {
        await page.locator("[data-observation-next]").click();
        assert.equal(await progress(page), `${String(step).padStart(2, "0")} / 14`);
        await waitForAuthor(page, false);
        const controls = await page.locator("[data-observation-controls]").boundingBox();
        assert.ok(controls.y >= 0 && controls.y + controls.height <= height + 1, "Route controls remain outside the scrolling text.");
        if ([3, 4, 10, 11, 13].includes(step)) {
          assert.ok(await page.locator("[data-map-inspector]").isVisible());
          assert.equal(await page.locator("[data-observation-title-card]").count(), 0);
          if (name === "desktop" || name === "mobile") await capture(page, `step-${step}-${name}-${theme}`);
        }
      }
      assert.equal(requests.filter(url => url.includes("/observation/")).length, 0);
      await page.keyboard.press("Escape");
      await waitForAuthor(page, true);
      assert.deepEqual(await page.locator(".site-header").boundingBox(), authorBefore);
      assert.equal(await page.locator("[data-signal-field]").getAttribute("data-observation-active"), null);
      if (name === "desktop" || name === "mobile") await capture(page, `returned-${name}-${theme}`);
      await page.close();
    }
  }

  const durations = [14000, 12000, 12000, 8000, 14000, 14000, 8000, 12000, 10000, 16000, 8000, 14000, 8000];
  assert.equal(durations.reduce((sum, duration) => sum + duration, 0), 150000);
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install();
  await page.goto(origin);
  await page.locator("[data-start-observation]").click();
  await page.clock.fastForward(1000);
  await page.locator("[data-observation-pause]").click();
  await page.clock.fastForward(5000);
  assert.equal(await progress(page), "01 / 14");
  await page.locator("[data-observation-pause]").click();
  await page.clock.fastForward(durations[0] - 1000);
  assert.equal(await progress(page), "02 / 14");
  for (let step = 3; step <= 14; step++) {
    await page.clock.fastForward(durations[step - 2]);
    assert.equal(await progress(page), `${String(step).padStart(2, "0")} / 14`);
  }
  assert.equal(await page.locator("[data-observation-pause]").isVisible(), false);
  await page.locator("[data-observation-next]").click();
  assert.equal(await page.locator("[data-signal-field]").getAttribute("data-observation-active"), null);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("[data-start-observation]").click();
  assert.equal(await page.locator("[data-observation-pause]").getAttribute("aria-label"), "Продолжить обзор");
  await page.clock.fastForward(20000);
  assert.equal(await progress(page), "01 / 14");
  await page.keyboard.press("Escape");
  await page.close();
  assert.deepEqual(errors, []);
  console.log(`${engine}: immediate route content, author/glow visibility, pause, 150-second timing, Escape and reduced motion PASS`);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
