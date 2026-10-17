#!/usr/bin/env node
// Focused regression checks for the two explicitly owned presentation lanes.
// The normal static gate and exact-commit publication barrier still apply.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { startStaticServer, readMaterialAuditExpression } = require('./browser-contracts.cjs');
const [engine = 'chromium', component] = process.argv.slice(2);
assert.ok(['chromium', 'webkit'].includes(engine));
assert.ok(['header', 'search-icon'].includes(component));
const { server, origin } = await startStaticServer({ projectRoot: resolve(fileURLToPath(new URL('../', import.meta.url))) });
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR;
if (directory) mkdirSync(directory, { recursive: true });
const errors = [];
let browser;
const settle = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const readHeader = page => page.locator('.site-header').evaluate(header => {
  const rect = header.getBoundingClientRect();
  const style = getComputedStyle(header);
  const role = header.querySelector('.brand__role');
  return {
    box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    material: [style.backgroundColor, style.backdropFilter, style.borderRadius, style.padding],
    role: [getComputedStyle(role).color, getComputedStyle(role).fontSize],
    overflow: header.scrollWidth - header.clientWidth,
    pageOverflow: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight],
  };
});
const checkHeader = async (page, width, height) => {
  await page.locator('[data-whoop-readout]:not([hidden])').waitFor();
  const initial = await readHeader(page);
  assert.ok(initial.box.width > 0 && initial.box.x >= 0 && initial.box.x + initial.box.width <= width + 1);
  assert.ok(initial.box.y >= 0 && initial.box.y + initial.box.height < height);
  assert.ok(initial.overflow <= 1 && initial.pageOverflow[0] <= 1, 'Header content stays readable without horizontal overflow.');
  if (width <= 900) {
    assert.ok(initial.pageOverflow[1] <= 1, 'The map must not acquire document scrolling.');
    for (const selector of ['[data-focused-map-open]', '[data-focused-return]']) {
      // Keyboard activation also verifies that neither mode strands focus.
      await page.locator(selector).focus();
      await page.keyboard.press('Enter');
      await settle(page);
      assert.equal(await page.locator('body').evaluate(body => body.classList.contains('has-full-mobile-map')), selector === '[data-focused-map-open]');
      assert.equal(await page.locator(selector === '[data-focused-map-open]' ? '[data-focused-return]' : '[data-focused-map-open]').evaluate(button => button === document.activeElement), true);
      assert.deepEqual(await readHeader(page), initial, 'The shared author card retains geometry and material across map modes.');
      assert.deepEqual((await page.evaluate(readMaterialAuditExpression)).failures, []);
    }
    const menu = page.locator('[data-constellation-nav-toggle]');
    await menu.focus();
    await page.keyboard.press('Enter');
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  }
};
const checkSearchIcon = async (page, width) => {
  const input = page.locator('[data-command-input]');
  if (width <= 900) await page.locator('[data-spatial-search]').click();
  else await input.focus();
  await page.locator('[data-command-results]').waitFor({ state: 'visible' });
  const state = await page.locator('.command-dock__mark').evaluate(mark => {
    const svg = mark.querySelector('svg');
    const shapes = [...svg.querySelectorAll('circle,path')];
    const rect = svg.getBoundingClientRect();
    return {
      hiddenFromAT: mark.getAttribute('aria-hidden'), count: mark.querySelectorAll('svg').length,
      size: [rect.width, rect.height],
      pseudo: ['::before', '::after'].map(pseudo => getComputedStyle(mark, pseudo).content),
      shapes: shapes.map(shape => ({ fill: getComputedStyle(shape).fill, stroke: getComputedStyle(shape).stroke, width: parseFloat(getComputedStyle(shape).strokeWidth) })),
      inside: rect.x >= 0 && rect.right <= innerWidth && rect.y >= 0 && rect.bottom <= innerHeight,
    };
  });
  assert.equal(state.hiddenFromAT, 'true');
  assert.equal(state.count, 1, 'There is one search glyph.');
  assert.ok(state.size.every(size => size >= 12 && size <= 48) && state.inside);
  assert.ok(state.pseudo.every(content => ['none', 'normal'].includes(content)), 'Old pseudo-elements must not paint a second magnifier.');
  assert.ok(state.shapes.length >= 2 && state.shapes.every(shape => shape.fill === 'none' && shape.stroke !== 'none' && shape.width > 0), 'The search mark is an outlined magnifier.');
  await input.fill('наркомфин');
  assert.equal(await input.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await input.getAttribute('aria-expanded'), 'false');
  assert.equal(await input.inputValue(), 'наркомфин');
};

try {
  browser = await ({ chromium, webkit })[engine].launch({ headless: true });
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
      const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme, reducedMotion: 'reduce' });
      page.setDefaultTimeout(8000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await (component === 'header' ? checkHeader(page, width, height) : checkSearchIcon(page, width));
      if (directory) {
        if (component === 'search-icon') {
          if (width <= 900) await page.locator('[data-spatial-search]').click();
          else await page.locator('[data-command-input]').focus();
          await settle(page);
        }
        await page.locator(component === 'header' ? '.site-header' : '[data-command-form]').screenshot({ path: join(directory, `${engine}-${component}-${width}-${theme}.png`) });
      }
      console.log(`PASS ${engine} ${component} ${width}px ${theme}`);
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
