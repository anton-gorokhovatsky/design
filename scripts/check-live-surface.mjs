import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright';

export async function checkLiveSurface(browser, origin, engine) {
  const dir = '.qa-artifacts/live-surface';
  mkdirSync(dir, { recursive: true });
  const errors = [];
  const count = async () => (await (await fetch(`${origin}/__qa/presence`)).json()).count;
  const baseline = await count();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const state = (selector = '.whoop-field') => page.locator(selector).evaluate(node => {
    const css = getComputedStyle(node, '::before');
    return { transform: css.transform, play: css.animationPlayState, name: css.animationName, visibility: getComputedStyle(node).visibility };
  });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('[data-whoop-recovery]').textContent.includes('77'));
  await page.waitForFunction(n => document.querySelector('[data-presence-count]').textContent === String(n), baseline + 1);
  const card = await page.locator('.site-header').boundingBox();
  const initial = await state();
  await page.waitForTimeout(700);
  assert.notEqual((await state()).transform, initial.transform, 'Terrain visibly advances.');
  assert.deepEqual(await page.locator('.site-header').boundingBox(), card, 'The author card stays fixed.');
  const link = page.locator('.whoop-foot .text-link');
  const linkState = () => link.evaluate(node => {
    const css = getComputedStyle(node);
    return { color: css.color, decoration: css.textDecorationLine, thickness: css.textDecorationThickness, transform: css.transform, outline: css.outlineStyle };
  });
  const plain = await linkState();
  await link.hover();
  const hover = await linkState();
  assert.notEqual(hover.color, plain.color);
  assert.equal(hover.transform, 'none');
  assert.equal(hover.thickness, '1px');
  await page.screenshot({ path: `${dir}/${engine}-desktop.png` });
  await link.click();
  assert.equal((await state()).play, 'paused');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-settings-panel]').open);
  assert.equal((await state()).play, 'running');
  await page.locator('[data-start-observation]').first().click();
  assert.equal((await state()).visibility, 'hidden');
  assert.equal((await state()).play, 'paused');
  await page.keyboard.press('Escape');
  await page.locator('.display-control [data-motion-toggle]').click();
  assert.equal((await state()).name, 'none');
  await page.locator('.display-control [data-motion-toggle]').click();
  // Two tabs share the origin lock; another browser context is another visit.
  const tab = await context.newPage();
  await tab.goto(origin);
  await tab.waitForFunction(n => document.querySelector('[data-presence-count]').textContent === String(n), baseline + 1);
  const other = await browser.newPage();
  await other.goto(origin);
  await other.waitForFunction(n => document.querySelector('[data-presence-count]').textContent === String(n), baseline + 2);
  await other.route('**/__qa/presence', r => r.fulfill({ status: 503, body: '' }));
  await other.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await other.waitForFunction(() => document.querySelector('[data-presence-count]').textContent === 'Нет связи');
  await other.close(); await tab.close();
  await page.goto(`${origin}/404.html`);
  await page.evaluate(() => document.fonts.ready);
  const start404 = await state('.not-found__terrain');
  await page.waitForTimeout(700);
  assert.notEqual((await state('.not-found__terrain')).transform, start404.transform);
  await page.locator('[data-terrain-motion]').click();
  assert.equal((await state('.not-found__terrain')).name, 'none');
  await page.locator('[data-terrain-motion]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal((await state('.not-found__terrain')).name, 'none');
  await page.keyboard.press('Tab');
  await page.locator('.not-found__action').focus();
  assert.equal(await page.locator('.not-found__action').evaluate(n => getComputedStyle(n).outlineStyle), 'solid');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
    await page.screenshot({ path: `${dir}/${engine}-404-${theme}.png` });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.screenshot({ path: `${dir}/${engine}-404-mobile-${theme}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('[data-whoop-recovery]').textContent.includes('77'));
  await page.screenshot({ path: `${dir}/${engine}-mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`PASS ${engine}: Atlas motion and pause, shared links, presence deduplication and outage, 404 themes and mobile.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { startStaticServer } = createRequire(import.meta.url)('./browser-contracts.cjs');
  const { server, origin } = await startStaticServer({ projectRoot: process.cwd() });
  const engine = process.argv[2] || 'chromium';
  const browser = await ({ chromium, webkit })[engine].launch();
  try { await checkLiveSurface(browser, origin, engine); }
  finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
