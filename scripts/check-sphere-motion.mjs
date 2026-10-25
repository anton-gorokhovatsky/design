#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, webkit } = require("playwright");
const { startStaticServer, chromiumScenarioCatalog } = require("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { server, origin } = await startStaticServer({ projectRoot });
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR;
if (directory) mkdirSync(directory, { recursive: true });
const ids = ["optimal", "ilmix", "youtube", "parfenov"];
const scenarios = chromiumScenarioCatalog.filter((state) => (
  /^(desktop-(light|dark)|tablet-(light|dark)|mobile-(390|320)-(light|dark)|zoom-200-light)$/.test(state.label)
));
const errors = [];
let browser;
const read = (page) => page.evaluate(() => Array.from(
  document.querySelectorAll(".map-node__surface"), (surface) => {
    const glyph = surface.parentElement;
    const button = surface.closest("[data-map-id]");
    const style = getComputedStyle(glyph);
    const pixels = surface.getContext("2d").getImageData(0, 0, surface.width, surface.height).data;
    let signature = 2166136261;
    let painted = 0;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      signature = Math.imul(signature ^ (pixels[offset] | (pixels[offset - 3] << 8)), 16777619) >>> 0;
      if (pixels[offset]) painted += 1;
    }
    return {
      id: button.dataset.mapId, hidden: glyph.getAttribute("aria-hidden"),
      interactiveChildren: glyph.querySelectorAll("button,a,input,[tabindex]").length,
      x: button.style.getPropertyValue("--x"), y: button.style.getPropertyValue("--y"),
      box: glyph.getBoundingClientRect().toJSON(), transform: style.transform,
      background: style.backgroundImage, shadow: style.boxShadow,
      display: getComputedStyle(surface).display,
      pointerEvents: getComputedStyle(surface).pointerEvents,
      skin: signature, painted, motion: surface.dataset.sphereMotion,
      corners: [pixels[3], pixels[surface.width * 4 - 1], pixels[pixels.length - 1]],
      animations: surface.getAnimations({ subtree: true }).map((animation) => ({
        name: animation.animationName, state: animation.playState,
        time: animation.currentTime, duration: animation.effect.getComputedTiming().duration,
      })),
    };
  },
));
const capture = async (page, name) => {
  if (!directory) return;
  await page.screenshot({ path: join(directory, engine + "-sphere-" + name + ".jpg"), quality: 85 });
  if (name.startsWith("desktop")) {
    for (const id of ids) {
      const glyph = page.locator('[data-map-id="' + id + '"] .map-node__glyph');
      await glyph.screenshot({ path: join(directory, engine + "-sphere-crop-" + id + "-" + name + ".jpg"), quality: 95 });
    }
  }
};
const readCelestial = page => page.evaluate(() => [...document.querySelectorAll('.celestial-volume')].map(canvas => {
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let signature = 2166136261, painted = 0;
  for (let i = 3; i < pixels.length; i += 16) {
    signature = Math.imul(signature ^ pixels[i] ^ pixels[i - 3], 16777619) >>> 0;
    if (pixels[i]) painted++;
  }
  return { id: canvas.closest('[data-map-id]').dataset.mapId, signature, painted,
    hidden: canvas.getAttribute('aria-hidden'), pointer: getComputedStyle(canvas).pointerEvents,
    time: canvas.dataset.renderTime, period: canvas.dataset.rotationPeriod };
}));
const assertStopped = async (page) => {
  await page.waitForFunction(() => [...document.querySelectorAll(".map-node__surface")]
    .every((surface) => getComputedStyle(surface).display === "none"
      && surface.dataset.sphereMotion === "paused"));
  const before = await read(page);
  const bodiesBefore = await readCelestial(page);
  await page.waitForTimeout(160);
  assert.deepEqual(await readCelestial(page), bodiesBefore, 'Celestial bodies stop with reduced motion or forced colours');
  const after = await read(page);
  for (const [index, state] of after.entries()) {
    assert.equal(state.display, "none", state.id);
    assert.equal(state.motion, "paused", state.id);
    assert.equal(state.skin, before[index].skin, state.id + ": no hidden rendering");
  }
};

