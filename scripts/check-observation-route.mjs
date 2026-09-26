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
  await page.locator("[data-observation-showcase].is-visible img[src], [data-observation-preview]:not([hidden])").evaluateAll(
    images => Promise.all(images.map(image => image.decode())),
  );
  return page.screenshot({ path: join(directory, `${engine}-${name}.png`), animations: "disabled" });
};
const waitForAuthor = async (page, visible) => {
  await page.waitForFunction(visible => {
    const card = getComputedStyle(document.querySelector(".site-header"));
    const glow = getComputedStyle(document.querySelector(".whoop-field"));
    return [card, glow].every(style => visible
      ? style.visibility === "visible" && Number(style.opacity) > .99
      : style.visibility === "hidden");
  }, visible);
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
      await page.locator("[data-start-observation]").click();
      await page.locator("[data-observation-pause]").click();
      await page.evaluate(() => document.fonts.ready);
      await waitForAuthor(page, false);
      assert.equal(await progress(page), "01 / 08");
      assert.equal(await page.locator("[data-observation-next]").innerText(), "ДАЛЬШЕ");
      assert.equal(await page.locator("[data-observation-title-card]").count(), 0);
      await page.locator(width > 900 ? "[data-observation-showcase]" : "[data-observation-preview]").waitFor({ state: "visible", timeout: 5000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await capture(page, `start-${name}-${theme}`);
      if (width === 1440) await page.locator("[data-map-inspector]").screenshot({ path: join(directory, `${engine}-readout-${theme}.png`) });
      // Traverse both former chapter boundaries and confirm content stays visible.
      for (let step = 2; step <= 7; step++) {
        await page.locator("[data-observation-next]").click();
        assert.equal(await progress(page), `${String(step).padStart(2, "0")} / 08`);
        await waitForAuthor(page, false);
        if (step === 4 || step === 7) {
          assert.ok(await page.locator("[data-map-inspector]").isVisible());
          assert.equal(await page.locator("[data-observation-title-card]").count(), 0);
          if (name === "desktop" || name === "mobile") await capture(page, `step-${step}-${name}-${theme}`);
        }
      }
      assert.equal(requests.filter(url => url.includes("/observation/")).length, 0);
      await page.keyboard.press("Escape");
      await waitForAuthor(page, true);
      assert.equal(await page.locator("[data-signal-field]").getAttribute("data-observation-active"), null);
      if (name === "desktop" || name === "mobile") await capture(page, `returned-${name}-${theme}`);
      await page.close();
    }
  }

  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install();
  await page.goto(origin);
  await page.locator("[data-start-observation]").click();
  await page.clock.fastForward(1000);
  await page.locator("[data-observation-pause]").click();
  await page.clock.fastForward(5000);
  assert.equal(await progress(page), "01 / 08");
  await page.locator("[data-observation-pause]").click();
  await page.clock.fastForward(Math.ceil(90000 / 7) - 1000);
  assert.equal(await progress(page), "02 / 08");
  for (let step = 3; step <= 8; step++) {
    await page.clock.fastForward(Math.ceil(90000 / 7));
    assert.equal(await progress(page), `${String(step).padStart(2, "0")} / 08`);
  }
  assert.equal(await page.locator("[data-observation-pause]").isVisible(), false);
  await page.locator("[data-observation-next]").click();
  assert.equal(await page.locator("[data-signal-field]").getAttribute("data-observation-active"), null);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("[data-start-observation]").click();
  assert.equal(await page.locator("[data-observation-pause]").innerText(), "ПРОДОЛЖИТЬ");
  await page.clock.fastForward(20000);
  assert.equal(await progress(page), "01 / 08");
  await page.keyboard.press("Escape");
  await page.close();
  assert.deepEqual(errors, []);
  console.log(`${engine}: immediate route content, author/glow visibility, pause, timing, Escape and reduced motion PASS`);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
