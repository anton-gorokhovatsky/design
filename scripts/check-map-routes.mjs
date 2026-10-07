import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";

const { startStaticServer } = createRequire(import.meta.url)("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const { server, origin } = await startStaticServer({ projectRoot: process.cwd() });
const browser = await ({ chromium, webkit })[engine].launch();
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || ".qa-artifacts/map-routes";
mkdirSync(directory, { recursive: true });
const errors = [];

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
      await page.goto(`${origin}/?view=${view}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.querySelector('[data-whoop-recovery]').textContent.includes('77')
        && !document.querySelector('[data-map-links][data-layout-pending]'));
      const check = async label => assert.deepEqual(await page.evaluate(routeProblems), [], `${engine} ${width} ${view} ${label}`);
      await check("resting routes");
      if (width > 900 && view === "map") {
        const positions = () => page.locator('[data-map-nodes] button').evaluateAll(nodes =>
          nodes.map(node => [node.dataset.mapId, node.style.getPropertyValue('--x'), node.style.getPropertyValue('--y')]));
        const before = await positions();
        const labels = page.locator('.map-space-label');
        assert.ok(await labels.count() > 0 && await labels.count() <= 7, 'Bounded additional labels use the free field.');
        assert.ok(parseFloat(before.find(([id]) => id === 'garage')[2]) < 14, 'The upper group uses available headroom.');
        const intersections = await labels.evaluateAll(elements => elements.flatMap(label => {
          const rect = label.getBoundingClientRect();
          const outside = rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight;
          const overlaps = [...document.querySelectorAll('.map-controls,.display-control,.site-header,.control-console,.map-axis-label,.origin-marker__label,.map-space-label,.map-anchor-label,[data-map-nodes] button')]
            .filter(node => node !== label && node.dataset.mapId !== label.dataset.mapLabelId)
            .some(node => { const other = node.getBoundingClientRect(); return rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top; });
          return outside || overlaps ? [label.dataset.mapLabelId] : [];
        }));
        assert.deepEqual(intersections, [], 'Resting labels clear points, controls and each other.');
        await page.locator('[popovertarget="screen-controls"]:not([popovertargetaction])').click();
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
      for (const id of view === "time" ? ["garage", "private-practice"] : ["garage", "private-practice", "running", "youtube"]) {
        await page.locator(`[data-map-id="${id}"]`).focus();
        await page.waitForFunction(() => !document.querySelector('[data-relation-morphing]'));
        assert.ok(await page.locator('[data-map-links] .is-active-relation').count() > 0);
        assert.ok(await page.locator('[data-map-links] .is-active-relation').evaluateAll(paths =>
          paths.every(path => getComputedStyle(path).strokeDasharray === 'none')),
        'Active routes use a continuous line.');
        await check(id);
        await page.screenshot({ path: `${directory}/${engine}-${width}-${view}-${id}.png` });
      }
    }
    console.log(`PASS ${engine} ${width}: both map layouts, four relation families, no loops or disproportionate detours.`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done));
}
