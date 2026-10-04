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
      if (width > 900) await page.locator("[data-observation-pause]").click();
      assert.equal(await page.locator("[data-observation-pause]").getAttribute("data-paused"), "true");
      await page.evaluate(() => document.fonts.ready);
      await waitForAuthor(page, false);
      assert.deepEqual(await page.locator(".site-header").boundingBox(), authorBefore);
      assert.equal(await progress(page), "01 / 9");
      assert.equal(await page.locator("[data-observation-next]").getAttribute("aria-label"), "Следующий шаг");
      assert.equal(await page.locator("[data-observation-title-card]").count(), 0);
      await page.locator(width > 900 ? "[data-observation-showcase]" : "[data-observation-preview]").waitFor({ state: "visible", timeout: 5000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await capture(page, `start-${name}-${theme}`);
      if (width === 1440) await page.locator("[data-map-inspector]").screenshot({ path: join(directory, `${engine}-readout-${theme}.png`) });
      const frame = await page.locator("[data-map-inspector]").boundingBox();
      const controlsBefore = await page.locator("[data-observation-controls]").boundingBox();
      // Every project retains its native visual and the same reading frame.
      for (let step = 2; step <= 9; step++) {
        await page.locator("[data-observation-next]").click();
        assert.equal(await progress(page), `${String(step).padStart(2, "0")} / 9`);
        await waitForAuthor(page, false);
        const currentFrame = await page.locator("[data-map-inspector]").boundingBox();
        const controls = await page.locator("[data-observation-controls]").boundingBox();
        for (const key of ["x", "y", "width", "height"]) {
          assert.ok(Math.abs(frame[key] - currentFrame[key]) < 1, `Step ${step}: reading frame must not move (${key}).`);
          assert.ok(Math.abs(controlsBefore[key] - controls[key]) < 1, `Step ${step}: controls must stay in place (${key}).`);
        }
        assert.ok(controls.y >= 0 && controls.y + controls.height <= height + 1, "Route controls remain outside the scrolling text.");
        if ([2, 3, 4, 7, 8, 9].includes(step)) {
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

  const durations = [20000, 20000, 22000, 24000, 18000, 18000, 32000, 26000];
  assert.equal(durations.reduce((sum, duration) => sum + duration, 0), 180000);
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install();
  await page.goto(origin);
  await page.locator("[data-start-observation]").click();
  await page.clock.fastForward(1000);
  await page.locator("[data-observation-pause]").click();
  await page.clock.fastForward(5000);
  assert.equal(await progress(page), "01 / 9");
  await page.locator("[data-observation-pause]").click();
  await page.clock.fastForward(durations[0] - 1000);
  assert.equal(await progress(page), "02 / 9");
  for (let step = 3; step <= 9; step++) {
    await page.clock.fastForward(durations[step - 2]);
    assert.equal(await progress(page), `${String(step).padStart(2, "0")} / 9`);
  }
  assert.equal(await page.locator("[data-observation-pause]").isVisible(), false);
  await page.keyboard.press("ArrowRight");
  assert.equal(await progress(page), "09 / 9", "The final slide closes only with an explicit exit.");
  await page.locator("[data-observation-next]").click();
  assert.equal(await page.locator("[data-signal-field]").getAttribute("data-observation-active"), null);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("[data-start-observation]").click();
  assert.equal(await page.locator("[data-observation-pause]").getAttribute("aria-label"), "Продолжить обзор");
  await page.clock.fastForward(20000);
  assert.equal(await progress(page), "01 / 9");
  await page.keyboard.press("Escape");
  await page.close();
  const reader = await browser.newPage({ viewport: { width: 320, height: 568 } });
  reader.on("pageerror", error => errors.push(error.message));
  await reader.goto(origin);
  await reader.locator("[data-start-observation]").click();
  assert.equal(await reader.locator("[data-observation-pause]").getAttribute("data-paused"), "true", "Mobile starts at the reader's pace.");
  await reader.locator("[data-observation-steps]").selectOption("6");
  assert.equal(await progress(reader), "07 / 9");
  await reader.locator("[data-observation-pause]").click();
  await reader.locator("[data-observation-next]").click();
  assert.equal(await reader.locator("[data-observation-pause]").getAttribute("data-paused"), "true", "Manual next stops autoplay, just like previous.");
  await reader.locator("[data-observation-pause]").click();
  await reader.locator(".case-scroll").hover();
  await reader.mouse.wheel(0, 150);
  assert.equal(await reader.locator("[data-observation-pause]").getAttribute("data-paused"), "true", "Scrolling to read pauses the route.");
  await reader.locator("[data-observation-steps]").selectOption("6");
  const sourceDocument = await reader.evaluateHandle(() => document);
  await reader.locator("[data-map-link]").click();
  await reader.waitForFunction(() => document.body.hasAttribute("data-case-open"));
  assert.equal(await sourceDocument.evaluate(node => node === document), true, "Details open without reloading the route.");
  await reader.locator("[data-close-inspector]").click();
  await reader.waitForFunction(() => document.querySelector("[data-observation-progress]").textContent === "07 / 9"
    && !document.querySelector("[data-observation-controls]").hidden);
  assert.equal(await reader.locator("[data-observation-pause]").getAttribute("data-paused"), "true");
  await sourceDocument.dispose();
  await reader.close();
  assert.deepEqual(errors, []);
  console.log(`${engine}: route composition, 180-second timing, manual reading, named steps, detail return, Escape and reduced motion PASS`);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
