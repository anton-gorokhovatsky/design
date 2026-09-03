#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mapItems } from "../js/map-data.js";

const require = createRequire(import.meta.url);
const { chromium, webkit } = require("playwright");
const { startStaticServer, readMaterialAuditExpression } = require("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR;
if (directory) mkdirSync(directory, { recursive: true });
const { server, origin } = await startStaticServer({ projectRoot });
const errors = [];
let browser;
const select = (page, id) => page.evaluate(async (point) => {
  const script = [...document.scripts].find((entry) => entry.src.includes("/js/map-engine.js?")).src;
  (await import(script)).selectMapItem(point, { reveal: true });
  await new Promise(requestAnimationFrame);
}, id);

try {
  browser = await ({ chromium, webkit })[engine].launch({ headless: true });
  for (const theme of ["light", "dark"]) {
    for (const [label, width, height] of [
      ["desktop", 1440, 900], ["tablet", 1024, 768], ["mobile", 390, 844],
      ["compact", 320, 568], ["reflow", 720, 450],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme,
        reducedMotion: "reduce" });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const exhaustive = label === "desktop" || label === "mobile";
      const items = exhaustive ? mapItems : mapItems.filter((item) => [
        "narkomfin", "garage-app", "early-career", "coffee", "youtube", "private-practice", "running", "art",
      ].includes(item.id));
      for (const item of items) {
        await select(page, item.id);
        const state = await page.evaluate(() => {
          const link = document.querySelector("[data-map-link]");
          const identity = document.querySelector(".map-readout__identity");
          const description = document.querySelector(".map-readout__description");
          const related = document.querySelector("[data-map-related]");
          const style = getComputedStyle(link);
          const box = (element) => element.getBoundingClientRect().toJSON();
          return { hidden: link.hidden, text: link.textContent, href: link.getAttribute("href"),
            target: link.target, rel: link.rel, inside: link.parentElement === identity,
            surface: link.getAttribute("data-material-surface"), count: document.querySelectorAll("[data-map-link]").length,
            link: box(link), identity: box(identity), description: box(description),
            related: related.hidden ? null : box(related), meta: box(document.querySelector("[data-map-meta]")),
            fill: style.backgroundColor, blur: style.backdropFilter, underline: style.textDecorationLine,
            overflow: document.documentElement.scrollWidth - innerWidth };
        });
        const context = engine + " " + label + " " + theme + " " + item.id;
        assert.equal(state.count, 1, context + ": no duplicate link");
        assert.equal(state.inside, true, context + ": link belongs to the heading");
        assert.equal(state.surface, null, context + ": no nested material");
        assert.equal(state.overflow, 0, context + ": no horizontal overflow");
        assert.equal(state.hidden, Boolean(item.youtube) || !(item.href || item.kind === "practice"), context);
        if (!state.hidden) {
          assert.notEqual(state.text, "ОТКРЫТЬ", context + ": name the destination");
          const copy = { running: "БЕГ В INSTAGRAM", art: "СОБЫТИЯ НА САЙТЕ МУЗЕЯ" }[item.id];
          if (copy) assert.equal(state.text.replace(/\s+/gu, " ").trim(), copy, context + ": explicit CTA copy");
          assert.equal(state.target, "_blank", context);
          assert.ok(state.rel.includes("noreferrer"), context);
          if (item.href) assert.equal(state.href, item.href, context);
          assert.ok(state.link.top >= state.meta.bottom + 7, context + ": follows metadata");
          assert.ok(state.link.left >= state.identity.left + 10 && state.link.right <= state.identity.right - 10, context);
          assert.ok(state.link.bottom <= state.identity.bottom && state.link.height >= 24, context);
          assert.ok(state.identity.bottom <= state.description.top + 1, context + ": action precedes story");
          assert.equal(state.fill, "rgba(0, 0, 0, 0)", context);
          assert.equal(state.blur, "none", context);
          assert.ok(state.underline.includes("underline"), context);
        }
        if (directory && ["running", "art"].includes(item.id)) {
          await page.waitForFunction(() => getComputedStyle(document.querySelector("[data-map-inspector]")).opacity === "1");
          await page.locator(".map-readout__identity").screenshot({
            path: join(directory, engine + "-cta-" + item.id + "-" + label + "-" + theme + ".jpg"), quality: 90,
          });
        }
        if (state.related) assert.ok(state.related.top >= state.description.bottom - 1,
          context + ": related points follow the story without overlap");
      }
      await select(page, "narkomfin");
      await page.waitForFunction(() => getComputedStyle(document.querySelector("[data-map-inspector]")).opacity === "1");
      const material = await page.evaluate(readMaterialAuditExpression);
      assert.deepEqual(material.failures, [], "The header uses the same material as the rest of the interface.");
      if (directory) await page.screenshot({ path: join(directory, engine + "-links-" + label + "-" + theme + ".jpg"), quality: 78 });
      await page.context().route("https://narkomfin.ru/**", (route) => route.fulfill({
        contentType: "text/html", body: "<!doctype html><title>Destination navigation fixture</title>",
      }));
      const link = page.locator("[data-map-link]");
      await page.locator("[data-close-inspector]").focus();
      // Safari on macOS uses Option-Tab to include links in native keyboard navigation.
      // https://support.apple.com/guide/safari/cpsh003/mac
      const nextLinkKey = engine === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
      await page.keyboard.press(nextLinkKey);
      assert.equal(await link.evaluate((element) => element === document.activeElement && element.matches(":focus-visible")), true,
        "The destination is the first keyboard action after close.");
      const popupPromise = page.waitForEvent("popup");
      await page.keyboard.press("Enter");
      const popup = await popupPromise;
      await popup.waitForURL("https://narkomfin.ru/");
      await popup.close();
      console.log("PASS " + engine + " links " + label + " " + theme + ": " + items.length + " cards; keyboard navigation");
      await page.close();
    }
  }
  assert.deepEqual(errors, [], "No application exceptions.");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
