#!/usr/bin/env node
import assert from "node:assert/strict";
import { checkDeferredCaseContent } from "./case-content-contract.mjs";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mapItems } from "../js/map-data.js";

const require = createRequire(import.meta.url);
const { chromium, webkit } = require("playwright");
const { startStaticServer, readMaterialAuditExpression, waitForSurfaceRest } = require("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR;
if (directory) mkdirSync(directory, { recursive: true });
const { server, origin } = await startStaticServer({ projectRoot });
const errors = [];
let browser;
// Safari on macOS includes links in native keyboard navigation with Option-Tab.
// https://support.apple.com/guide/safari/cpsh003/mac
const nextLinkKey = engine === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab";
const select = async (page, id) => {
  await page.evaluate(async (point) => {
    const script = [...document.scripts].find((entry) => entry.src.includes("/js/map-engine.js?")).src;
    (await import(script)).selectMapItem(point, { reveal: true });
    await new Promise(requestAnimationFrame);
  }, id);
  await page.waitForFunction(() => document.querySelector("[data-case-load-state]").hidden);
  // Even a reduced-motion transition needs a committed frame after the
  // dialog is mounted. Measure the finished surface, not its entrance matrix.
  await page.waitForFunction(() => document.querySelector('[data-map-inspector]')
    .getAnimations().every(animation => animation.playState === 'finished'));
};

const checkPrinciplesNavigation = async (page) => {
  const principles = mapItems.filter((item) => item.kind === "practice");
  assert.equal(principles.length, 17, "The map contains the seventeen authored principles.");
  const firstId = principles[0].id;
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto(`${origin}/?point=${firstId}#map`);
  const card = page.locator(`[data-map-inspector].is-open[data-selected-map-id="${firstId}"]`);
  const entry = card.getByRole("link", { name: "Все принципы", exact: true });
  await entry.waitFor({ state: "visible" });
  await waitForSurfaceRest(page, ["[data-map-inspector]"]);
  // A direct #map visit can leave initial focus on the native fragment.
  // Start in the card's reading region and reach its action by keyboard.
  await card.getByRole("region", { name: "Содержимое карточки" }).focus();
  await page.keyboard.press(nextLinkKey);
  assert.equal(await entry.evaluate((link) => link === document.activeElement && link.matches(":focus-visible")), true,
    "Tab from the reading region visibly focuses the internal destination before Enter.");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.hash === "#principles"
    && document.activeElement?.id === "principles-title");
  assert.equal(new URL(page.url()).searchParams.get("point"), firstId, "The list keeps the originating point.");
  const rows = page.locator("#panel-principles .principle-row");
  const normalizedTitle = (text) => text.replace(/\u00ad/gu, "").replace(/\s+/gu, " ").trim().toLocaleLowerCase("ru");
  const entries = await rows.evaluateAll((links) => links.map((link) => ({
    href: link.getAttribute("href"), title: link.querySelector(".principle-row__title").textContent,
  })));
  assert.deepEqual(entries.map(({ href, title }) => [href, normalizedTitle(title)]),
    principles.map(({ id, title }) => [`?point=${id}#map`, normalizedTitle(title)]),
    "Every principle has its canonical title and point address in map order.");
  assert.equal(await rows.first().getAttribute("aria-current"), "true", "The source principle is marked in the list.");
  for (const { id } of principles) {
    await page.keyboard.press(nextLinkKey);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.mapPoint), id,
      "Keyboard focus follows the principle list in reading order.");
  }
  const lastId = principles.at(-1).id;
  const scrollTop = await page.locator(".content-panel__body").evaluate((element) => element.scrollTop);
  assert.ok(scrollTop > 0, "The last principle is reached by scrolling the list.");
  await page.keyboard.press("Enter");
  await page.waitForFunction((id) => document.querySelector("[data-map-inspector].is-open")?.dataset.selectedMapId === id, lastId);
  assert.equal(new URL(page.url()).searchParams.get("point"), lastId, "Selection opens the matching full card.");
  assert.equal(new URL(page.url()).hash, "#map");
  await page.goBack();
  await page.waitForFunction(({ id, top }) => location.hash === "#principles"
    && document.activeElement?.dataset.mapPoint === id && document.activeElement.getAttribute("aria-current") === "true"
    && Math.abs(document.querySelector(".content-panel__body").scrollTop - top) < 2, { id: lastId, top: scrollTop });
  await page.keyboard.press("Escape");
  await page.waitForFunction((id) => document.querySelector("[data-map-inspector].is-open")?.dataset.selectedMapId === id
    && document.activeElement?.matches("[data-map-link]") && location.hash === "#map", firstId);
  await waitForSurfaceRest(page, ["[data-map-inspector]"]);
  assert.equal(await entry.evaluate((link) => link === document.activeElement && link.matches(":focus-visible")), true,
    "The reopened source card keeps visible keyboard focus on its list action.");
};

