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
const { startStaticServer, readMaterialAuditExpression, declineAnalyticsNotice } = require('./browser-contracts.cjs');
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
  const name = header.querySelector('.brand__name');
  return {
    box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    material: [style.backgroundColor, style.backdropFilter, style.borderRadius, style.padding],
    name: [getComputedStyle(name).color, getComputedStyle(name).fontSize],
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
const checkMenuResize = async page => {
  const menu = page.locator('[data-constellation-nav-toggle]');
  const checkClosedFocus = () => page.waitForFunction(() => {
    const control = document.activeElement, box = control.getBoundingClientRect();
    return document.querySelector('[data-constellation-nav-toggle]').getAttribute('aria-expanded') === 'false'
      && !document.querySelector('[data-constellation-nav]').matches(':popover-open')
      && control !== document.body && !control.closest('[inert]')
      && control.checkVisibility({ visibilityProperty: true, opacityProperty: true })
      && box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= innerWidth;
  });
  await page.goto(origin, { waitUntil: 'load' });
  await declineAnalyticsNotice(page);
  await menu.focus();
  await page.keyboard.press('Enter');
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await page.setViewportSize({ width: 930, height: 844 });
  await checkClosedFocus();
  assert.ok(await page.locator('[data-nav-view="map"]').evaluate(control => control === document.activeElement),
    'Leaving compact mode closes its menu and moves focus to the visible current route.');
  await page.locator('[data-nav-view="work"]').focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await checkClosedFocus();
  assert.ok(await menu.evaluate(control => control === document.activeElement),
    'A desktop navigation link that becomes hidden returns focus to the compact toggle.');
  await page.keyboard.press('Enter');
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  await checkClosedFocus();

  // At the story breakpoint the narrow left pane becomes a wide, clipped map.
  await page.setViewportSize({ width: 1000, height: 750 });
  await page.goto(`${origin}/?story=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#story-pane').dataset.ready === 'true');
  await menu.focus();
  await page.keyboard.press('Enter');
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await page.setViewportSize({ width: 999, height: 750 });
  await checkClosedFocus();
  assert.ok(await page.locator('#story-bridge [data-close-story]').evaluate(control => control === document.activeElement),
    'The stacked story retains a visible exit instead of an orphaned navigation popover.');
  const closePlacement = await page.locator('#story-pane').evaluate(story => {
    const pane = story.getBoundingClientRect();
    const close = story.querySelector('.story-actions > [data-close-story]').getBoundingClientRect();
    return { paneRight: pane.right, closeRight: close.right, closeLeft: close.left };
  });
  assert.ok(closePlacement.closeRight <= closePlacement.paneRight + 1
    && closePlacement.closeLeft >= closePlacement.paneRight - 100,
  'The story close button stays at the panel right edge after the responsive transition.');
  await page.setViewportSize({ width: 1000, height: 750 });
  await checkClosedFocus();
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
  if (component === 'header') {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    await checkMenuResize(page);
    if (directory) await page.screenshot({ path: join(directory, `${engine}-header-menu-resize.png`) });
    await page.close();
    console.log(`PASS ${engine} header: menu resize, visible focus and Escape across map/story layouts.`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
