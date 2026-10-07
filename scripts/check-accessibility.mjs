import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";
import { mapItems } from "../js/map-data.js";
import { measureTextContrast as contrast, assertTextContrast, reviewIncomplete, readMapTargets } from "./accessibility-audit.mjs";

const require = createRequire(import.meta.url);
const { startStaticServer } = require("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const local = process.env.PORTFOLIO_A11Y_ORIGIN ? null : await startStaticServer({ projectRoot: process.cwd() });
const origin = process.env.PORTFOLIO_A11Y_ORIGIN || local.origin;
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || ".qa-artifacts/accessibility";
mkdirSync(directory, { recursive: true });
const browser = await ({ chromium, webkit })[engine].launch();
const report = [], errors = [];
const settle = async page => {
  await page.waitForFunction(() => !document.querySelector('[data-map-links][data-layout-pending]'));
  await page.waitForFunction(() => document.getAnimations().every(animation =>
    animation.animationName !== 'window-reveal'
    || (!animation.pending && animation.playState !== 'running')));
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
};
const capture = (page, name) => page.screenshot({ path: `${directory}/${engine}-${name}.png` });
const axe = async (page, name) => {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const result = await page.evaluate(async () => {
    const { violations, incomplete } = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"] },
      rules: { "label-content-name-mismatch": { enabled: true } },
    });
    return { violations, incomplete };
  });
  const measured = await contrast(page);
  const review = await reviewIncomplete(page, result.incomplete, measured);
  report.push({ name, axe: result, contrast: measured, review });
  assertTextContrast(measured, name);
  assert.deepEqual(review.filter(item => !item.resolution), [], `Unresolved accessibility review: ${name}`);
  assert.deepEqual(result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(n => n.target) })), [], name);
};
const auditScroll = async (page, selector, name) => {
  const scroller = page.locator(selector);
  const { maximum, step } = await scroller.evaluate(e => ({
    maximum: e.scrollHeight - e.clientHeight, step: Math.max(1, Math.floor(e.clientHeight * .8)),
  }));
  for (let position = 0; ; position = Math.min(maximum, position + step)) {
    await scroller.evaluate((e, top) => { e.scrollTop = top; }, position);
    await settle(page);
    await axe(page, `${name}-scroll-${position}`);
    if (position === maximum) break;
  }
};

