import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, webkit } from 'playwright';

const require = createRequire(import.meta.url);
const { startStaticServer } = require('./browser-contracts.cjs');
const engine = process.argv[2] || 'chromium';
assert(['chromium', 'webkit'].includes(engine), 'Choose chromium or webkit');
const version = readFileSync('signature/src/component.js', 'utf8').match(/VERSION = "([\d.]+)"/)[1];
const server = await startStaticServer({ projectRoot: process.cwd() });
const browser = await ({ chromium, webkit })[engine].launch();
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || '.qa-artifacts/signature';
mkdirSync(directory, { recursive: true });
const requests = new Set(), errors = [], report = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => requests.add(new URL(request.url()).pathname));
const mark = page.locator('ag-signature').first().locator('.mark');
const checkBounds = async name => {
  const bounds = await page.locator('ag-signature .credit').evaluateAll(links => links.map(link => {
    const r = link.getBoundingClientRect();
    return { left: r.left, right: r.right, width: r.width, height: r.height, viewport: innerWidth };
  }));
  assert.equal(bounds.length, 2, 'Both languages have one visible author link');
  for (const b of bounds) assert(b.left >= 0 && b.right <= b.viewport + 1 && b.height >= 44, `${name}: readable link, reachable target and no clipping`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: no horizontal overflow`);
  report.push({ name, bounds });
};
try {
  await page.goto(`${server.origin}/signature/demo.html`, { waitUntil: 'load' });
  await page.waitForFunction(version => [...document.querySelectorAll('ag-signature')].every(host => host.dataset.signatureVersion === version), version);
  assert.equal(await page.getByRole('link', { name: 'Антон Гороховатский Дизайн и разработка', exact: true }).count(), 1);
  assert.equal(await page.getByRole('link', { name: 'Anton Gorokhovatsky Design and development', exact: true }).count(), 1);
  await checkBounds('desktop: RU/light and EN/dark');
  const paints = await page.locator('ag-signature .mark').evaluateAll(marks => marks.map(m => getComputedStyle(m).color));
  assert.deepEqual(paints, ['rgb(36, 72, 237)', 'rgb(128, 148, 255)'], 'Explicit host themes do not inherit the wrong system palette');
  await page.getByRole('link', { name: 'Антон Гороховатский Дизайн и разработка', exact: true }).focus();
  assert(await page.locator('ag-signature').first().evaluate(host => host.shadowRoot.activeElement?.matches(':focus-visible')), 'The author link has a keyboard focus indicator');
  await mark.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('ag-signature').shadowRoot.querySelector('.mark').dataset.arcRunning === 'true');
  await page.getByRole('button', { name: 'Остановить движение', exact: true }).click();
  assert.equal(await mark.getAttribute('data-arc-running'), 'false', 'Pause stops the arc');
  await page.getByRole('button', { name: 'Включить движение', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('ag-signature').shadowRoot.querySelector('.mark').dataset.arcRunning === 'true');
  await page.evaluate(() => { document.documentElement.dataset.reduceMotion = 'true'; });
  await page.waitForFunction(() => [...document.querySelectorAll('ag-signature')].every(h => h.shadowRoot.querySelector('.mark').dataset.arcRunning === 'false'));
  await page.evaluate(() => { delete document.documentElement.dataset.reduceMotion; });
  await page.screenshot({ path: `${directory}/${engine}-signature-desktop.png` });

  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'load' });
  await checkBounds('mobile: 320px and reduced motion');
  assert.equal(await page.getByRole('button', { name: 'Остановить движение', exact: true }).count(), 0, 'System reduction needs no decorative-motion switch');
  await page.getByRole('button', { name: 'Текст 200%', exact: true }).click();
  await checkBounds('mobile: text 200%');
  await page.locator('ag-signature').first().screenshot({ path: `${directory}/${engine}-signature-text-200.png` });

  const fallback = await browser.newPage({ viewport: { width: 320, height: 568 }, javaScriptEnabled: false });
  await fallback.goto(`${server.origin}/signature/demo.html`, { waitUntil: 'load' });
  const links = fallback.locator('ag-signature a[rel="author"]');
  assert.equal(await links.count(), 2);
  for (const link of await links.all()) {
    assert(await link.isVisible(), 'The author link survives without JavaScript');
    assert.equal(await link.getAttribute('href'), 'https://gorokhovatsky.tech/');
  }
  assert.equal(await fallback.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Fallback does not overflow');
  await fallback.close();
  assert.deepEqual([...requests].sort(), ['/signature/demo.html', '/signature/v1/signature.js'], 'Signature checks never load portfolio runtime or media');
  assert.deepEqual(errors, []);
  writeFileSync(`${directory}/${engine}-signature.json`, JSON.stringify({ engine, version, requests: [...requests], report }, null, 2));
  console.log(`Signature ${engine}: languages, themes, links, focus, motion/pause, 320px, text 200% and no-JS fallback passed; no portfolio assets loaded.`);
} finally { await browser.close(); await new Promise((done, reject) => server.server.close(error => error ? reject(error) : done())); }