// Headless engines need a deterministic lifecycle contract; actual cached navigation
// is additionally checked in a headed browser before publishing a lifecycle change.
const assertPageRestoration = async (page) => {
  const inventory = () => page.evaluate(() => ({
    ids: [...document.querySelectorAll('.map-node')].map(node => node.dataset.mapId).sort(),
    satellites: document.querySelectorAll('.project-satellites .project-satellite').length,
    volumes: document.querySelectorAll('.celestial-volume').length,
    layers: document.querySelectorAll('.project-satellites').length,
  }));
  const before = await inventory();
  assert.equal(before.ids.length, 53, 'All map objects exist before leaving');
  assert.equal(new Set(before.ids).size, 53, 'Map objects have unique identities');
  assert.equal(before.satellites, 10, 'All private projects exist before leaving');
  for (let cycle = 0; cycle < 2; cycle++) {
    const bodies = await readCelestial(page);
    const orbitTime = await page.locator('.practice-orbits-canvas').getAttribute('data-orbit-time');
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    assert.deepEqual(await inventory(), before, 'Leaving retains the complete map document');
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await page.waitForFunction(previous => {
      const orbit = document.querySelector('.practice-orbits-canvas');
      return orbit.dataset.orbitTime !== previous.orbitTime
        && [...document.querySelectorAll('.celestial-volume')]
          .every((canvas, index) => canvas.dataset.renderTime !== previous.times[index]);
    }, { orbitTime, times: bodies.map(body => body.time) });
    assert.deepEqual(await inventory(), before, 'Returning preserves objects without duplicate layers');
  }
  // A cached return must retain the observers, including offscreen pause/resume.
  const volume = page.locator('.celestial-volume--garage');
  // IntersectionObserver delivery follows rendering, not a wall-clock deadline.
  // Start the pause measurement after the browser has reported the exit.
  await volume.evaluate(canvas => new Promise(resolve => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) return;
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    observer.observe(canvas);
    canvas.style.transform = 'translateX(300vw)';
  }));
  const hiddenTime = await volume.getAttribute('data-render-time');
  await page.waitForTimeout(160);
  assert.equal(await volume.getAttribute('data-render-time'), hiddenTime, 'Restored body pauses offscreen');
  await volume.evaluate(canvas => { canvas.style.transform = ''; });
  await page.waitForFunction(previous => document.querySelector('.celestial-volume--garage')
    .dataset.renderTime !== previous, hiddenTime);
};

