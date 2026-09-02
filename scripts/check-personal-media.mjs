#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, webkit } = require("playwright");
const { startStaticServer, readMaterialAuditExpression } = require("./browser-contracts.cjs");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine), "Supported browser required.");
const artifactDirectory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || "";
if (artifactDirectory) mkdirSync(artifactDirectory, { recursive: true });
const { server, origin } = await startStaticServer({ projectRoot });
let browser;
const errors = [];
const select = (page, id) => page.evaluate(async (point) => {
  const source = Array.from(document.scripts).find((script) => (
    script.src.includes("/js/map-engine.js?")
  )).src;
  const { selectMapItem } = await import(source);
  selectMapItem(point, { reveal: true });
}, id);
const capture = async (page, name) => {
  if (!artifactDirectory) return;
  await page.screenshot({
    path: join(artifactDirectory, engine + "-" + name + ".jpg"),
    quality: 78,
  });
};

try {
  browser = await ({ chromium, webkit })[engine].launch({ headless: true });
  for (const theme of ["light", "dark"]) {
    for (const [label, width, height] of [
      ["desktop", 1440, 900],
      ["narrow-desktop", 1100, 768],
      ["tablet", 1024, 768],
      ["mobile", 390, 844],
      ["compact", 320, 568],
      ["reflow", 720, 450],
    ]) {
      const page = await browser.newPage({
        viewport: { width, height }, colorScheme: theme, reducedMotion: "reduce",
      });
      page.on("pageerror", (error) => errors.push(error.message));
      const thirdParty = [];
      page.on("request", (request) => {
        if (/youtube|ytimg|googlevideo/.test(new URL(request.url()).hostname)) {
          thirdParty.push(request.url());
        }
      });
      // This fixture tests our lifecycle, not YouTube availability or playback.
      await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="ru"><title>Player lifecycle fixture</title><body><button>Fixture play</button></body></html>',
      }));
      await page.goto(origin, { waitUntil: "load" });
      await page.locator('[data-map-id="youtube"]').waitFor({ state: "attached" });
      const player = page.locator("[data-personal-media]");
      assert.equal(await player.isVisible(), false, "No player on the untouched map.");
      assert.deepEqual(thirdParty, [], "No third-party video requests on entry.");
      // The relocated point must be directly reachable, not only through search.
      await page.locator('[data-map-id="youtube"]').click();
      // The player opens over this map sector: clear pointer hover for an idle-material audit.
      await page.mouse.move(0, 0);
      await player.waitFor({ state: "visible" });
      await page.evaluate(() => document.fonts.ready);
      await page.locator("[data-personal-media-poster]").evaluate((image) => image.decode());
      await page.waitForFunction(() => {
        const card = document.querySelector("[data-map-inspector]");
        return getComputedStyle(card).opacity === "1"
          && [
            ...card.getAnimations(),
            ...document.querySelector("[data-personal-media]").getAnimations({ subtree: true }),
          ].every((animation) => animation.playState !== "running");
      });
      const poster = page.locator("[data-play-personal-media]");
      const screen = page.locator("[data-personal-media-screen]");
      assert.equal(await poster.isVisible(), true);
      assert.equal(await player.locator("iframe").count(), 0);
      assert.deepEqual(thirdParty, [], "Selecting YouTube must remain first-party.");
      assert.equal(await page.locator("[data-personal-media-poster]").evaluate((image) => (
        image.complete && image.naturalWidth === 1280
      )), true);
      const material = await page.evaluate(readMaterialAuditExpression);
      assert.deepEqual(material.failures.filter((surface) => (
        surface.surface.startsWith("personal-media")
      )), [], "Player controls use the shared material.");
      const geometry = await page.evaluate(() => {
        const box = (selector) => {
          const bounds = document.querySelector(selector).getBoundingClientRect();
          return { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom,
            width: bounds.width, height: bounds.height };
        };
        return {
          player: box("[data-personal-media]"),
          screen: box("[data-personal-media-screen]"),
          inspector: box("[data-map-inspector]"),
          inline: document.querySelector("[data-personal-media-slot]")
            .contains(document.querySelector("[data-personal-media]")),
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      assert.ok(geometry.screen.width >= 200 && geometry.screen.height >= 200);
      assert.ok(geometry.screen.x >= 0 && geometry.screen.right <= width + 1);
      assert.equal(geometry.overflow, 0);
      assert.ok(geometry.inspector.y >= 0, "Inspector header stays reachable.");
      assert.ok(geometry.inspector.bottom <= height, "Inspector scrolls within the viewport.");
      assert.equal(geometry.inline, width <= 1024);
      if (width > 1024) {
        assert.ok(geometry.inspector.right + 12 <= geometry.player.x,
          "Desktop card and player must have a real gap.");
        assert.ok(geometry.player.bottom <= height - 100, "Player clears the dock.");
      }
      await capture(page, label + "-" + theme + "-youtube-preview");
      await poster.scrollIntoViewIfNeeded();
      await poster.focus();
      await page.keyboard.press("Enter");
      await player.locator("iframe").waitFor({ state: "visible" });
      await page.waitForFunction(() => (
        document.querySelector("[data-personal-media-status]").textContent === "Плеер YouTube открыт"
      ));
      assert.equal(thirdParty.length, 1, "Only explicit Play creates the iframe.");
      const frame = player.locator("iframe");
      const url = new URL(await frame.getAttribute("src"));
      assert.equal(url.hostname, "www.youtube-nocookie.com");
      assert.equal(url.pathname, "/embed/bkbJsunB5zY");
      assert.equal(url.searchParams.get("autoplay"), "1");
      assert.equal(url.searchParams.get("playsinline"), "1");
      assert.equal(url.searchParams.get("origin"), origin);
      assert.equal(await frame.getAttribute("referrerpolicy"), "strict-origin-when-cross-origin");
      assert.equal(await frame.getAttribute("allowfullscreen"), "");
      if (width > 1024) {
        await frame.evaluate((element) => { element.dataset.retained = "yes"; });
        await select(page, "coffee");
        assert.equal(await frame.getAttribute("data-retained"), "yes",
          "Changing points retains the same browsing context.");
        assert.equal(thirdParty.length, 1, "Changing points never restarts the stream.");
        await page.locator("[data-close-personal-media]").click();
        assert.equal(await player.isVisible(), false);
        assert.equal(await frame.count(), 0, "Closing destroys the browsing context.");
        assert.notEqual(await page.locator("[data-map-inspector]").getAttribute("data-selected-map-id"), "youtube",
          "Closing must not select and reopen YouTube.");
        await select(page, "youtube");
        assert.equal(await poster.isVisible(), true);
        await page.locator("[data-close-personal-media]").click();
        assert.equal(await page.locator("[data-open-personal-media]").evaluate((e) => e === document.activeElement), true);
        await page.locator("[data-open-personal-media]").click();
        assert.equal(await poster.isVisible(), true, "Reopening returns to a silent poster.");
        await page.locator("[data-close-personal-media]").focus();
        await page.keyboard.press("Escape");
        assert.equal(await player.isVisible(), false);
      } else {
        await select(page, "coffee");
        assert.equal(await player.isVisible(), false, "Mobile playback belongs to its card.");
        assert.equal(await frame.count(), 0);
      }
      console.log("PASS " + engine + " " + label + " " + theme);
      await page.close();
    }
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>Lifecycle fixture</title>",
  }));
  await page.goto(origin + "/?point=youtube", { waitUntil: "load" });
  await page.locator("[data-play-personal-media]").click();
  await page.locator("[data-personal-media] iframe").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => !document.querySelector("[data-personal-media] iframe"));
  assert.equal(await page.locator("[data-play-personal-media]").isVisible(), true,
    "Crossing the layout breakpoint never silently restarts playback.");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("[data-play-personal-media]").click();
  await page.locator('[data-open-panel="contact"]').click();
  await page.waitForFunction(() => document.querySelector("[data-personal-media]").hidden);
  assert.equal(await page.locator("[data-personal-media] iframe").count(), 0,
    "A full-screen content panel cannot hide an active stream.");
  assert.deepEqual(errors, [], "No application exceptions.");
  console.log("PASS " + engine + " responsive transition and content-panel teardown.");
  await page.close();
} finally {
  await browser?.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