try {
  for (const theme of ["light", "dark"]) for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 568]]) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme, reducedMotion: "reduce" });
    page.on("pageerror", error => errors.push(error.message));
    const name = `${width}-${theme}`;
    try {
    await page.goto(origin, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelector('[data-whoop-recovery]').textContent.includes('%'));
    await settle(page);
    if (width === 1440 || width === 320) {
      for (const [palette, rgb] of [["high", "83,142,103"], ["medium", "175,143,60"], ["low", "185,101,83"]]) {
        await page.evaluate(rgb => document.documentElement.style.setProperty('--day-rgb', rgb), rgb);
        await settle(page);
        const measured = await contrast(page);
        report.push({ name, palette, contrast: measured });
        assert.ok(measured.length >= 8, 'Measure visible text, not an empty selection.');
        assertTextContrast(measured, `${name} ${palette}`);
        await capture(page, `palette-${palette}-${name}`);
      }
      await page.evaluate(() => document.documentElement.style.setProperty('--day-rgb', '83,142,103'));
      await axe(page, `home-${name}`);
    }
    if (width <= 390) {
      const targets = await readMapTargets(page);
      report.push({ name, targets });
      assert.equal(targets.length, mapItems.length, 'Every map point has a reachable target.');
      assert.deepEqual(targets.filter(target => target.misses.length || target.width < 24 || target.height < 24), [], `Mobile targets ${name}`);
    }
    await capture(page, `home-${name}`);
    await page.locator('.site-header').screenshot({ path: `${directory}/${engine}-author-${name}.png` });
    if (width > 900) await page.locator('.control-console').screenshot({ path: `${directory}/${engine}-navigation-${name}.png` });
    else {
      await page.locator('[data-constellation-nav-toggle]').click();
      await capture(page, `menu-${name}`);
      await page.keyboard.press('Escape');
    }

    if (width === 1440 || width === 320) {
      await page.locator('[data-open-settings]:visible').first().click();
      await auditScroll(page, '.settings-panel__body', `settings-${name}`);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      for (const [selector, cycles] of [['[data-theme-toggle]', 3], ['[data-motion-toggle]', 2], ['[data-contrast-toggle]', 2], ['[data-whoop-toggle]', 2]]) {
        const button = page.locator('[data-settings-panel] ' + selector);
        for (let i = 0; i < cycles; i++) {
          await button.click();
          const violations = await page.evaluate(async () => (await axe.run(document, {
            runOnly: { type: 'rule', values: ['label-content-name-mismatch'] },
            rules: { 'label-content-name-mismatch': { enabled: true } },
          })).violations);
          assert.deepEqual(violations.map(v => v.nodes.map(n => n.target)), [], `Settings names ${name} ${selector} ${i}`);
        }
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.keyboard.press('Escape');
    }

    await page.locator('.constellation-nav__item[data-open-panel="contact"]').evaluate(e => e.click());
    await settle(page);
    const contacts = await page.locator('.contact-resume a').evaluateAll(links => links.map(e => {
      const r = e.getBoundingClientRect(); return { text: e.textContent.trim(), width: r.width, height: r.height };
    }));
    assert.equal(contacts.length, 2);
    assert.ok(contacts.every(r => r.height >= 32), JSON.stringify(contacts));
    const more = page.locator('.content-panel__more');
    const last = await more.isVisible() ? more : page.locator('.contact-resume a').last();
    await last.focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.hasFocus()
      && document.querySelector('[data-content-panel]').contains(document.activeElement)), true, `Contact forward focus ${name}`);
    if (width <= 900) {
      assert.equal(await page.locator('[data-close-panel]').evaluate(e => e === document.activeElement), true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await last.evaluate(e => e === document.activeElement), true, `Contact backward focus ${name}`);
    }
    if (await page.evaluate(() => document.body.classList.contains('has-command-focus'))) await page.keyboard.press('Escape');
    await page.locator('[data-close-panel]').focus();
    await page.locator('.content-panel__body').evaluate(e => { e.scrollTop = 0; });
    await capture(page, `contact-${name}`);
    if (width === 320) await axe(page, `contact-${name}`);
    await page.keyboard.press('Escape');

    await page.goto(`${origin}/#work`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    await capture(page, `work-${name}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    if (width === 390) {
      await axe(page, `work-${name}`);
      await page.goto(`${origin}/?point=ks-fish`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.querySelector('[data-map-inspector]').getAttribute('role') === 'dialog');
      await capture(page, `case-${name}`);
      await auditScroll(page, '.case-scroll', `case-${name}`);
      const playback = page.locator('[data-case-pause]');
      for (let i = 0; i < 2; i++) {
        await playback.click();
        assert.ok((await playback.getAttribute('aria-label')).startsWith(await playback.textContent()), 'Playback name includes its visible action.');
      }
    }
    console.log(`PASS ${engine} ${name}: contrast, contact targets, modal focus and semantics.`);
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
      await capture(page, `failure-${name}`);
      console.error(`FAIL ${engine} ${name}: ${error.message}`);
    } finally { await page.close(); }
  }

  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 720, height: 700 }, colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto(`${origin}/?qa-font=200#work`, { waitUntil: 'load' });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.evaluate(() => document.fonts.ready);
    await settle(page);
    const overlap = await page.evaluate(() => {
      const lines = selector => {
        const range = document.createRange(); range.selectNodeContents(document.querySelector(selector));
        return [...range.getClientRects()];
      };
      return lines('.work-intro h2').some(a => lines('.work-intro p').some(b =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
    });
    assert.equal(overlap, false, 'At 200% text, the case heading must not overlap its description.');
    await capture(page, `work-text200-${theme}`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(`${directory}/${engine}-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  if (local) { local.server.closeAllConnections(); await new Promise(done => local.server.close(done)); }
}
