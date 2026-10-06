import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";
import { checkLiveSurface } from "./check-live-surface.mjs";

const { startStaticServer } = createRequire(import.meta.url)("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const { server, origin } = await startStaticServer({ projectRoot: process.cwd() });
const browser = await ({ chromium, webkit })[engine].launch();
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || ".qa-artifacts/whoop";
mkdirSync(directory, { recursive: true });
const errors = [];
try {
  for (const width of [1440, 320]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: width === 320 ? 568 : 900 },
      colorScheme: theme, reducedMotion: "reduce", isMobile: width === 320, hasTouch: width === 320 });
    page.on("pageerror", error => errors.push(error.message));
    const open = async () => {
      await page.goto(origin, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
    };
    await open();
    await page.waitForFunction(() => document.querySelector("[data-whoop-recovery]").textContent.includes("77"));
    const values = await page.locator(".whoop-metrics").innerText();
    assert.match(values, /77/);
    assert.match(values, /Высокое/);
    assert.match(values, /02/);
    assert.match(values, /12,9/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--day-enabled").trim()), "1");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    if (width > 900) {
      const header = await page.locator(".site-header").boundingBox();
      const console = await page.locator(".control-console").boundingBox();
      assert.ok(Math.abs(header.x - console.x - console.width - 16) < .1, "One gap separates the bottom panels.");
      assert.equal(header.y + header.height, console.y + console.height, "Bottom panels share a baseline.");
    }
    await page.waitForFunction(() => [...document.querySelectorAll(".map-node")].every(node => {
      const r = node.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest(".map-node") === node;
    }), null, { timeout: 6000 });
    if (width === 320) {
      assert.ok((await page.locator("[data-whoop-readout]").boundingBox()).height < 112,
        "The always-visible day line stays secondary to the author.");
    }
    const metricSizes = await page.locator(".whoop-metrics dd").evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
    assert.ok(metricSizes.every(size => size <= 14), "Day metrics use the small utility role, not dashboard numbers.");
    await page.screenshot({ path: `${directory}/${engine}-${width}-${theme}.png` });
    await page.locator(".site-header").screenshot({ path: `${directory}/${engine}-${width}-${theme}-readout.png` });
    if (width > 900) {
      const card = page.locator(".site-header"), before = await card.boundingBox();
      const terrainBefore = await page.locator(".whoop-field").boundingBox();
      assert.ok(terrainBefore.width < before.width + 220 && terrainBefore.height < before.height + 200,
        "Recovery terrain stays local to its card.");
      await page.mouse.move(before.x + before.width / 2, before.y + 8);
      await page.mouse.down();
      await page.mouse.move(before.x + before.width / 2 - 200, before.y - 142, { steps: 8 });
      await page.mouse.up();
      const after = await card.boundingBox();
      const terrainAfter = await page.locator(".whoop-field").boundingBox();
      assert.ok(Math.abs((terrainAfter.x - terrainBefore.x) - (after.x - before.x)) < 1
        && Math.abs((terrainAfter.y - terrainBefore.y) - (after.y - before.y)) < 1,
        "Aura follows its owner while dragging.");
      assert.ok(Math.abs(after.x - before.x + 200) < 1 && Math.abs(after.y - before.y + 150) < 1,
        "The author card moves with its free surface.");
      const copy = await page.locator(".brand__role").boundingBox();
      await page.mouse.move(copy.x + 2, copy.y + 6);
      await page.mouse.down();
      await page.mouse.move(copy.x + 100, copy.y + 6, { steps: 8 });
      await page.mouse.up();
      assert.ok((await page.evaluate(() => getSelection().toString())).length > 0, "Author copy remains selectable.");
      assert.deepEqual(await card.boundingBox(), after, "Selecting text does not drag the card.");
      await page.screenshot({ path: `${directory}/${engine}-${theme}-author-moved.png` });
      await page.setViewportSize({ width: 320, height: 568 });
      await page.waitForFunction(() => document.querySelector('.site-header').dataset.dragX === '0.00', null, { timeout: 2000 });
      assert.equal(await card.getAttribute("data-drag-x"), "0.00", "Mobile resets desktop offsets.");
      assert.ok(Math.abs((await card.boundingBox()).x - 12) < 1);
      await page.setViewportSize({ width, height: 900 });
    }
    const trigger = page.locator(width === 320 ? ".whoop-compact-trigger" : ".whoop-foot button");
    await trigger.click();
    await page.waitForFunction(() => document.activeElement === document.querySelector("[data-whoop-toggle]"));
    assert.equal(await page.locator(".whoop-field").evaluate(node => getComputedStyle(node).visibility), "visible",
      "Settings preserve the author card and its terrain together.");
    const toggle = page.locator("[data-whoop-toggle]");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--day-enabled").trim()), "0");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("[data-settings-panel]").open, null, { timeout: 3000 });
    await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), width === 320 ? ".whoop-compact-trigger" : ".whoop-foot button", { timeout: 3000 });
    assert.equal(await page.evaluate(selector => document.activeElement === document.querySelector(selector), width === 320 ? ".whoop-compact-trigger" : ".whoop-foot button"), true,
      `Focus state ${JSON.stringify(await page.evaluate(() => ({ active: document.activeElement.outerHTML.slice(0,350), body:document.body.className, header: getComputedStyle(document.querySelector('.site-header')).visibility, inert:document.querySelector('.site-header').inert, preview:document.querySelector('.map-hover-preview').className, inspector:document.querySelector('[data-map-inspector]').className })))}`);
    await open();
    await page.waitForFunction(() => document.querySelector("[data-whoop-recovery]").textContent.includes("77"));
    assert.equal(await toggle.getAttribute("aria-pressed"), "false", "Colour preference survives reload.");
    await trigger.click();
    await toggle.click();
    await page.keyboard.press("Escape");

    await page.route("**/__qa/whoop-day.json", async route => {
      const data = await (await route.fetch()).json();
      data.fetched_at = new Date(Date.now() - 3 * 3600000).toISOString();
      await route.fulfill({ json: data });
    });
    await open();
    await page.waitForFunction(() => document.querySelector("[data-whoop-readout]").dataset.stale === "true");
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--day-enabled").trim()), "0");
    await page.screenshot({ path: `${directory}/${engine}-${width}-${theme}-stale.png` });
    await page.unroute("**/__qa/whoop-day.json");
    await page.route("**/__qa/whoop-day.json", route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
    await open();
    await page.waitForFunction(() => document.querySelector("[data-whoop-status]").textContent.includes("недоступен"));
    assert.equal(await page.locator("[data-whoop-recovery]").innerText(), "—");
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--day-enabled").trim()), "0");
    console.log(`PASS ${engine} WHOOP ${width} ${theme}: metrics, map targets, settings, preference, stale and unavailable.`);
    await page.close();
  }
  const latePage = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: "reduce" });
  let deliver;
  const pendingFeed = new Promise(done => { deliver = done; });
  await latePage.route("**/__qa/whoop-day.json", async route => {
    await pendingFeed;
    await route.fulfill({ response: await route.fetch() });
  });
  await latePage.goto(`${origin}/?analytics-consent=show`, { waitUntil: "domcontentloaded" });
  await latePage.waitForFunction(() => document.activeElement?.matches("[data-analytics-allow]"));
  deliver();
  await latePage.waitForFunction(() => document.querySelector("[data-whoop-recovery]").textContent.includes("77"));
  await latePage.waitForFunction(() => {
    const body = document.querySelector(".settings-panel__body").getBoundingClientRect();
    const action = document.querySelector("[data-analytics-allow]").getBoundingClientRect();
    return action.top >= body.top && action.bottom <= body.bottom;
  });
  await latePage.locator('.settings-panel__details').scrollIntoViewIfNeeded();
  assert.equal(await latePage.locator('.settings-panel__details').evaluate(tail => {
    const body = tail.closest('.settings-panel__body').getBoundingClientRect();
    const rect = tail.getBoundingClientRect();
    return rect.top >= body.top - 1 && rect.bottom <= body.bottom + 1;
  }), true, 'The privacy link remains reachable after the feed arrives.');
  await latePage.keyboard.press("Escape");
  await latePage.waitForFunction(() => {
    const header = document.querySelector(".site-header").getBoundingClientRect();
    const camera = document.querySelector(".map-camera").getBoundingClientRect();
    return Math.abs(camera.top - header.bottom - 14) < 1;
  });
  await latePage.close();
  console.log(`PASS ${engine} delayed WHOOP: analytics stays visible; mobile map follows the card.`);
  assert.deepEqual(errors, []);
  // Separate ephemeral visit records from the preceding reload/error scenarios.
  const surface = await startStaticServer({ projectRoot: process.cwd() });
  try { await checkLiveSurface(browser, surface.origin, engine); }
  finally { surface.server.closeAllConnections(); await new Promise(done => surface.server.close(done)); }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
