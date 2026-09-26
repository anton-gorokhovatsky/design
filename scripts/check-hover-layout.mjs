import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";
import { mapItems } from "../js/map-data.js";

const { startStaticServer } = createRequire(import.meta.url)("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const { server, origin } = await startStaticServer({ projectRoot: process.cwd() });
const browser = await ({ chromium, webkit })[engine].launch();
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || ".qa-artifacts/hover-layout";
mkdirSync(directory, { recursive: true });
const results = [], errors = [];
const inspect = () => {
  const rect = element => {
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const preview = document.querySelector(".map-hover-preview"), author = document.querySelector(".site-header");
  const authorStyle = getComputedStyle(author);
  const panels = [...document.querySelectorAll("[data-floating-console]")].map(rect).filter(r => r.width && r.height);
  const frames = [...preview.querySelectorAll(".map-hover-preview__mosaic-main, .map-hover-preview__mosaic-slot, .map-hover-preview__readout")]
    .map(rect).filter(r => r.width && r.height);
  const collisions = frames.filter(frame => panels.some(panel => frame.left < panel.right - .5 && frame.right > panel.left + .5
    && frame.top < panel.bottom - .5 && frame.bottom > panel.top + .5));
  return { author: rect(author), authorVisible: authorStyle.visibility === "visible" && Number(authorStyle.opacity) === 1,
    previewVisible: preview.classList.contains("is-visible"), compact: preview.classList.contains("is-compact-preview"),
    collisions, outside: frames.filter(r => r.left < -.5 || r.top < -.5 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5) };
};
try {
  for (const [width, height] of [[1440, 900], [1024, 768], [720, 450]]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme, reducedMotion: "reduce" });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelector(".whoop-level"));
    await page.waitForFunction(() => !document.querySelector("[data-map-links][data-layout-pending]"));
    const initial = (await page.evaluate(inspect)).author;
    for (const [index, item] of mapItems.filter(item => item.previewVideo).entries()) {
      const target = page.locator(`[data-map-id="${item.id}"]`);
      if (index % 2) await target.focus();
      else await target.hover();
      await page.waitForFunction(id => {
        const preview = document.querySelector(".map-hover-preview");
        return preview.classList.contains("is-visible") && preview.querySelector("video").dataset.previewId === id;
      }, item.id);
      const result = await page.evaluate(inspect);
      results.push({ width, theme, id: item.id, ...result });
      assert.ok(result.authorVisible, `${item.id}: hover/focus must retain the author card.`);
      assert.deepEqual(result.author, initial, `${item.id}: hover/focus must not move the author card.`);
      assert.deepEqual(result.collisions, [], `${width} ${item.id}: reel frames must clear persistent consoles.`);
      assert.deepEqual(result.outside, [], `${width} ${item.id}: preview must fit the viewport.`);
      if (item.id === "doronin") {
        // Layout is independent of whether the native decoder has reached canplay.
        // Native media playback is covered by check-reel-preview.mjs.
        await page.screenshot({ path: `${directory}/${engine}-${width}-${theme}.png` });
      }
    }
    await page.mouse.move(0, 0);
    await page.locator(".whoop-foot button").focus();
    await page.waitForFunction(() => !document.querySelector(".map-hover-preview").classList.contains("is-visible"));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement === document.querySelector("[data-whoop-toggle]"));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement === document.querySelector(".whoop-foot button"));
    console.log(`PASS ${engine} ${width} ${theme}: 17 hover/focus previews, persistent card, clear consoles, settings.`);
    await page.close();
  }
  for (const [width, height] of [[1440, 900], [1024, 768], [720, 450]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "no-preference" });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !document.querySelector("[data-map-links][data-layout-pending]"));
    await page.locator('[data-map-id="doronin"]').hover();
    for (let frame = 0; frame < 24; frame++) {
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const result = await page.evaluate(inspect);
      assert.ok(result.authorVisible, "The author card must stay visible during preview entrance.");
      assert.deepEqual(result.collisions, [], `${width}: the entrance must stay within the reserved space.`);
    }
    await page.screenshot({ path: `${directory}/${engine}-${width}-motion.png` });
    await page.close();
    console.log(`PASS ${engine} ${width}: 24 entrance frames keep the author visible and the consoles clear.`);
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(`${directory}/${engine}-results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
}
