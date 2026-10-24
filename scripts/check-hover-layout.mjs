import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";
import { mapItems } from "../js/map-data.js";

const { startStaticServer, readMaterialAuditExpression, readRenderedFrameCorners } = createRequire(import.meta.url)("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const { server, origin } = await startStaticServer({ projectRoot: process.cwd() });
const browser = await ({ chromium, webkit })[engine].launch();
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || ".qa-artifacts/hover-layout";
mkdirSync(directory, { recursive: true });
const results = [], errors = [];
const inspect = () => {
  const rect = element => {
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const preview = document.querySelector(".map-hover-preview"), author = document.querySelector(".site-header");
  const authorStyle = getComputedStyle(author);
  const panels = [...document.querySelectorAll("[data-floating-console]")].map(rect).filter(r => r.width && r.height);
  const frames = [...preview.querySelectorAll(".map-hover-preview__mosaic-main, .map-hover-preview__mosaic-slot, .map-hover-preview__readout")]
    .map(rect).filter(r => r.width && r.height);
  const collisions = frames.filter(frame => panels.some(panel => frame.left < panel.right - .5 && frame.right > panel.left + .5
    && frame.top < panel.bottom - .5 && frame.bottom > panel.top + .5));
  return { author: rect(author), authorVisible: authorStyle.visibility === "visible" && Number(authorStyle.opacity) === 1,
    previewVisible: preview.classList.contains("is-visible"), compact: preview.classList.contains("is-compact-preview"),
    collisions, outside: frames.filter(r => r.left < -.5 || r.top < -.5 || r.right > innerWidth + .5 || r.bottom > innerHeight + .5) };
};
try {
  // Crossing ordinary map points must not flash the unrelated scene.
  {
    const page = await browser.newPage({ viewport: { width: 1512, height: 862 }, reducedMotion: "no-preference",
      recordVideo: { dir: `${directory}/video`, size: { width: 1512, height: 862 } } });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + '/?scene=map');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.documentElement.dataset.mapControlsReady
      && !document.querySelector('[data-map-links][data-layout-pending]'));
    await page.mouse.move(0, 0);
    const baseline = await page.locator('.map-space-label').evaluateAll(labels => labels.map(label => ({ id: label.dataset.mapLabelId, transform: getComputedStyle(label).transform })));
    const labelIds = baseline.map(label => label.id);
    assert.ok(labelIds.length > 0);
    for (const id of ['snow', 'running', 'principle-data-intuition', 'snow']) {
      await page.locator(`[data-map-id="${id}"]`).hover();
      const frames = await page.evaluate(async ids => {
        const frames = [];
        for (let index = 0; index < 24; index++) {
          await new Promise(requestAnimationFrame);
          frames.push({ labels: ids.map(id => Number(getComputedStyle(document.querySelector(`[data-map-label-id="${id}"]`)).opacity)),
            transforms: ids.map(id => getComputedStyle(document.querySelector(`[data-map-label-id="${id}"]`)).transform),
            object: Number(getComputedStyle(document.querySelector('[data-map-id="ilmix"]')).opacity) });
        }
        return frames;
      }, labelIds);
      assert.ok(frames.every(frame => frame.labels.every(opacity => opacity > .99)), `${id}: hovering a point keeps unrelated labels visible`);
      assert.ok(frames.every(frame => frame.object > .99), `${id}: hovering a point does not dim unrelated objects`);
      assert.ok(frames.every(frame => frame.transforms.every((transform, index) => transform === baseline[index].transform)),
        `${id}: a persistent label keeps its placement on hover`);
    }
    await page.screenshot({ path: `${directory}/${engine}-stable-map-hover.png` });
    await page.close();
    copyFileSync(await page.video().path(), `${directory}/${engine}-stable-map-hover.webm`);
    console.log(`PASS ${engine}: ordinary hover keeps the surrounding map stable across 96 frames.`);
  }
  for (const [width, height] of [[1440, 900], [1024, 768], [720, 450]]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme, reducedMotion: "reduce" });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + '/?scene=map');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelector(".whoop-level"));
    await page.waitForFunction(() => !document.querySelector("[data-map-links][data-layout-pending]"));
    const initial = (await page.evaluate(inspect)).author;
    for (const [index, item] of mapItems.filter(item => item.previewVideo).entries()) {
      const target = page.locator(`[data-map-id="${item.id}"]`);
      if (width <= 900 && item.parent === 'private-practice') {
        assert.equal(await target.getAttribute('inert'), '', 'Touch satellites are decorative; the picker owns selection.');
        assert.equal(await page.locator(`[data-picker-project="${item.id}"]`).count(), 1,
          'Every decorative satellite has its project in the touch picker.');
        continue;
      }
      if (index % 2) await target.focus();
      else await target.hover();
      if (width <= 900) {
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const result = await page.evaluate(inspect);
        assert.equal(result.previewVisible, false, "Compact navigation opens media on selection, not hover.");
        assert.ok(result.authorVisible, "Compact hover/focus retains the author card.");
        assert.deepEqual(result.author, initial);
        continue;
      }
      if (item.parent === 'private-practice') {
        await page.waitForFunction(label => {
          const title = document.querySelector('.project-orbit-tooltip');
          return !title.hidden && title.textContent === label;
        }, item.label);
        const result = await page.evaluate(inspect);
        assert.equal(result.previewVisible, false, 'Orbit satellites show their title without a video preview.');
        assert.ok(result.authorVisible);
        assert.deepEqual(result.author, initial);
        continue;
      }
      await page.waitForFunction(id => {
        const preview = document.querySelector(".map-hover-preview");
        return preview.classList.contains("is-visible") && preview.querySelector("video").dataset.previewId === id;
      }, item.id);
      const result = await page.evaluate(inspect);
      results.push({ width, theme, id: item.id, ...result });
      assert.ok(result.authorVisible, `${item.id}: hover/focus must retain the author card.`);
      assert.deepEqual(result.author, initial, `${item.id}: hover/focus must not move the author card.`);
      assert.deepEqual(result.collisions, [], `${width} ${item.id}: reel frames must clear persistent consoles.`);
      assert.deepEqual(result.outside, [], `${width} ${item.id}: preview must fit the viewport.`);
      if (item.id === "doronin") {
        // Layout is independent of whether the native decoder has reached canplay.
        // Native media playback is covered by check-reel-preview.mjs.
        await page.screenshot({ path: `${directory}/${engine}-${width}-${theme}.png` });
      }
    }
    await page.mouse.move(0, 0);
    const settingsTrigger = width <= 900 ? ".whoop-compact-trigger" : ".whoop-foot button";
    await page.locator(settingsTrigger).focus();
    await page.waitForFunction(() => !document.querySelector(".map-hover-preview").classList.contains("is-visible"));
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.activeElement === document.querySelector("[data-whoop-toggle]"));
    await page.keyboard.press("Escape");
    await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), settingsTrigger);
    console.log(`PASS ${engine} ${width} ${theme}: ${mapItems.filter(item => item.previewVideo).length} hover/focus targets, persistent card, clear consoles, settings.`);
    await page.close();
  }
  // A narrow map pane still has desktop pointer/keyboard interaction.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + '/?story=1');
    await page.locator('#story-pane[data-ready="true"]').waitFor();
    const feedback = async selector => {
      const target = page.locator(selector);
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.activeElement?.blur());
      const color = await target.evaluate(element => getComputedStyle(element).color);
      const box = await target.boundingBox();
      await target.hover();
      await page.waitForFunction(({ selector, color }) => getComputedStyle(document.querySelector(selector)).color !== color, { selector, color });
      assert.deepEqual(await target.boundingBox(), box, selector + ': hover must not move the control');
      assert.equal(await target.evaluate(element => getComputedStyle(element).cursor), 'pointer');
      await page.mouse.move(0, 0);
      await page.keyboard.press('Tab');
      await target.focus();
      assert.equal(await target.evaluate(element => element.matches(':focus-visible')), true);
    };
    await feedback('[data-constellation-nav-toggle]');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-constellation-nav-toggle]').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    await page.locator('[data-focused-map-open]').click();
    await feedback('[data-focused-return]');
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('[data-focused-map-open]').isVisible(), 'Return restores the compact map');
    assert.ok(await page.locator('#story-pane').isVisible(), 'Map controls retain the paired story');
    await page.locator('.map-node[data-map-id="private-practice"]').click();
    await page.locator('.project-orbit-picker').waitFor();
    assert.deepEqual((await page.evaluate(readMaterialAuditExpression)).failures, [], 'The paired picker retains the common glass material');
    const pickerHeader = await page.locator('.point-preview__head').boundingBox();
    const list = page.locator('.project-orbit-picker');
    await list.evaluate(element => element.scrollTop = 64);
    const glass = await page.evaluate(() => {
      const header = document.querySelector('.point-preview__head');
      const body = document.querySelector('.project-picker-glass');
      const list = document.querySelector('.project-orbit-picker');
      return { header: getComputedStyle(header).backdropFilter || getComputedStyle(header).webkitBackdropFilter,
        body: getComputedStyle(body).backgroundColor, headerFill: getComputedStyle(header).backgroundColor,
        listTop: list.getBoundingClientRect().top, headerBottom: header.getBoundingClientRect().bottom };
    });
    assert.equal(glass.header, 'blur(24px)', 'The pinned header must soften the scrolling projects with shared glass');
    assert.equal(glass.headerFill, glass.body, 'Header and body use the same material');
    assert.ok(glass.listTop < glass.headerBottom, 'Projects scroll beneath the glass, not into a hard crop below it');
    assert.deepEqual(await page.locator('.point-preview__head').boundingBox(), pickerHeader, 'Scrolling keeps the glass header fixed');
    assert.ok((await readRenderedFrameCorners(page, '.point-preview')).every(delta => delta < 12), 'Shared glass stays within rounded corners');
    await page.screenshot({ path: `${directory}/${engine}-picker-glass.png` });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    await page.waitForFunction(() => document.querySelector('.point-preview').inert);
    assert.equal(await page.locator('.point-preview').isVisible(), false, 'The folded map cannot cover its author/menu with a preview');
    await page.locator('#story-pane [data-close-story]').click();
    await page.locator('[data-picker-project="krainiuk"]').click();
    await page.locator('.project-orbit-back').click();
    assert.ok(await page.locator('.project-orbit-picker').isVisible(), 'Unfolding restores the working picker, including its last project');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.close();
    console.log(`PASS ${engine}: paired compact map retains pointer feedback, keyboard activation and return.`);
  }
  for (const [width, height] of [[1440, 900], [1024, 768], [720, 450]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "no-preference" });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + '/?scene=map');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !document.querySelector("[data-map-links][data-layout-pending]"));
    await page.locator('[data-map-id="narkomfin"]').hover();
    for (let frame = 0; frame < 24; frame++) {
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const result = await page.evaluate(inspect);
      if (width <= 900) assert.equal(result.previewVisible, false, "Compact hover does not start a preview.");
      assert.ok(result.authorVisible, "The author card must stay visible during preview entrance.");
      assert.deepEqual(result.collisions, [], `${width}: the entrance must stay within the reserved space.`);
    }
    await page.screenshot({ path: `${directory}/${engine}-${width}-motion.png` });
    await page.close();
    console.log(`PASS ${engine} ${width}: 24 entrance frames keep the author visible and the consoles clear.`);
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(`${directory}/${engine}-results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
}
