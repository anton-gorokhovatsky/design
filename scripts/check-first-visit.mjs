import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import { mapItems } from "../js/map-data.js";
import { readMapTargets } from "./accessibility-audit.mjs";

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
  // The shipped controls must already be compact before their module can run.
  const boot = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let releaseControls;
  const controlsHeld = new Promise(resolve => { releaseControls = resolve; });
  await boot.route('**/js/map-controls.js*', async route => { await controlsHeld; await route.continue(); });
  const bootLoaded = boot.goto(origin);
  await boot.locator('.display-control').waitFor();
  assert.equal(await boot.locator('html').getAttribute('data-map-controls-ready'), null);
  assert.deepEqual(await boot.locator('.map-controls, .display-control').evaluateAll(nodes => nodes.map(e => getComputedStyle(e).backgroundColor)), ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'], 'No legacy card surfaces appear before initialization');
  assert.equal(await boot.locator('#screen-controls').isVisible(), false, 'Advanced settings start inside the closed native popover');
  assert.equal(await boot.locator('.map-screen-top .map-disclosure').isVisible(), true);
  releaseControls();
  await bootLoaded;
  await boot.waitForFunction(() => document.documentElement.dataset.mapControlsReady === 'true');
  await boot.locator('.map-screen-top .map-disclosure').click();
  await boot.waitForFunction(() => document.querySelector('#screen-controls').matches(':popover-open'));
  await boot.keyboard.press('Escape');
  await boot.close();
  for (const theme of ["light", "dark"]) {
    for (const [name, width, height, scale] of [
      ["desktop", 1440, 900, 1], ["short", 1440, 650, 1],
      ["tablet", 1024, 768, 1], ["middle", 900, 700, 1],
      ["narrow", 720, 700, 1], ["mobile", 390, 844, 1],
      ["compact", 320, 568, 1], ["reflow", 720, 700, 2],
    ]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme,
        reducedMotion: "reduce", hasTouch: width <= 900, isMobile: width <= 900 });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin, { waitUntil: "load" });
      await page.evaluate((scale) => { document.documentElement.style.fontSize = `${16 * scale}px`; }, scale);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator("[data-observation-showcase] img[src]").count(), 0, "Hidden route posters wait for the route to become visible.");
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      // Font and camera reflow are asynchronous; measure the settled input surface.
      await page.waitForFunction(() => !document.querySelector('[data-map-links][data-layout-pending]')
        && [...document.querySelectorAll(".map-node:not([inert])")].every(node => {
        const rect = node.getBoundingClientRect();
        const clip = node.closest('.focused-home')?.getBoundingClientRect();
        return rect.bottom > (clip?.bottom ?? innerHeight) || rect.top < (clip?.top ?? 0)
          || document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest(".map-node") === node;
      }), null, { timeout: 5000 });
      if (width <= 900) {
        // Short screens and enlarged text scroll the introductory map. Audit
        // every point after bringing it into view, not through the fixed nav.
        const targets = await readMapTargets(page);
        assert.equal(targets.length, 6);
        assert.equal(await page.locator('[data-picker-project]').count(), 10);
        assert.deepEqual(targets.filter(target => target.misses.length), [], `${name}: scrolled map targets`);
      }
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
          totalNodes: document.querySelectorAll(".map-node").length,
          nodes: [...document.querySelectorAll(".map-node:not([inert])")].map(box),
          signs: [...document.querySelectorAll(".map-node__glyph")].map(box),
          obstacles: [...document.querySelectorAll(".map-controls, .display-control, .control-console, .site-header, .map-axis-label")]
            .filter(visible).map(box).filter(rect => rect.width && rect.height),
          blockedTargets: [...document.querySelectorAll(".map-node:not([inert])")].flatMap((node) => {
            const rect = node.getBoundingClientRect();
            const clip = node.closest('.focused-home')?.getBoundingClientRect();
            if (rect.bottom > (clip?.bottom ?? innerHeight) || rect.top < (clip?.top ?? 0)) return [];
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return hit?.closest(".map-node") === node ? [] : [{ id: node.dataset.mapId, hit: hit?.closest(".map-node")?.dataset.mapId || hit?.className }];
          }),
          nav: [...document.querySelectorAll(".constellation-nav__item > .constellation-nav__label")].map((e) => ({ box: box(e), visible: visible(e), text: e.textContent })),
          search: box(document.querySelector("[data-command-form]")),
        };
      });
      await capture(page, `${name}-${theme}`);
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      assert.equal(state.overflow, 0, JSON.stringify({ name, theme, state }));
      assert.ok(state.authorVisible && state.author.left >= 0 && state.author.right <= width + 1);
      assert.equal(state.selected, "true");
      assert.equal(state.totalNodes, mapItems.length, "All points remain available through the full map.");
      if (width <= 900) assert.equal(state.nodes.length, 6, "The introductory map exposes six anchors; private projects have a shared touch picker.");
      assert.deepEqual(state.blockedTargets, [], `${name} ${theme}: each point must receive input at its own center.`);
      assert.equal(state.route.trim().replace(/\s+/g, " "), "Посмотреть обзор · 3 минуты");
      assert.equal(await page.getByRole("button", { name: "Посмотреть обзор · 3 минуты", exact: true, includeHidden: true }).count(), 2, "Both native overview buttons expose the visible action and duration as their accessible name.");
      assert.ok(!state.nodes.some((node) => state.authorLines.some((line) => overlaps(node, line))), "Authorship must not collide with a map target: " + JSON.stringify({ name, state }));
      if (width > 900) {
        assert.ok(!state.signs.some(sign => state.obstacles.some(panel => overlaps(sign, panel))),
          `${name} ${theme}: the complete map sign must clear panels and axis labels.`);
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
        if (width <= 900) await page.locator("[data-constellation-nav-toggle]").click();
        await page.locator('.constellation-nav__item[data-open-panel="work"]').click();
        await capture(page, `work-${name}-${theme}`);
        assert.equal(await page.locator(".work-row").count(), 21);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
        const scopes = await page.locator(".work-row__scope").evaluateAll((elements) => elements.map((element) => ({
          size: parseFloat(getComputedStyle(element).fontSize),
          overflow: element.scrollWidth - element.clientWidth,
        })));
        assert.ok(scopes.every((item) => item.size >= 13 && item.overflow <= 1), "Project descriptions remain readable and inside their cards.");
        if (width <= 900) {
          // Pointer focus must not scroll the card away between down and up.
          await page.locator(".work-row").first().click();
          await page.waitForFunction(() => document.body.hasAttribute("data-case-open"));
          assert.equal(await page.locator("[data-map-inspector]").getAttribute("data-selected-map-id"), "garage-site");
          await page.locator("[data-close-inspector]").click();
          await page.waitForFunction(() => !document.body.hasAttribute("data-case-open"));
          // Closing the case restores the list and its source row.
          await page.waitForFunction(() => document.activeElement === document.querySelector(".work-row"));
          assert.equal(await page.locator('[data-content-panel]').getAttribute('aria-hidden'), 'false');
          // WebKit follows the host default: Option+Tab includes links.
          const nextLinkKey = engine === "webkit" ? "Alt+Tab" : "Tab";
          for (let index = 1; index < 21; index++) await page.keyboard.press(nextLinkKey);
          assert.equal(await page.locator(".work-row").last().evaluate((element) => element === document.activeElement), true, "Keyboard navigation reaches the final case.");
          await capture(page, `work-end-${name}-${theme}`);
          const last = await page.locator(".work-row").last().boundingBox();
          assert.ok(last.y >= 0 && last.y + last.height <= height + 1, "The last case is fully reachable.");
        }
      }
      console.log(`PASS ${engine} first visit ${name} ${theme}: author, named routes, map, work selection.`);
      await page.close();
    }
  }
  const switching = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  switching.on('pageerror', error => errors.push(error.message));
  await switching.goto(origin);
  await switching.waitForFunction(() => document.querySelector('.whoop-level'));
  const author = await switching.locator('.site-header').boundingBox();
  for (const focused of [false, true, false]) {
    await switching.locator(focused ? '[data-focused-return]' : '[data-focused-map-open]').tap();
    await switching.waitForFunction(focused => document.body.classList.contains('has-focused-home') === focused, focused);
  }
  await switching.waitForFunction(() => !document.body.classList.contains('is-map-switching'));
  assert.equal(new URL(switching.url()).searchParams.get('scene'), 'map', 'Rapid switching keeps the last requested scene');
  assert.deepEqual(await switching.locator('.site-header').boundingBox(), author, 'The author card stays stationary');
  assert.equal(await switching.locator('.map-camera, .map-labels, .project-satellites').evaluateAll(planes => planes.every(e => !e.getAnimations().length)), true, 'No abandoned transition keeps a map plane faded');
  await switching.locator('[data-focused-return]').focus();await switching.keyboard.press('Enter');
  assert.equal(await switching.locator('body').evaluate(e => e.classList.contains('has-focused-home') && !e.classList.contains('is-map-switching')), true, 'Keyboard changes scene immediately');
  await switching.emulateMedia({ reducedMotion: 'reduce' });
  await switching.locator('[data-focused-map-open]').tap();
  assert.equal(await switching.locator('body').evaluate(e => e.classList.contains('has-full-mobile-map') && !e.classList.contains('is-map-switching')), true, 'Reduced motion retains both scenes without defocus');
  await switching.close();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
