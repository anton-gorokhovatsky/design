import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";

const { startStaticServer, declineAnalyticsNotice } = createRequire(import.meta.url)("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
// Geometry and navigation do not depend on presence. Keep departing-document
// keepalive out of this fixture; check-live-surface covers the service lifecycle.
const { server, origin } = await startStaticServer({ projectRoot: process.cwd(), presence: false });
const browser = await ({ chromium, webkit })[engine].launch();
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || ".qa-artifacts/map-routes";
mkdirSync(directory, { recursive: true });
const errors = [];

// The light pool follows the painted target, including CSS placement and depth.
const focusOffset = () => {
  const field = document.querySelector('[data-practice-map]');
  const node = document.querySelector(`[data-map-id="${field.dataset.focusId}"]`);
  if (!node) return Infinity;
  const bounds = field.getBoundingClientRect(), target = node.getBoundingClientRect();
  const x = bounds.x + parseFloat(field.style.getPropertyValue('--focus-x')) * bounds.width / 100;
  const y = bounds.y + parseFloat(field.style.getPropertyValue('--focus-y')) * bounds.height / 100;
  return Math.hypot(x - target.x - target.width / 2, y - target.y - target.height / 2);
};

// Inspect the painted path in screen pixels, independently of its control points.
const routeProblems = () => [...document.querySelectorAll('[data-map-links] path:not([hidden])')].flatMap(path => {
  const length = path.getTotalLength(), matrix = path.getScreenCTM();
  const points = Array.from({ length: 81 }, (_, i) => path.getPointAtLength(length * i / 80).matrixTransform(matrix));
  const start = points[0], end = points.at(-1);
  const dx = end.x - start.x, dy = end.y - start.y, chord = Math.hypot(dx, dy);
  if (chord < .1) return [];
  let previous = 0, travelled = 0, backwards = 0, deflection = 0, low = 0, high = 0;
  points.forEach((point, index) => {
    const progress = ((point.x - start.x) * dx + (point.y - start.y) * dy) / chord;
    const offset = (dx * (point.y - start.y) - dy * (point.x - start.x)) / chord;
    backwards = Math.max(backwards, previous - progress);
    deflection = Math.max(deflection, Math.abs(offset));
    low = Math.min(low, offset); high = Math.max(high, offset);
    if (index) travelled += Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y);
    previous = progress;
  });
  return (low < -.25 && high > .25) || backwards > .25 || deflection > Math.max(1, chord * .15) || travelled > chord * 1.12 + .5
    ? [{ key: path.dataset.relationKey, chord, travelled, backwards, deflection }] : [];
});

