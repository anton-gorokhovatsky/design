import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const require = createRequire(import.meta.url);
const { startStaticServer } = require("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || ".qa-artifacts/first-visit";
mkdirSync(directory, { recursive: true });
const { server, origin } = await startStaticServer({ projectRoot: process.cwd() });
const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
const errors = [];
const capture = (page, name) => page.screenshot({ path: join(directory, `${engine}-first-${name}.jpg`), quality: 82 });
try {
  for (const theme of ["light", "dark"]) {
    for (const [name, width, height, scale] of [
      ["desktop", 1440, 900, 1], ["tablet", 1024, 768, 1],
      ["narrow", 720, 700, 1], ["mobile", 390, 844, 1],
      ["compact", 320, 568, 1], ["reflow", 720, 700, 2],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme,
        reducedMotion: "reduce", hasTouch: width <= 680, isMobile: width <= 680 });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin, { waitUntil: "load" });
      await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      const state = await page.evaluate(() => {
        const box = (e) => e.getBoundingClientRect().toJSON();
        const visible = (e) => { const s = getComputedStyle(e); return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0; };
        return {
          author: box(document.querySelector(".brand")),
          // Right-aligned wrapped text leaves empty space inside its block.
          // Test the occupied text lines, not that empty bounding rectangle.
          authorLines: [...document.querySelectorAll(".brand__name, .brand__role")].flatMap((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return [...range.getClientRects()].map((rect) => rect.toJSON());
          }),
          authorVisible: visible(document.querySelector(".site-header")),
          overflow: document.documentElement.scrollWidth - innerWidth,
          selected: document.querySelector("[data-map-inspector]").getAttribute("aria-hidden"),
          route: document.querySelector("[data-start-observation]").textContent,
          nodes: [...document.querySelectorAll(".map-node")].map(box),
          nav: [...document.querySelectorAll(".constellation-nav__item > .constellation-nav__label")].map((e) => ({ box: box(e), visible: visible(e), text: e.textContent })),
          search: box(document.querySelector("[data-command-form]")),
        };
      });
      await capture(page, `${name}-${theme}`);
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      assert.equal(state.overflow, 0, JSON.stringify({ name, theme, state }));
      assert.ok(state.authorVisible && state.author.left >= 0 && state.author.right <= width + 1);
      assert.equal(state.selected, "true");
      assert.equal(state.route.trim(), "РАБОТЫ / 60 СЕК");
      assert.ok(!state.nodes.some((node) => state.authorLines.some((line) => overlaps(node, line))), "Authorship must not collide with a map target: " + JSON.stringify({ name, state }));
      if (width > 680) {
        assert.ok(state.nav.every((item) => item.visible && item.box.width > 0));
        assert.ok(state.search.right <= width + 1, "Search must stay inside the viewport.");
        assert.ok(state.nav.every((item) => !overlaps(item.box, state.search)), "Navigation labels must not overlap search.");
        for (let i = 1; i < state.nav.length; i++) assert.ok(!overlaps(state.nav[i - 1].box, state.nav[i].box));
        await page.locator(".control-console").screenshot({ path: join(directory, `${engine}-nav-${name}-${theme}.png`) });
      } else {
        await page.locator("[data-constellation-nav-toggle]").click();
        assert.equal(await page.locator("[data-constellation-nav-toggle]").getAttribute("aria-expanded"), "true");
        await capture(page, `menu-${name}-${theme}`);
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("[data-constellation-nav-toggle]").getAttribute("aria-expanded"), "false");
      }
      if (["desktop", "mobile", "compact"].includes(name)) {
        if (width <= 680) await page.locator("[data-constellation-nav-toggle]").click();
        await page.locator('.constellation-nav__item[data-open-panel="work"]').click();
        await capture(page, `work-${name}-${theme}`);
        assert.equal(await page.locator(".work-row").count(), 8);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        const scopes = await page.locator(".work-row__scope").evaluateAll((elements) => elements.map((element) => ({
          size: parseFloat(getComputedStyle(element).fontSize),
          overflow: element.scrollWidth - element.clientWidth,
        })));
        assert.ok(scopes.every((item) => item.size >= 13 && item.overflow <= 1), "Project descriptions remain readable and inside their cards.");
        if (width <= 680) {
          await page.locator(".work-row").last().scrollIntoViewIfNeeded();
          await capture(page, `work-end-${name}-${theme}`);
          const last = await page.locator(".work-row").last().boundingBox();
          assert.ok(last.y >= 0 && last.y + last.height <= height + 1, "The last case is fully reachable.");
        }
      }
      console.log(`PASS ${engine} first visit ${name} ${theme}: author, named routes, map, work selection.`);
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