// Exercise the production sampler at identical phases, without debug APIs on the site.
const assertMaterials = () => {
  const source = readFileSync(join(projectRoot, "js/sphere-surfaces.js"), "utf8")
    .replace(/^import .*;\n/m, "").replace("export const createSphereSurface", "const createSphereSurface");
  const render = runInNewContext(source + [
    "(id, turn) => {",
    "const image = { data: new Uint8ClampedArray(resolution * resolution * 4) };",
    "const surface = { id, turn, image, context: { putImageData() {} } };",
    "prepareMaterial(surface); paint(surface); return image.data; };",
  ].join("\n"), {
    reducedMotion: { matches: false, addEventListener() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: { querySelector: () => null, addEventListener() {},
      documentElement: { hasAttribute: () => false } },
    window: { addEventListener() {} }, IntersectionObserver: class { observe() {} },
    MutationObserver: class { observe() {} },
    cancelAnimationFrame() {}, requestAnimationFrame() {},
  });
  const signatures = new Set();
  const signed = (data, x, y) => data[(y * 160 + x) * 4 + 3]
    * (data[(y * 160 + x) * 4] ? 1 : -1);
  for (const id of ids) {
    const first = render(id, 0.2), next = render(id, 0.21);
    signatures.add(createHash("sha256").update(first).digest("hex"));
    assert.equal(Buffer.compare(Buffer.from(first), Buffer.from(render(id, 0.2))), 0, id + ": deterministic material");
    assert.equal(Buffer.compare(Buffer.from(render(id, 0)), Buffer.from(render(id, 1))), 0, id + ": seamless full turn");
    const error = (direction) => {
      let total = 0;
      const angle = 0.01 * Math.PI * 2 * direction;
      for (let y = 40; y < 120; y += 1) for (let x = 40; x < 120; x += 1) {
        const nx = (x + 0.5) / 80 - 1, ny = (y + 0.5) / 80 - 1;
        const z = Math.sqrt(1 - nx * nx - ny * ny);
        const moved = Math.round((nx * Math.cos(angle) + z * Math.sin(angle) + 1) * 80 - 0.5);
        total += (signed(first, x, y) - signed(next, moved, y)) ** 2;
      }
      return total;
    };
    assert.ok(error(1) < error(-1) * 0.1, id + ": surface features move right");
  }
  assert.equal(signatures.size, ids.length, "Distinct textures, even at the same phase");
  console.log("PASS " + engine + " sphere materials: unique, deterministic, seamless, rightward");
};

try {
  assertMaterials();
  browser = await ({ chromium, webkit })[engine].launch({ headless: true });
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height },
      colorScheme: scenario.theme, reducedMotion: "no-preference", hasTouch: scenario.mobile,
      isMobile: scenario.mobile, deviceScaleFactor: scenario.deviceScaleFactor || 1 });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/?scene=map", { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(count => document.querySelectorAll(".map-node__surface").length === count, ids.length);
    // Mobile framing follows fonts.ready through two scheduled layout passes.
    // Measure axial motion only after that existing entrance has settled.
    await page.evaluate(async () => {
      await new Promise((done) => {
        let frames = 0;
        const next = () => ++frames === 4 ? done() : requestAnimationFrame(next);
        requestAnimationFrame(next);
      });
      const entrance = document.querySelector(".practice-map").getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity
          && animation.playState === "running");
      await Promise.all(entrance.map((animation) => animation.finished.catch(() => {})));
    });
    await page.waitForFunction(() => [...document.querySelectorAll(".map-node__surface")]
      .some((canvas) => canvas.dataset.sphereMotion === "running"
        && canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data
          .some((value, index) => index % 4 === 3 && value > 0)));
    // The geodesic table is prepared asynchronously; assert the real painted
    // surface, not a fixed delay or a renderer-ready flag.
    await page.waitForFunction(() => [...document.querySelectorAll('.celestial-volume')]
      .every(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        .some((value, index) => index % 4 === 3 && value > 0)));
    const bodiesBefore = await readCelestial(page);
    assert.deepEqual(bodiesBefore.map(body => body.id), ['garage', 'running']);
    for (const body of bodiesBefore) {
      assert.equal(body.hidden, 'true');
      assert.equal(body.pointer, 'none');
      assert.ok(body.painted > 0, body.id + ': painted volume');
    }
    assert.equal(bodiesBefore[1].period, '8');
    const before = await read(page);
    assert.deepEqual(before.map((state) => state.id), ids);
    for (const state of before) {
      assert.equal(state.hidden, "true");
      assert.equal(state.interactiveChildren, 0);
      assert.equal(state.pointerEvents, "none");
      assert.equal(state.animations.length, 0, state.id + ": no flat rotating patches");
      assert.deepEqual(state.corners, [0, 0, 0], state.id + ": spherical silhouette");
      if (state.motion === "running") assert.ok(state.painted > 0, state.id);
    }
    await page.waitForTimeout(350);
    const after = await read(page);
    const bodiesAfter = await readCelestial(page);
    bodiesAfter.forEach((body, index) => assert.notEqual(body.signature, bodiesBefore[index].signature,
      body.id + ': emitted light changes with motion'));
    after.forEach((state, index) => {
      const previous = before[index];
      if (state.motion === "running" && previous.motion === "running") {
        assert.notEqual(state.skin, previous.skin, state.id + ": rendered surface really turns");
      }
      for (const property of ["x", "y", "transform", "background", "shadow"]) {
        assert.equal(state[property], previous[property], state.id + ": fixed " + property);
      }
      for (const property of ["x", "y", "width", "height"]) {
        assert.ok(Math.abs(state.box[property] - previous.box[property]) < 0.1,
          state.id + ": no orbital or silhouette motion");
      }
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await capture(page, scenario.label);
    if (scenario.label.startsWith("desktop")) {
      await page.locator('#screen-controls-trigger').click();
      const toggle = page.locator("#settings-panel [data-motion-toggle]");
      await toggle.click();
      await assertStopped(page);
      await capture(page, scenario.label + "-motion-off");
      await toggle.click();
      await page.waitForFunction(() => document.documentElement.dataset.reduceMotion !== "true");
      await page.waitForFunction(() => document.querySelector(".map-node__surface")?.dataset.sphereMotion === "running");
      await page.keyboard.press("Escape");
      const surface = page.locator('[data-map-id="optimal"] .map-node__surface');
      await surface.evaluate((canvas) => { canvas.style.transform = "translateX(300vw)"; });
      await page.waitForFunction(() => document.querySelector(".map-node__surface")?.dataset.sphereMotion === "paused");
      const offscreen = (await read(page))[0];
      await page.waitForTimeout(160);
      assert.equal((await read(page))[0].skin, offscreen.skin, "offscreen material pauses");
      await surface.evaluate((canvas) => { canvas.style.transform = ""; });
      await page.waitForFunction(() => document.querySelector(".map-node__surface")?.dataset.sphereMotion === "running");
      await page.locator('[data-map-filter="project"]:visible').first().click();
      await page.waitForFunction(() => [...document.querySelectorAll(".map-node__surface")]
        .every((canvas) => canvas.dataset.sphereMotion === "paused"));
      const filtered = await read(page);
      await page.waitForTimeout(160);
      assert.deepEqual((await read(page)).map((state) => state.skin), filtered.map((state) => state.skin));
      await page.locator('[data-map-filter="all"]:visible').first().click();
      await page.locator('[data-map-id="garage"]').focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator('[data-map-id="garage"]').getAttribute("aria-expanded"), "true");
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-celestial-paused'));
      await page.waitForFunction(() => document.querySelector('.project-satellites').inert);
      assert.deepEqual(await page.locator('.map-camera, .project-satellites').evaluateAll(layers =>
        layers.map(layer => getComputedStyle(layer).opacity)), ['1', '0.4'],
      'Reading keeps the map contrast and the existing disabled state of satellites');
      assert.equal(await page.locator('.project-satellites').evaluate(layer =>
        layer.inert && getComputedStyle(layer).pointerEvents === 'none'), true,
      'Satellites remain unavailable behind the reading window');
      const paused = await readCelestial(page);
      await page.waitForTimeout(160);
      assert.deepEqual(await readCelestial(page), paused, 'Bodies pause while reading');
      await page.keyboard.press("Escape");
      await page.waitForFunction(previous => document.querySelector('.celestial-volume--running').dataset.renderTime !== previous, paused[1].time);
    }
    if (scenario.label.startsWith("mobile-390")) {
      await page.locator('[data-open-panel="work"]:visible').last().click();
      await page.waitForFunction(() => document.querySelector(".map-camera").inert
        && document.documentElement.hasAttribute("data-celestial-paused")
        && getComputedStyle(document.querySelector(".map-camera")).opacity === "0.4");
      assert.deepEqual(await page.evaluate(() => ({
        home: getComputedStyle(document.querySelector(".focused-home")).visibility,
        input: document.querySelector(".focused-home").inert,
        labels: getComputedStyle(document.querySelector(".map-labels")).visibility,
        opacity: getComputedStyle(document.querySelector(".map-camera")).opacity,
      })), { home: "visible", input: true, labels: "hidden", opacity: "0.4" });
      const frozen = await page.locator(".focused-home canvas").evaluateAll(canvases => canvases.map(canvas => canvas.toDataURL()));
      await page.waitForTimeout(160);
      assert.deepEqual(await page.locator(".focused-home canvas").evaluateAll(canvases => canvases.map(canvas => canvas.toDataURL())), frozen,
        "Mobile glass retains the stationary, unavailable map background");
      await page.locator("[data-close-panel]").click();
      await page.waitForFunction(() => !document.querySelector(".map-camera").inert);
    }
    if (['desktop-light', 'mobile-390-light'].includes(scenario.label)) await assertPageRestoration(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await assertStopped(page);
    if (scenario.label === 'mobile-390-light') {
      await page.evaluate(() => {
        dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await assertStopped(page);
    }
    await capture(page, scenario.label + "-system-static");
    if (engine === "chromium") {
      await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
      await assertStopped(page);
    }
    console.log("PASS " + engine + " sphere motion " + scenario.label);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
