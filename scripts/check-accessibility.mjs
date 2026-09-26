import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";

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
const settle = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const capture = (page, name) => page.screenshot({ path: `${directory}/${engine}-${name}.png` });
const axe = async (page, name) => {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const result = await page.evaluate(async () => {
    const { violations, incomplete } = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    });
    return { violations, incomplete: incomplete.map(({ id, nodes }) => ({ id, count: nodes.length })) };
  });
  report.push({ name, axe: result });
  assert.deepEqual(result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(n => n.target) })), [], name);
};

// Axe cannot resolve translucent surfaces. Sample the rendered background after
// hiding only the labels, then composite their actual foreground and opacity.
const contrast = async page => {
  const targets = await page.evaluate(() => [...document.querySelectorAll(
    '.constellation-nav__label, .whoop-metrics dt, .whoop-level, .brand__role, .map-control > span:last-child',
  )].filter(e => e.checkVisibility({ visibilityProperty: true, opacityProperty: true })
    && !e.closest(':disabled')).map((e, id) => {
    const r = e.getBoundingClientRect(), style = getComputedStyle(e);
    let opacity = 1;
    for (let node = e; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    const target = { id, text: e.textContent, color: style.color, opacity,
      x: r.x, y: r.y, width: r.width, height: r.height, visibility: e.style.visibility };
    e.dataset.contrastSample = id;
    e.closest('.map-control')?.setAttribute('data-contrast-control', '');
    return target;
  }).filter(r => r.width && r.height && r.x >= 0 && r.y >= 0
    && r.x + r.width <= innerWidth + 1 && r.y + r.height <= innerHeight + 1));
  // Hide the affected navigation/WHOOP labels without changing their geometry.
  const conceal = await page.addStyleTag({ content: '[data-contrast-sample] { visibility: hidden !important; } [data-contrast-control] { opacity: 0 !important; }' });
  const pixels = (await page.screenshot()).toString("base64");
  await conceal.evaluate(e => e.remove());
  return page.evaluate(async ({ targets, pixels }) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + pixels; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const luminance = rgb => rgb.map(value => {
      value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const result = targets.map(target => {
      const rgba = target.color.match(/[\d.]+/g).map(Number);
      const alpha = target.opacity * (rgba[3] ?? 1), ratios = [];
      for (const x of [.2, .5, .8]) for (const y of [.25, .5, .75]) {
        const background = [...context.getImageData(Math.round(target.x + target.width * x),
          Math.round(target.y + target.height * y), 1, 1).data].slice(0, 3);
        const foreground = rgba.slice(0, 3).map((value, i) => value * alpha + background[i] * (1 - alpha));
        const a = luminance(foreground), b = luminance(background);
        ratios.push((Math.max(a, b) + .05) / (Math.min(a, b) + .05));
      }
      return { text: target.text, minimum: Math.min(...ratios) };
    });
    document.querySelectorAll('[data-contrast-sample]').forEach(e => {
      e.style.visibility = targets.find(t => t.id === Number(e.dataset.contrastSample))?.visibility || '';
      delete e.dataset.contrastSample;
    });
    document.querySelectorAll('[data-contrast-control]').forEach(e => e.removeAttribute('data-contrast-control'));
    return result;
  }, { targets, pixels });
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
        assert.deepEqual(measured.filter(item => item.minimum < 4.5), [], `Contrast ${name} ${palette}`);
        await capture(page, `palette-${palette}-${name}`);
      }
      await page.evaluate(() => document.documentElement.style.setProperty('--day-rgb', '83,142,103'));
      await axe(page, `home-${name}`);
    }
    await capture(page, `home-${name}`);
    await page.locator('.site-header').screenshot({ path: `${directory}/${engine}-author-${name}.png` });
    if (width > 680) await page.locator('.control-console').screenshot({ path: `${directory}/${engine}-navigation-${name}.png` });
    else {
      await page.locator('[data-constellation-nav-toggle]').click();
      await capture(page, `menu-${name}`);
      await page.keyboard.press('Escape');
    }

    await page.locator('[data-open-panel="contact"]').evaluate(e => e.click());
    await settle(page);
    const contacts = await page.locator('.contact-resume a').evaluateAll(links => links.map(e => {
      const r = e.getBoundingClientRect(); return { text: e.textContent.trim(), width: r.width, height: r.height };
    }));
    assert.equal(contacts.length, 2);
    assert.ok(contacts.every(r => r.height >= 32), JSON.stringify(contacts));
    const last = page.locator('.contact-links a').last();
    await last.focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.hasFocus()
      && document.querySelector('[data-content-panel]').contains(document.activeElement)), true, `Contact forward focus ${name}`);
    if (width <= 680) {
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
      await axe(page, `case-${name}`);
      await capture(page, `case-${name}`);
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
