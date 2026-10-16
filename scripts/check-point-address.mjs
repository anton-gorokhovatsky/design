#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapItems } from '../js/map-data.js';
import { readPointAliases } from './point-address-scope.mjs';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { startStaticServer } = require('./browser-contracts.cjs');
const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const engine = process.argv[2] || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const requested = JSON.parse(process.env.PORTFOLIO_POINT_ADDRESSES || '[]');
const aliases = readPointAliases(readFileSync(new URL('../js/panels.js', import.meta.url), 'utf8')).aliases;
const addresses = requested.length ? requested : Object.entries(aliases).map(([from, to]) => ({ from, to }));
assert.ok(addresses.length, 'An address check must exercise a real renamed point.');
const { server, origin } = await startStaticServer({ projectRoot });
let browser;
const errors = [];
try {
  browser = await ({ chromium, webkit })[engine].launch({ headless: true });
  for (const { from, to } of addresses) {
    const item = mapItems.find(item => item.id === to);
    assert.ok(item && aliases[from] === to, 'Both addresses must identify the same map point.');
    for (const [width, height] of [[1280, 900], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
      page.on('pageerror', error => errors.push(error.message));
      for (const address of [from, to]) {
        await page.goto(`${origin}/?point=${address}#map`);
        await page.locator('[data-map-inspector].is-open').waitFor();
        assert.equal(new URL(page.url()).searchParams.get('point'), to);
        assert.equal(await page.locator('[data-map-id="' + to + '"]').getAttribute('aria-pressed'), 'true');
        assert.equal((await page.locator('#map-inspector-title').innerText()).replace(/\s+/g, ' '), item.title.replace(/\s+/g, ' '));
        if (item.href) assert.equal(await page.locator('[data-map-link]').getAttribute('href'), item.href);
        await page.reload();
        await page.locator('[data-map-inspector].is-open').waitFor();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('[data-map-inspector]').classList.contains('is-open'));
        assert.equal(new URL(page.url()).searchParams.has('point'), false, 'Closing a direct link returns to the map.');
      }
      if (width <= 900) {
        await page.goto(`${origin}/?scene=map&preview=${from}#map`);
        await page.locator('.point-preview').waitFor({ state: 'visible' });
        assert.equal(new URL(page.url()).searchParams.get('preview'), to);
        const link = new URL(await page.locator('.point-preview__link').getAttribute('href'));
        assert.equal(link.searchParams.get('point'), to);
        assert.equal(link.searchParams.get('preview'), to);
        await page.locator('.point-preview__link').click();
        await page.locator('[data-map-inspector].is-open').waitFor();
        await page.goBack();
        await page.waitForFunction(() => !document.querySelector('[data-map-inspector]').classList.contains('is-open'));
        assert.equal(new URL(page.url()).searchParams.get('preview'), to);
        await page.goForward();
        await page.locator('[data-map-inspector].is-open').waitFor();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.activeElement?.matches('.point-preview__link'));
      }
      console.log(`PASS ${engine} ${width}px: ${from} → ${to}, direct link, reload and return`);
      await page.close();
    }
  }
  assert.deepEqual(errors, [], 'No application exceptions.');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
