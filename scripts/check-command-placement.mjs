#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, webkit } = require("playwright");
const { startStaticServer, readMaterialAuditExpression } = require("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { server, origin } = await startStaticServer({ projectRoot });
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR;
if (directory) mkdirSync(directory, { recursive: true });
const errors = [];
let browser;

const settle = async (page) => {
  await page.evaluate(() => new Promise((done) => {
    requestAnimationFrame(() => requestAnimationFrame(done));
  }));
  // Counted frames can share a timestamp in a busy headless browser. Await
  // the actual entrance transition before measuring its scaled rectangle.
  await page.locator("[data-command-results]").evaluate((element) => (
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})))
  ));
};
const readPopup = (page, selector = "[data-command-results]") => page.evaluate((selector) => {
  const popup = document.querySelector(selector);
  const form = document.querySelector("[data-command-form]");
  const surface = innerWidth <= 680 ? form : form.closest("[data-floating-console]");
  const box = (element) => element.getBoundingClientRect().toJSON();
  return {
    popup: box(popup), form: box(form), surface: box(surface),
    height: popup.clientHeight, content: popup.scrollHeight, scrollTop: popup.scrollTop,
    placement: popup.dataset.placement, count: popup.children.length,
    viewport: { width: innerWidth, height: innerHeight },
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
}, selector);
const assertPopup = async (page, selector) => {
  const state = await readPopup(page, selector);
  const { popup, form, surface, viewport } = state;
  assert.ok(popup.top >= 7.5 && popup.bottom <= viewport.height - 7.5, JSON.stringify(state));
  assert.ok(Math.abs(popup.left - form.left) < 0.6, "The left edge follows the search segment: " + JSON.stringify(state));
  assert.ok(Math.abs(popup.right - surface.right) < 0.6, "The right edge follows the visible material: " + JSON.stringify(state));
  const above = surface.top - 16;
  const below = viewport.height - surface.bottom - 16;
  const room = state.placement === "above" ? above : below;
  assert.ok(state.placement === "above"
    ? Math.abs(popup.bottom - (surface.top - 8)) < 0.6
    : Math.abs(popup.top - (surface.bottom + 8)) < 0.6, JSON.stringify(state));
  assert.equal(state.overflow, 0);
  if (Math.max(above, below) >= state.content) {
    assert.ok(state.content - state.height <= 1, "No scrolling when the whole list fits.");
  }
  assert.ok(popup.height <= room + 0.6, "Only available viewport space limits height.");
  return state;
};
const capture = async (page, name) => {
  if (directory) await page.screenshot({ path: join(directory, engine + "-search-" + name + ".jpg"), quality: 80 });
};
const dragTo = async (page, top, left) => {
  const shell = page.locator('[data-floating-console="navigation"]');
  const box = await shell.boundingBox();
  const x = box.x + box.width - 5;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + ((left ?? box.x) - box.x), y + top - box.y, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  assert.equal(await page.locator("[data-command-input]").getAttribute("aria-expanded"), "true",
    "Dragging the material keeps the open search intact.");
};

try {
  browser = await ({ chromium, webkit })[engine].launch({ headless: true });
  for (const theme of ["light", "dark"]) {
    for (const [label, width, height] of [
      ["desktop", 1440, 900], ["short", 1280, 430], ["tablet", 1024, 768],
      ["mobile", 390, 844], ["compact", 320, 568], ["keyboard", 390, 430], ["reflow", 720, 450],
    ]) {
      const page = await browser.newPage({
        viewport: { width, height }, colorScheme: theme, reducedMotion: "reduce",
        hasTouch: width <= 680 || label === "tablet", isMobile: width <= 680,
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const input = page.locator("[data-command-input]");
      await input.focus();
      await settle(page);
      assert.equal((await assertPopup(page)).count, 8);
      const material = await page.evaluate(readMaterialAuditExpression);
      assert.deepEqual(material.failures, []);
      await capture(page, label + "-" + theme);

      if (label === "desktop") {
        await dragTo(page, 20);
        assert.equal((await assertPopup(page)).placement, "below");
        await capture(page, "top-" + theme);
        await dragTo(page, 418);
        const middle = await assertPopup(page);
        assert.ok(middle.content > middle.height, "An actually constrained midpoint remains scrollable.");
        await capture(page, "middle-" + theme);
        await dragTo(page, 20, width - 980 - 8);
        await assertPopup(page);
        await capture(page, "top-right-" + theme);
        await page.setViewportSize({ width: 1280, height: 600 });
        await page.waitForFunction(() => {
          const shell = document.querySelector('[data-floating-console="navigation"]').getBoundingClientRect();
          const popup = document.querySelector("[data-command-results]").getBoundingClientRect();
          return shell.top >= 8 && shell.right <= innerWidth - 7.5
            && Math.abs(popup.top - shell.bottom - 8) < 0.6
            && Math.abs(popup.right - shell.right) < 0.6;
        }, null, { timeout: 3000 });
        await settle(page);
        await assertPopup(page);
        await capture(page, "resized-open-" + theme);
        await page.setViewportSize({ width, height });
        await settle(page);
        await input.fill("несуществующийzzzzзапрос");
        await settle(page);
        assert.equal(await page.locator("[data-command-status]").isVisible(), true);
        // Resizing back can move a bottom-anchored console down. A short
        // status may legitimately fit above it; the geometry contract decides.
        await assertPopup(page, "[data-command-status]");
        await capture(page, "empty-after-resize-" + theme);
        await input.fill("");
        await dragTo(page, 822, 16);
        assert.equal((await assertPopup(page)).placement, "above");
      }

      await input.press("ArrowUp");
      const active = await page.evaluate(() => {
        const input = document.querySelector("[data-command-input]");
        const button = document.getElementById(input.getAttribute("aria-activedescendant"));
        const list = document.querySelector("[data-command-results]").getBoundingClientRect();
        const box = button.getBoundingClientRect();
        return { id: button.id, inside: box.top >= list.top && box.bottom <= list.bottom + 1 };
      });
      assert.ok(active.id.endsWith("-contact") && active.inside, JSON.stringify(active));
      await input.fill("наркомфин");
      await settle(page);
      const filtered = await assertPopup(page);
      assert.ok(filtered.count > 0 && filtered.count < 8);
      await input.press("Escape");
      assert.equal(await input.getAttribute("aria-expanded"), "false");
      console.log("PASS " + engine + " command placement " + label + " " + theme);
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
