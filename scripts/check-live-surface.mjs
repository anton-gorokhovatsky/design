import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
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
    return { pixels: node.querySelector('canvas')?.toDataURL(), visibility: getComputedStyle(node).visibility };
  });
  const frozen = async (selector = '.whoop-field') => {
    await page.waitForTimeout(80);
    const before = await state(selector);
    await page.waitForTimeout(400);
    assert.equal((await state(selector)).pixels, before.pixels, 'The native frame pauses.');
  };
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('[data-whoop-recovery]').textContent.includes('77'));
  await page.waitForFunction(n => document.querySelector('[data-presence-count]').textContent === String(n), baseline + 1);
  // A real document navigation must remove this visit, not wait for the TTL.
  await page.goto(`${origin}/404.html`);
  // Poll from the runner so the next navigation cannot cancel a fixture probe.
  // An async browser predicate returns a truthy Promise before its count matches.
  const departureDeadline = Date.now() + 5000;
  let departedCount = await count();
  while (departedCount !== baseline && Date.now() < departureDeadline) {
    await delay(100);
    departedCount = await count();
  }
  assert.equal(departedCount, baseline, 'Navigation removes the visit before the 90s TTL.');
  await page.goto(origin);
  await page.waitForFunction(n => document.querySelector('[data-presence-count]').textContent === String(n), baseline + 1);
  await page.waitForSelector('.whoop-field canvas', { state: 'attached' });
  const card = await page.locator('.site-header').boundingBox();
  const initial = await state();
  await page.waitForTimeout(700);
  assert.notEqual((await state()).pixels, initial.pixels, 'Native Aura changes within the stationary field.');
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
  assert.equal((await state()).visibility, 'visible', 'Settings preserve author presence.');
  assert.deepEqual(await page.locator('.site-header').boundingBox(), card, 'Settings leave the author card in place.');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-settings-panel]').open);
  await page.locator('[data-start-observation]').first().click();
  assert.equal((await state()).visibility, 'visible', 'The observation route preserves author presence.');
  assert.deepEqual(await page.locator('.site-header').boundingBox(), card, 'Reading leaves the author card in place.');
  assert.ok(await page.locator('.site-header').evaluate(e => Number(getComputedStyle(e).opacity) <= .16), 'Reading subordinates the background card.');
  await page.keyboard.press('Escape');
  for (const id of ['screen-controls', 'map-about']) {
    const trigger = page.locator(`[popovertarget="${id}"]:not([popovertargetaction])`);
    const panel = page.locator(`#${id}`);
    assert.equal(await panel.isVisible(), false, `${id}: closed at rest`);
    await trigger.click();
    assert.equal(await panel.isVisible(), true, `${id}: opens from its trigger`);
    await page.waitForFunction(id => document.querySelector(
      `[popovertarget="${id}"]:not([popovertargetaction])`,
    ).getAttribute('aria-expanded') === 'true', id);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    const surface = await panel.evaluate(el => {
      const css = getComputedStyle(el);
      return { blur: css.backdropFilter || css.webkitBackdropFilter, shadow: css.boxShadow, border: css.borderTopWidth };
    });
    assert.ok(surface.blur.includes('blur(24px)'), `${id}: shared material`);
    assert.equal(surface.shadow, 'none');
    assert.equal(surface.border, '0px');
    await page.keyboard.press('Escape');
    assert.equal(await panel.isVisible(), false);
    assert.equal(await trigger.evaluate(el => document.activeElement === el), true, `${id}: Escape returns focus`);
  }
  await page.locator('[popovertarget="screen-controls"]:not([popovertargetaction])').click();
  await page.locator('.display-control [data-motion-toggle]').click();
  await frozen();
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
  await page.waitForSelector('.not-found__terrain canvas', { state: 'attached' });
  const start404 = await state('.not-found__terrain');
  await page.waitForTimeout(700);
  assert.notEqual((await state('.not-found__terrain')).pixels, start404.pixels);
  await page.locator('[data-terrain-motion]').click();
  await frozen('.not-found__terrain');
  await page.locator('[data-terrain-motion]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await frozen('.not-found__terrain');
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
  console.log(`PASS ${engine}: Aura/Atlas motion and pause, shared links, presence deduplication and outage, 404 themes and mobile.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { startStaticServer } = createRequire(import.meta.url)('./browser-contracts.cjs');
  const { server, origin } = await startStaticServer({ projectRoot: process.cwd() });
  const engine = process.argv[2] || 'chromium';
  const browser = await ({ chromium, webkit })[engine].launch();
  try { await checkLiveSurface(browser, origin, engine); }
  finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