// WebKit's macOS snapshot path can omit a backdrop blur that is present on
// the actual window. Calibrate the capture before judging the site's material.
const calibrateCapture = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 256, height: 144 }, deviceScaleFactor: 1 });
  try {
    await page.setContent('<style>body{margin:0;background:repeating-linear-gradient(90deg,#000 0 4px,#fff 4px 8px)}div{position:fixed;inset:16px;background:rgba(35,36,32,.5);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}</style><div></div>');
    const snapshot = await page.screenshot({
      path: directory ? join(directory, engine + "-backdrop-calibration.png") : undefined,
    });
    const range = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = "data:image/png;base64," + base64;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 144;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(96, 64, 64, 1).data;
      const levels = Array.from({ length: 64 }, (_, index) => pixels[index * 4]);
      return Math.max(...levels) - Math.min(...levels);
    }, snapshot.toString("base64"));
    console.log("CAPTURE " + engine + " backdrop: " + (range <= 8
      ? "blur reproduced"
      : "snapshot omits blur; native window capture required for material acceptance")
      + " (probe range " + range + ")");
  } finally {
    await page.close();
  }
};

try {
  browser = await ({ chromium, webkit })[engine].launch({ headless: true });
  await checkDeferredCaseContent(browser, origin);
  await calibrateCapture(browser);
  for (const theme of ["light", "dark"]) {
    for (const [label, width, height] of [
      ["desktop", 1440, 900], ["tablet", 1024, 768], ["mobile", 390, 844],
      ["compact", 320, 568], ["reflow", 720, 450],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme,
        reducedMotion: "reduce", hasTouch: width <= 680 || label === "tablet", isMobile: width <= 680 });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const exhaustive = label === "desktop" || label === "mobile" || label === "reflow";
      const items = exhaustive ? mapItems : mapItems.filter((item) => [
        "narkomfin", "garage-app", "early-career", "coffee", "youtube", "private-practice", "running", "wave", "principle-wings",
      ].includes(item.id));
      for (const item of items) {
        await select(page, item.id);
        const state = await page.evaluate(() => {
          const link = document.querySelector("[data-map-link]");
          const identity = document.querySelector(".map-readout__identity");
          const description = document.querySelector(".map-readout__description");
          const related = document.querySelector("[data-map-related]");
          const inspector = document.querySelector("[data-map-inspector]");
          const style = getComputedStyle(link);
          const box = (element) => element.getBoundingClientRect().toJSON();
          return { hidden: link.hidden, text: link.textContent, href: link.getAttribute("href"),
            target: link.target, rel: link.rel, principles: link.hasAttribute("data-open-principles"), inside: link.parentElement === identity,
            surface: link.getAttribute("data-material-surface"), count: document.querySelectorAll("[data-map-link]").length,
            link: box(link), identity: box(identity), description: box(description),
            sources: Array.from(description.querySelectorAll("a"), source => [
              source.textContent.replace(/\s+/gu, " "), source.getAttribute("href"),
            ]),
            paragraphs: Array.from(description.querySelectorAll("p[data-map-description], p[data-map-description-continuation]"),
              paragraph => paragraph.textContent.replace(/\s+/gu, " ")),
            inspector: box(inspector), scrollTop: (inspector.querySelector('.case-scroll') || inspector).scrollTop,
            expanded: inspector.classList.contains('is-case-view'), framed: inspector.classList.contains('has-reading-frame'), viewportHeight: innerHeight,
            related: related.hidden ? null : box(related), meta: box(document.querySelector("[data-map-meta]")),
            fill: style.backgroundColor, blur: style.backdropFilter, underline: style.textDecorationLine,
            overflow: document.documentElement.scrollWidth - innerWidth };
        });
        const context = engine + " " + label + " " + theme + " " + item.id;
        assert.equal(state.count, 1, context + ": no duplicate link");
        assert.equal(state.inside, true, context + ": link belongs to the heading");
        assert.equal(state.surface, null, context + ": no nested material");
        assert.equal(state.overflow, 0, context + ": no horizontal overflow");
        assert.ok(state.inspector.top >= 0 && state.inspector.bottom <= state.viewportHeight + 1,
          context + ": the whole inspector stays inside the viewport");
        assert.equal(state.scrollTop, 0, context + ": each point opens at its heading");
        assert.equal(state.hidden, Boolean(item.youtube && !item.youtube.href) || !(item.href || item.kind === "practice"), context);
        assert.equal(state.principles, item.kind === "practice", context + ": only principles open the internal list");
        if (item.kind === "practice") {
          const source = item.descriptionCredit;
          assert.deepEqual(state.sources, source ? [[source.label, source.href]] : [],
            context + ": the author's inline sources are preserved separately from list navigation");
          if (item.id === "principle-experiment") {
            assert.equal(state.paragraphs.length, 2, context + ": the final thought is a separate paragraph");
            assert.match(state.paragraphs[0], /чего ещё не было\.$/u);
            assert.match(state.paragraphs[1], /^Такие проекты /u);
          } else {
            assert.equal(state.paragraphs.length, 1, context + ": the previous point leaves no extra paragraph");
          }
        }
        if (!state.hidden) {
          assert.notEqual(state.text, "ОТКРЫТЬ", context + ": name the destination");
          const copy = { running: "НЕ СФОТКАЛ — НЕ БЕГАЛ", wave: "МОРЕ В INSTAGRAM" }[item.id]
            || (item.kind === "practice" ? "Все принципы" : "");
          if (copy) assert.equal(state.text.replace(/\s+/gu, " ").trim(), copy, context + ": explicit CTA copy");
          if (item.kind === "practice") {
            assert.equal(state.href, "#principles", context);
            assert.ok(["", "_self"].includes(state.target), context + ": internal navigation stays in this tab");
          } else {
            assert.equal(state.href, item.href, context);
            assert.equal(state.target, "_blank", context);
            assert.ok(state.rel.includes("noreferrer"), context);
          }
          assert.ok(state.link.top >= state.meta.bottom + (state.expanded ? 3 : 7), context + ": follows metadata");
          const inset = state.framed ? 0 : 10;
          assert.ok(state.link.left >= state.identity.left + inset - 1 && state.link.right <= state.identity.right - inset + 1,
            context + ": action stays on the identity text axis");
          assert.ok(state.link.bottom <= state.identity.bottom && state.link.height >= 24, context);
          assert.ok(state.link.top >= 0 && state.link.bottom <= state.viewportHeight,
            context + ": the destination is visible on opening");
          assert.ok(state.identity.bottom <= state.description.top + 1, context + ": action precedes story");
          assert.equal(state.fill, "rgba(0, 0, 0, 0)", context);
          assert.equal(state.blur, "none", context);
          assert.ok(state.underline.includes("underline"), context);
        }
        if (directory && ["running", "wave", "principle-wings"].includes(item.id)) {
          await page.waitForFunction(() => getComputedStyle(document.querySelector("[data-map-inspector]")).opacity === "1");
          await page.locator(".map-readout__identity").screenshot({
            path: join(directory, engine + "-cta-" + item.id + "-" + label + "-" + theme + ".jpg"), quality: 90,
          });
        }
        if (state.related) assert.ok(state.related.top >= state.description.bottom - 1,
          context + ": related points follow the story without overlap");
      }
      if (label === "compact" || label === "reflow") {
        await select(page, "principle-wings");
        if (label === "reflow") {
          await page.locator(".case-scroll").hover();
          await page.mouse.wheel(0, 280);
        } else {
          // Playwright mobile WebKit has no wheel API; test scroll reachability
          // and reset without presenting this as a physical touch gesture.
          await page.locator(".case-scroll").evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
        }
        await page.waitForFunction(() => document.querySelector(".case-scroll").scrollTop > 0);
        assert.equal(await page.evaluate(() => scrollY), 0, "Only the inspector scrolls.");
        await select(page, "wave");
        assert.equal(await page.locator(".case-scroll").evaluate((element) => element.scrollTop), 0,
          "Selecting another point returns to its heading and destination.");
      }
      await select(page, "narkomfin");
      await waitForSurfaceRest(page, [
        "[data-map-inspector]", ".site-header", ".system-dock", ".control-console",
      ]);
      const material = await page.evaluate(readMaterialAuditExpression);
      assert.deepEqual(material.failures, [], "The header uses the same material as the rest of the interface.");
      if (directory) await page.screenshot({ path: join(directory, engine + "-links-" + label + "-" + theme + ".jpg"), quality: 78 });
      await page.context().route("https://narkomfin.ru/**", (route) => route.fulfill({
        contentType: "text/html", body: "<!doctype html><title>Destination navigation fixture</title>",
      }));
      const link = page.locator("[data-map-link]");
      await page.locator("[data-close-inspector]").focus();
      await page.keyboard.press(nextLinkKey);
      if (width > 900) {
        assert.equal(await page.locator('[data-case-pause]').evaluate((element) => element === document.activeElement), true,
          "Desktop media control follows the visible left-to-right reading order.");
        await page.keyboard.press(nextLinkKey);
      }
      assert.equal(await page.locator('.case-scroll').evaluate((element) => element === document.activeElement), true,
        "The reading region follows the fixed close/media controls and supports keyboard scrolling.");
      await page.keyboard.press(nextLinkKey);
      assert.equal(await page.locator('[data-case-entry] a').evaluate((element) => element === document.activeElement && element.matches(":focus-visible")), true,
        "Other works follows the reading region, matching the case entry's visual order.");
      await page.keyboard.press(nextLinkKey);
      assert.equal(await link.evaluate((element) => element === document.activeElement && element.matches(":focus-visible")), true,
        "The external destination follows the case entry navigation.");
      const popupPromise = page.waitForEvent("popup");
      await page.keyboard.press("Enter");
      const popup = await popupPromise;
      await popup.waitForURL("https://narkomfin.ru/");
      await popup.close();
      if (label === "desktop" && theme === "light") await checkPrinciplesNavigation(page);
      console.log("PASS " + engine + " links " + label + " " + theme + ": " + items.length + " cards; keyboard navigation");
      await page.close();
    }
  }
  assert.deepEqual(errors, [], "No application exceptions.");
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
