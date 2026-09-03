#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, webkit } = require("playwright");
const { startStaticServer, chromiumScenarioCatalog } = require("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { server, origin } = await startStaticServer({ projectRoot });
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR;
if (directory) mkdirSync(directory, { recursive: true });
const ids = ["garage", "optimal", "ilmix", "running", "youtube"];
const scenarios = chromiumScenarioCatalog.filter((state) => (
  /^(desktop-(light|dark)|tablet-(light|dark)|mobile-(390|320)-(light|dark)|zoom-200-light)$/.test(state.label)
));
const errors = [];
let browser;
const read = (page) => page.evaluate(() => Array.from(
  document.querySelectorAll(".map-node__surface"), (surface) => {
    const glyph = surface.parentElement;
    const button = surface.closest("[data-map-id]");
    const style = getComputedStyle(glyph);
    return {
      id: button.dataset.mapId, hidden: glyph.getAttribute("aria-hidden"),
      interactiveChildren: glyph.querySelectorAll("button,a,input,[tabindex]").length,
      x: button.style.getPropertyValue("--x"), y: button.style.getPropertyValue("--y"),
      box: glyph.getBoundingClientRect().toJSON(), transform: style.transform,
      background: style.backgroundImage, shadow: style.boxShadow,
      display: getComputedStyle(surface).display,
      pointerEvents: getComputedStyle(surface).pointerEvents,
      skin: getComputedStyle(surface, "::before").transform,
      animations: surface.getAnimations({ subtree: true }).map((animation) => ({
        name: animation.animationName, state: animation.playState,
        time: animation.currentTime, duration: animation.effect.getComputedTiming().duration,
      })),
    };
  },
));
const capture = async (page, name) => {
  if (!directory) return;
  await page.screenshot({ path: join(directory, engine + "-sphere-" + name + ".jpg"), quality: 85 });
  if (name.startsWith("desktop")) {
    const bounds = await page.locator('[data-map-id="garage"] .map-node__glyph').boundingBox();
    await page.screenshot({ path: join(directory, engine + "-sphere-crop-" + name + ".jpg"), quality: 95,
      clip: { x: Math.floor(bounds.x - 10), y: Math.floor(bounds.y - 10),
        width: Math.ceil(bounds.width + 20), height: Math.ceil(bounds.height + 20) } });
  }
};
const assertStopped = async (page) => {
  await page.waitForFunction(() => [...document.querySelectorAll(".map-node__surface")]
    .every((surface) => getComputedStyle(surface).display === "none"
      && surface.getAnimations({ subtree: true }).length === 0));
  for (const state of await read(page)) {
    assert.equal(state.display, "none", state.id);
    assert.equal(state.animations.length, 0, state.id);
  }
};

try {
  browser = await ({ chromium, webkit })[engine].launch({ headless: true });
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height },
      colorScheme: scenario.theme, reducedMotion: "no-preference", hasTouch: scenario.mobile,
      isMobile: scenario.mobile, deviceScaleFactor: scenario.deviceScaleFactor || 1 });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelectorAll(".map-node__surface").length === 5);
    // Mobile framing follows fonts.ready through two scheduled layout passes.
    // Measure axial motion only after that existing entrance has settled.
    await page.evaluate(async () => {
      await new Promise((done) => {
        let frames = 0;
        const next = () => ++frames === 4 ? done() : requestAnimationFrame(next);
        requestAnimationFrame(next);
      });
      const entrance = document.querySelector(".practice-map").getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity
          && animation.playState === "running");
      await Promise.all(entrance.map((animation) => animation.finished.catch(() => {})));
    });
    const before = await read(page);
    assert.deepEqual(before.map((state) => state.id), ids);
    for (const state of before) {
      assert.equal(state.hidden, "true");
      assert.equal(state.interactiveChildren, 0);
      assert.equal(state.pointerEvents, "none");
      assert.equal(state.animations.length, 2, state.id);
      assert.ok(state.animations.every((a) => a.name === "sphere-axial-turn"
        && a.state === "running" && a.duration >= 88000 && a.duration <= 120000), JSON.stringify(state));
    }
    await page.waitForTimeout(180);
    const after = await read(page);
    after.forEach((state, index) => {
      const previous = before[index];
      assert.notEqual(state.skin, previous.skin, state.id + ": surface really turns");
      for (const property of ["x", "y", "transform", "background", "shadow"]) {
        assert.equal(state[property], previous[property], state.id + ": fixed " + property);
      }
      for (const property of ["x", "y", "width", "height"]) {
        assert.ok(Math.abs(state.box[property] - previous.box[property]) < 0.1,
          state.id + ": no orbital or silhouette motion");
      }
      assert.ok(state.animations[0].time > previous.animations[0].time);
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await capture(page, scenario.label);
    if (scenario.label.startsWith("desktop")) {
      const toggle = page.locator(".display-control [data-motion-toggle]");
      await toggle.click();
      await assertStopped(page);
      await capture(page, scenario.label + "-motion-off");
      await toggle.click();
      await page.waitForFunction(() => document.documentElement.dataset.reduceMotion !== "true");
      assert.ok((await read(page)).every((state) => state.animations.length === 2));
      await page.locator('[data-map-id="garage"]').focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator('[data-map-id="garage"]').getAttribute("aria-expanded"), "true");
      await page.keyboard.press("Escape");
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await assertStopped(page);
    await capture(page, scenario.label + "-system-static");
    if (engine === "chromium") {
      await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
      await assertStopped(page);
    }
    console.log("PASS " + engine + " sphere motion " + scenario.label);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