try {
  for (const width of [320, 390, 680, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 320 ? 568 : 900 },
      isMobile: width <= 680, hasTouch: width <= 680, reducedMotion: "no-preference" });
    page.on("pageerror", error => errors.push(error.message));
    for (const view of ["map", "time"]) {
      await page.goto(`${origin}/?scene=map&view=${view}`);
      await declineAnalyticsNotice(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.querySelector('[data-whoop-recovery]').textContent.includes('77')
        && !document.querySelector('[data-map-links][data-layout-pending]'));
      const check = async label => assert.deepEqual(await page.evaluate(routeProblems), [], `${engine} ${width} ${view} ${label}`);
      await check("resting routes");
      if (width > 900 && view === "map") {
        const positions = () => page.locator('[data-map-nodes] button').evaluateAll(nodes =>
          nodes.map(node => [node.dataset.mapId, node.style.getPropertyValue('--x'), node.style.getPropertyValue('--y')]));
        const before = await positions();
        const labels = page.locator('.map-space-label:visible');
        assert.ok(await labels.count() > 0 && await labels.count() <= 7, 'Bounded additional labels use the free field.');
        assert.ok(parseFloat(before.find(([id]) => id === 'garage')[2]) < 14, 'The upper group uses available headroom.');
        const intersections = await labels.evaluateAll(elements => elements.flatMap(label => {
          const rect = label.getBoundingClientRect();
          const outside = rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight;
          const overlaps = [...document.querySelectorAll('.map-controls,.display-control,.site-header,.control-console,.map-axis-label,.map-space-label,.map-anchor-label,[data-map-nodes] button')]
            .filter(node => node !== label && node.dataset.mapId !== label.dataset.mapLabelId
              && node.checkVisibility({ visibilityProperty: true }))
            .some(node => { const other = node.getBoundingClientRect(); return rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top; });
          return outside || overlaps ? [label.dataset.mapLabelId] : [];
        }));
        assert.deepEqual(intersections, [], 'Resting labels clear points, controls and each other.');
        await page.locator('#screen-controls-trigger').click();
        await page.keyboard.press('Escape');
        await page.locator('.map-controls [data-map-filter="company"]').click();
        await page.waitForFunction(() => [...document.querySelectorAll('.map-space-label--project,.map-space-label.map-node-label--project')]
          .every(label => Number(getComputedStyle(label).opacity) < .05));
        assert.deepEqual(await positions(), before, 'Settings and filters retain map coordinates.');
        await page.locator('.map-controls [data-map-filter="all"]').click();
        assert.deepEqual(await positions(), before, 'Returning to all objects retains map coordinates.');
      } else {
        assert.equal(await page.locator('.map-space-label').count(), 0, 'Compact and chronological maps keep their own presentation.');
      }
      if (width === 390 && view === 'map') {
        const placement = () => page.evaluate(() => ({
          points: [...document.querySelectorAll('[data-map-id]')].map(node => [node.dataset.mapId,
            node.style.getPropertyValue('--x'), node.style.getPropertyValue('--y')]).sort((a, b) => a[0].localeCompare(b[0])),
          captions: [...document.querySelectorAll('.mobile-landmark')].map(label => [label.dataset.mapLabelId,
            label.style.getPropertyValue('--mobile-label-dx'), label.style.getPropertyValue('--mobile-label-dy')]),
        }));
        const settled = () => page.waitForFunction(() => !document.querySelector('[data-map-links][data-layout-pending]')
          && !document.querySelector('[data-practice-map][data-time-transition]'));
        // Match the public reproduction, then retain the surrounding route matrix.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        await settled();
        await page.mouse.move(0, 0);
        const initial = await placement();
        for (const enabled of [true, false]) {
          await page.locator('[data-constellation-nav-toggle]').click();
          await page.locator('.constellation-nav [data-time-toggle]').click();
          await page.waitForFunction(enabled => document.querySelector('[data-practice-map]').hasAttribute('data-time-view') === enabled, enabled);
          await settled();
        }
        assert.deepEqual(await placement(), initial, 'Closing the chronology menu restores the same point and caption positions.');
        await page.setViewportSize({ width: 390, height: 900 });
        await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        await settled();
      }
      for (const id of view === "time" ? ["garage", "private-practice"] : ["garage", "private-practice", "running", "youtube"]) {
        if (width <= 900) await page.locator(`[data-map-id="${id}"]`).click();
        else await page.locator(`[data-map-id="${id}"]`).focus();
        await page.waitForFunction(() => !document.querySelector('[data-relation-morphing]'));
        assert.ok(await page.evaluate(focusOffset) < 1,
          `${engine} ${width} ${view} ${id}: highlight is centered on its visible object.`);
        assert.ok(await page.locator('[data-map-links] .is-active-relation').count() > 0);
        assert.ok(await page.locator('[data-map-links] .is-active-relation').evaluateAll(paths =>
          paths.every(path => getComputedStyle(path).strokeDasharray === 'none')),
        'Active routes use a continuous line.');
        await check(id);
        if (width <= 900) await page.keyboard.press("Escape");
        await page.screenshot({ path: `${directory}/${engine}-${width}-${view}-${id}.png` });
      }
    }
    console.log(`PASS ${engine} ${width}: both map layouts, four relation families, no loops or disproportionate detours.`);
    await page.close();
  }
  // History and responsive changes preserve the scene from which an index point was opened.
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page.on('pageerror', error => errors.push(error.message));
    for (const transition of ['history', 'resize']) {
      await page.goto(origin);
      await declineAnalyticsNotice(page);
      await page.locator('[data-spatial-search]').click();
      await page.locator('[data-command-input]').fill('гараж');
      await page.locator('.command-result[data-result-id="garage"]').click();
      await page.locator('.map-inspector.is-open').waitFor();
      const pointUrl = page.url();
      if (transition === 'history') {
        await page.goBack();
        await page.locator('.map-inspector.is-open').waitFor({ state: 'hidden' });
        assert.ok(await page.locator('[data-focused-map-open]').isVisible(), 'Back returns to the introductory map.');
        await page.goForward();
        await page.locator('.map-inspector.is-open').waitFor();
      } else {
        for (const width of [930, 390]) {
          await page.setViewportSize({ width, height: 844 });
          await page.waitForFunction(width => document.querySelector('#map-pane').clientWidth === width, width);
          await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
        }
      }
      assert.equal(page.url(), pointUrl, `${transition} retains the point route and its original scene.`);
      await page.locator('[data-close-inspector]').click();
      await page.locator('.map-inspector.is-open').waitFor({ state: 'hidden' });
      assert.ok(await page.locator('[data-focused-map-open]').isVisible(), `Closing after ${transition} retains the introductory map.`);
      assert.equal(await page.locator('[data-focused-return]').isVisible(), false);
      assert.ok(await page.locator('[data-map-id="garage"]').evaluate(control => control === document.activeElement
        && !control.closest('[inert]') && control.checkVisibility({ visibilityProperty: true })),
      'Closing the restored card returns focus to its visible map point.');
      await page.screenshot({ path: `${directory}/${engine}-focused-index-${transition}-return.png` });
      console.log(`PASS ${engine}: index point ${transition}/close preserves its introductory scene and focus.`);
    }
    await page.close();
  }
  // Introductory captions use the projected map, including release momentum.
  // The 740px viewport catches the gap between the former fixed breakpoints.
  for (const viewport of [{ width: 390, height: 740 }, { width: 320, height: 568 }, { width: 390, height: 568 }]) {
    const page = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await declineAnalyticsNotice(page);
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForFunction(() => document.querySelector('[data-whoop-recovery]').textContent.includes('77')
      && !document.querySelector('[data-map-links][data-layout-pending]')
      && document.querySelector('[data-map-label-id="narkomfin"]').style.getPropertyValue('--spatial-label-dx'));
    const checkCaptions = async () => {
      const state = await page.evaluate(() => {
        const labels = [...document.querySelectorAll('.focused-home .direction-landmark')]
          .filter(label => getComputedStyle(label).visibility !== 'hidden');
        const field = document.querySelector('.focused-home__map').getBoundingClientRect();
        const boxes = labels.map(label => ({ id: label.dataset.mapLabelId,
          visible: getComputedStyle(label).visibility !== 'hidden', rect: label.getBoundingClientRect() }));
        const satellites = [...document.querySelectorAll('.project-satellite .map-node__glyph')]
          .filter(node => node.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
          .map(node => ({ id: node.closest('[data-map-id]').dataset.mapId, rect: node.getBoundingClientRect() }));
        // A transparent pulsar beam must not punch a hole in the map grid.
        // Inspect actual SVG subpath exits against the opaque core in its canvas.
        const pulse = document.querySelector('.celestial-volume--running');
        const core = pulse.getBoundingClientRect(), radius = core.width * 27 / pulse.width;
        const center = { x: core.x + core.width / 2, y: core.y + core.height / 2 };
        const pulsarGaps = [...document.querySelectorAll('.spatial-axis,.spatial-orbit')].flatMap(path => {
          const matrix = path.getScreenCTM(); let previous;
          const gaps = [];
          for (const [, command, x, y] of path.getAttribute('d').matchAll(/([ML])(-?[\d.]+),(-?[\d.]+)/g)) {
            const point = new DOMPoint(Number(x), Number(y)).matrixTransform(matrix);
            if (command === 'M' && previous) {
              const middle = { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 };
              if (Math.hypot(middle.x - center.x, middle.y - center.y) < radius * 2.6
                && Math.max(Math.hypot(previous.x - center.x, previous.y - center.y),
                  Math.hypot(point.x - center.x, point.y - center.y)) > radius + 2)
                gaps.push({ from: previous, to: point, center, radius });
            }
            previous = { x: point.x, y: point.y };
          }
          return gaps;
        });
        return {
          pulsarGaps,
          visible: boxes.filter(box => box.visible).length,
          clipped: boxes.filter(({ rect }) => rect.left < field.left - 1 || rect.right > field.right + 1
            || rect.top < field.top - 1 || rect.bottom > field.bottom + 1).map(box => box.id),
          overlaps: boxes.flatMap((a, index) => boxes.slice(index + 1).filter(b =>
            a.rect.left < b.rect.right && a.rect.right > b.rect.left
            && a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top).map(b => [a.id, b.id])),
          satelliteOverlaps: boxes.flatMap(a => satellites.filter(b =>
            a.rect.left < b.rect.right && a.rect.right > b.rect.left
            && a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top).map(b => [a.id, b.id])),
        };
      });
      assert.deepEqual(state.pulsarGaps, [], 'Grid lines only disappear behind the opaque pulsar core, including after rotation');
      assert.equal(state.visible, 6, `${engine} ${viewport.width}: all introductory captions remain available; private projects share their orbit picker`);
      assert.equal(await page.locator('.project-orbit-picker [data-picker-project]').count(), 10,
        'Every private project remains available in the touch picker');
      assert.deepEqual(state.clipped, [], 'Introductory captions stay inside their field');
      assert.deepEqual(state.overlaps, [], 'Introductory captions never overlap');
      assert.deepEqual(state.satelliteOverlaps, [], 'Moving satellites never cover introductory captions');
    };
    await checkCaptions();
    const detachedCaptions = await page.locator('.focused-home .direction-landmark').evaluateAll(labels =>
      labels.filter(label => getComputedStyle(label).visibility !== 'hidden').flatMap(label => {
        const caption = label.getBoundingClientRect();
        const glyph = document.querySelector(`[data-map-id="${label.dataset.mapLabelId}"] .map-node__glyph`).getBoundingClientRect();
        const gap = Math.hypot(Math.max(0, caption.left - glyph.right, glyph.left - caption.right),
          Math.max(0, caption.top - glyph.bottom, glyph.top - caption.bottom));
        return gap > 32 ? [{ id: label.dataset.mapLabelId, gap }] : [];
      }));
    assert.deepEqual(detachedCaptions, [], 'Resting captions stay beside their own objects');
    for (let frame = 0; frame < 12; frame++) { await page.waitForTimeout(80); await checkCaptions(); }
    // Short screens scroll the complete constellation above the fixed controls.
    // Exercise gestures in that visible field, not at offscreen coordinates.
    await page.locator('.focused-home__map').scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await checkCaptions();
    for (const side of [1, -1]) {
      const start = await page.evaluate(side => {
        const field = document.querySelector('.focused-home__map'), box = field.getBoundingClientRect();
        for (const x of [side > 0 ? .12 : .88, .5]) for (const y of [.72, .42, .2]) {
          const point = { x: box.left + box.width * x, y: box.top + box.height * y };
          const target = document.elementFromPoint(point.x, point.y);
          if (field.contains(target) && !target.closest('button,a,.map-node-label')) return point;
        }
        return null;
      }, side);
      assert.ok(start, 'The map has a free area for the rotation gesture');
      const field = await page.locator('.focused-home__map').boundingBox();
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(side > 0 ? viewport.width - 8 : 8,
        field.y + field.height * (side > 0 ? .08 : .92), { steps: 16 });
      await page.mouse.up();
      await page.waitForTimeout(350);
      await checkCaptions();
      if (side === 1) assert.ok(await page.locator('[data-map-id="running"]').evaluate(node =>
        parseFloat(node.style.getPropertyValue('--spatial-dx')) > 20),
      'Caption placement must not stop the map before the requested rotation');
    }
    // The orbit picker has a generous transparent hit area. Starting a swipe
    // there must rotate the map, while an ordinary tap still opens the picker.
    const practice = page.locator('[data-map-id="private-practice"]');
    // A near-axis point can barely move even while the volume turns. Measure
    // the whole constellation, including depth, rather than that point's x.
    const rotationPositions = () => page.locator('.focused-home .map-node:not([inert])').evaluateAll(nodes =>
      nodes.map(node => ['--spatial-dx', '--spatial-dy'].map(key => parseFloat(node.style.getPropertyValue(key)))));
    const displacement = (before, after) => Math.max(...after.map((p, i) => Math.hypot(p[0]-before[i][0], p[1]-before[i][1])));
    const beforeSwipe = await rotationPositions();
    const orbitBox = await practice.boundingBox();
    const startX = orbitBox.x + orbitBox.width / 2, startY = orbitBox.y + orbitBox.height / 2;
    // Chromium receives native touch input. WebKit's driver has no swipe API,
    // so reproduce the same child-to-field capture handoff with pointer input.
    const touch = engine === 'chromium' ? await page.context().newCDPSession(page) : null;
    const touchEvent = (type, x, y) => touch.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 0 }],
    });
    if (touch) await touchEvent('touchStart', startX, startY);
    else {
      await practice.evaluate(node => node.addEventListener('pointerdown', event =>
        event.target.setPointerCapture(event.pointerId), { once: true }));
      await page.mouse.move(startX, startY); await page.mouse.down();
    }
    if (touch) await touchEvent('touchMove', startX + 8, startY);
    else await page.mouse.move(startX + 8, startY);
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const firstMove = await rotationPositions();
    const endX = Math.min(viewport.width - 8, startX + 70);
    if (touch) {
      for (let step = 1; step <= 10; step++) {
        await touchEvent('touchMove', startX + 8 + (endX - startX - 8) * step / 10, startY);
        await page.waitForTimeout(16);
      }
      await touchEvent('touchEnd'); await touch.detach();
    } else {
      await page.mouse.move(endX, startY, { steps: 10 }); await page.mouse.up();
    }
    await page.waitForTimeout(350);
    const afterSwipe = await rotationPositions();
    assert.ok(displacement(beforeSwipe, afterSwipe) > 1,
      'A swipe starting on the orbit target rotates the map');
    assert.ok(displacement(firstMove, afterSwipe) > 1,
      'The map keeps rotating after capture transfers from the touched child');
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('has-point-preview')), false,
      'Releasing a rotation gesture must not open a project picker');
    if (engine === 'webkit') {
      const beforeTouch = await rotationPositions();
      const ownership = await practice.evaluate(node => {
        const field = node.closest('.focused-home__map'), r = node.getBoundingClientRect();
        const send = (type, dx, dy) => {
          // Desktop WebKit exposes Touch but forbids its constructor. Exercise
          // the adapter with its event shape; Chromium above uses real touch.
          const touch = { identifier: 19, target: node, clientX: r.x+r.width/2+dx, clientY: r.y+r.height/2+dy };
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperties(event, { touches: { value: type === 'touchend' ? [] : [touch] },
            changedTouches: { value: [touch] } });
          node.dispatchEvent(event); return event.defaultPrevented;
        };
        send('touchstart', 0, 0);
        const first = send('touchmove', -10, 0);
        // WebKit can cancel its pointer stream while the finger's touch stream
        // continues. The native adapter must retain ownership of that drag.
        for (const type of ['pointercancel', 'lostpointercapture']) field.dispatchEvent(new PointerEvent(type,
          { bubbles: true, pointerType: 'touch', pointerId: 19 }));
        const continued = send('touchmove', -70, 0);
        send('touchend', -70, 0);
        send('touchstart', 0, 0);
        const vertical = send('touchmove', 1, -50);
        send('touchend', 1, -50);
        return { first, continued, vertical, dragging: field.hasAttribute('data-dragging') };
      });
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      assert.deepEqual(ownership, { first: true, continued: true, vertical: false, dragging: false },
        'Horizontal touch stays owned across pointer cancellation; vertical scrolling remains native');
      assert.ok(displacement(beforeTouch, await rotationPositions()) > 1, 'The continuing touch stream rotates the map');
    }
    await practice.tap();
    assert.ok(await page.locator('.project-orbit-picker').isVisible(), 'A tap still opens the project picker');
    await page.keyboard.press('Escape');
    await checkCaptions();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Media changes and the closing selection can still own transition frames.
    // Measure idle work only after those observable updates have settled.
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.waitForFunction(() => !document.querySelector('[data-map-links][data-layout-pending]')
      && !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === 'running'));
    const idle = await page.locator('.practice-orbits-canvas').evaluate(canvas => new Promise(resolve => {
      let paints = 0;
      const observer = new MutationObserver(records => { paints += records.length; });
      observer.observe(canvas, { attributes: true, attributeFilter: ['data-orbit-time'] });
      setTimeout(() => { observer.disconnect(); resolve({ paints, time: canvas.dataset.orbitTime }); }, 500);
    }));
    assert.equal(idle.paints, 0, 'A settled reduced-motion map does not repaint the orbits');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(time => Number(document.querySelector('.practice-orbits-canvas').dataset.orbitTime) > Number(time), idle.time);
    await page.screenshot({ path: `${directory}/${engine}-${viewport.width}-introductory-captions.png` });
    await page.close();
    console.log(`PASS ${engine} ${viewport.width}: six introductory captions, ten picker projects, rotation and momentum without overlap.`);
  }
  for (const [width, height, font] of [[320, 844, 32], [390, 844, 32], [320, 568, 16], [320, 568, 32]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/?scene=map&view=time`);
    await page.evaluate(font => { document.documentElement.style.fontSize = `${font}px`; return document.fonts.ready; }, font);
    await declineAnalyticsNotice(page);
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.waitForFunction(() => !document.querySelector('[data-map-links][data-layout-pending]'));
    const returnTop = await page.locator('[data-focused-return]').evaluate(link => link.getBoundingClientRect().top);
    await page.locator('[data-time-scroller]').evaluate(scroller => { scroller.scrollTop = 100; });
    assert.equal(await page.locator('[data-focused-return]').evaluate(link => link.getBoundingClientRect().top), returnTop,
      'Scrolling the diagram does not move the return link under the author card');
    assert.ok(await page.locator('[data-time-scroller]').evaluate(scroller => {
      const clip = scroller.getBoundingClientRect();
      const controls = [...document.querySelectorAll('.mobile-first-dock button,.mobile-first-dock a')]
        .filter(control => control.checkVisibility({ visibilityProperty: true }) && control.offsetWidth);
      return getComputedStyle(scroller).overflowY === 'auto'
        && clip.top >= document.querySelector('[data-focused-return]').getBoundingClientRect().bottom
        && controls.every(control => clip.bottom <= control.getBoundingClientRect().top + .1);
    }), 'The scroll viewport clips the diagram between the return link and the actual lower buttons');
    const yearCollisions = await page.evaluate(() => [...document.querySelectorAll('.orbital-radar i span')]
      .filter(year => year.offsetWidth).flatMap(year => {
        const a = year.getBoundingClientRect();
        return [...document.querySelectorAll('.map-node[data-time-year] .map-node__glyph')].filter(node => {
          const b = node.getBoundingClientRect();
          return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        }).map(node => [year.textContent, node.closest('[data-map-id]').dataset.mapId]);
      }));
    assert.deepEqual(yearCollisions, [], `${engine} ${width}/200%: years clear the dated points`);
    const ids = await page.locator('.map-node[data-time-year]').evaluateAll(nodes => nodes.map(node => node.dataset.mapId));
    for (const id of ids) {
      const node = page.locator(`[data-map-nodes] [data-map-id="${id}"]`);
      await node.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
      assert.equal(await node.evaluate(element => {
        const rect = element.querySelector('.map-node__glyph').getBoundingClientRect();
        return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('[data-map-id]')?.dataset.mapId;
      }), id, `${engine} ${width}/200%: ${id} receives its own centre click`);
    }
    await page.locator('[data-time-toggle]').first().evaluate(button => button.click());
    await page.waitForFunction(() => !document.querySelector('[data-practice-map]').hasAttribute('data-time-view'));
    assert.equal(await page.locator('[data-time-scroller]').evaluate(field => field.scrollTop), 0,
      'Leaving chronology resets its scroll offset');
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
}
