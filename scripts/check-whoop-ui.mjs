import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium, webkit } from "playwright";
import { checkLiveSurface } from "./check-live-surface.mjs";

const { startStaticServer, whoopDayFixture } = createRequire(import.meta.url)("./browser-contracts.cjs");
const engine = process.argv[2] || "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const { server, origin } = await startStaticServer({ projectRoot: process.cwd() });
const browser = await ({ chromium, webkit })[engine].launch();
const directory = process.env.PORTFOLIO_UI_ARTIFACT_DIR || ".qa-artifacts/whoop";
mkdirSync(directory, { recursive: true });
const errors = [];
const assertThemeGeometry = async (page, selector) => {
  await page.evaluate(() => document.fonts.ready);
  for (const value of ['light', 'dark', 'system']) {
    await page.locator(`${selector} input[value="${value}"]`).check();
    await page.waitForFunction(selector => {
      const group = document.querySelector(selector), choice = group.querySelector('input:checked').parentElement;
      return Math.abs(parseFloat(getComputedStyle(group, '::before').width) - choice.getBoundingClientRect().width) < 1;
    }, selector);
    const state = await page.locator(selector).evaluate(group => {
      const frame = group.getBoundingClientRect(), style = getComputedStyle(group, '::before'), matrix = new DOMMatrixReadOnly(style.transform);
      const chosen = group.querySelector('input:checked').parentElement.getBoundingClientRect();
      return { chosen: chosen.toJSON(), indicator: { left: frame.left + group.clientLeft + parseFloat(style.left) + matrix.e,
        top: frame.top + group.clientTop + parseFloat(style.top) + matrix.f, width: parseFloat(style.width), height: parseFloat(style.height) },
        rows: getComputedStyle(group).gridTemplateColumns.split(' ').length === 1,
        fields: [...group.querySelectorAll('label')].map(label => {
          const rect = label.getBoundingClientRect(), text = document.createRange(); text.selectNodeContents(label.querySelector('span'));
          const ink = text.getBoundingClientRect(); return { width: rect.width, left: ink.left - rect.left, right: rect.right - ink.right };
        }) };
    });
    assert.ok(Math.abs(state.indicator.left - state.chosen.left) < 1 && Math.abs(state.indicator.top - state.chosen.top) < 1
      && Math.abs(state.indicator.height - state.chosen.height) < 1, JSON.stringify(state));
    const fields = state.fields.flatMap(field => state.rows ? [field.left] : [field.left, field.right]);
    assert.ok(Math.max(...fields) - Math.min(...fields) < 1, 'Theme names share equal side fields: ' + JSON.stringify(state));
    if (!state.rows) assert.ok(state.fields[0].width > state.fields[2].width, 'Content sets segment width, rather than three equal fractions.');
  }
};
try {
  for (const width of [1440, 320]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: width === 320 ? 568 : 900 },
      colorScheme: theme, reducedMotion: "reduce", isMobile: width === 320, hasTouch: width === 320 });
    page.on("pageerror", error => errors.push(error.message));
    const open = async () => {
      await page.goto(`${origin}/?scene=map`, { waitUntil: "load" });
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
      assert.ok(Math.abs(header.x - console.x - console.width - 40) < .1, "The author panel has a 40px gap from desktop navigation.");
      assert.ok(Math.abs(header.y - console.y) < 1, "The author column starts with the search row, rather than following its own bottom inset.");
    }
    await page.waitForFunction(() => [...document.querySelectorAll(".map-node:not([inert])")].every(node => {
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
      const grip = { x: before.x + before.width - 4, y: before.y + before.height - 4 };
      assert.equal(await page.evaluate(({x,y}) => Boolean(document.elementFromPoint(x,y)
        ?.closest('a,button,[data-console-text]')), grip), false, 'Drag starts on free card space.');
      await page.mouse.move(grip.x, grip.y);
      await page.mouse.down();
      await page.mouse.move(grip.x - 200, grip.y - 150, { steps: 8 });
      await page.mouse.up();
      const after = await card.boundingBox();
      const terrainAfter = await page.locator(".whoop-field").boundingBox();
      assert.ok(Math.abs((terrainAfter.x - terrainBefore.x) - (after.x - before.x)) < 1
        && Math.abs((terrainAfter.y - terrainBefore.y) - (after.y - before.y)) < 1,
        "Aura follows its owner while dragging.");
      assert.ok(Math.abs(after.x - before.x + 200) < 1 && Math.abs(after.y - before.y + 150) < 1,
        "The author card moves with its free surface.");
      const copy = await page.locator(".brand__name").boundingBox();
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
    assert.equal(await toggle.getAttribute("aria-checked"), "false");
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--day-enabled").trim()), "0");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("[data-settings-panel]").open, null, { timeout: 3000 });
    await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), width === 320 ? ".whoop-compact-trigger" : ".whoop-foot button", { timeout: 3000 });
    assert.equal(await page.evaluate(selector => document.activeElement === document.querySelector(selector), width === 320 ? ".whoop-compact-trigger" : ".whoop-foot button"), true,
      `Focus state ${JSON.stringify(await page.evaluate(() => ({ active: document.activeElement.outerHTML.slice(0,350), body:document.body.className, header: getComputedStyle(document.querySelector('.site-header')).visibility, inert:document.querySelector('.site-header').inert, preview:document.querySelector('.map-hover-preview').className, inspector:document.querySelector('[data-map-inspector]').className })))}`);
    await open();
    await page.waitForFunction(() => document.querySelector("[data-whoop-recovery]").textContent.includes("77"));
    assert.equal(await toggle.getAttribute("aria-checked"), "false", "Colour preference survives reload.");
    await trigger.click();
    await toggle.click();
    await page.keyboard.press("Escape");

    await page.route("**/__qa/whoop-day.json", async route => {
      // Serve the shared fixture directly; a reload must not interrupt a proxy request.
      const data = whoopDayFixture();
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
    await route.fulfill({ json: whoopDayFixture() });
  });
  await latePage.goto(`${origin}/?analytics-consent=show`, { waitUntil: "domcontentloaded" });
  await latePage.waitForFunction(() => document.activeElement?.matches("[data-analytics-toggle]"));
  deliver();
  await latePage.waitForFunction(() => document.querySelector("[data-whoop-recovery]").textContent.includes("77"));
  await latePage.waitForFunction(() => {
    const body = document.querySelector(".settings-panel__body").getBoundingClientRect();
    const action = document.querySelector("[data-analytics-toggle]").getBoundingClientRect();
    return action.top >= body.top && action.bottom <= body.bottom;
  });
  await latePage.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  await latePage.waitForFunction(() => {
    const body = document.querySelector(".settings-panel__body").getBoundingClientRect();
    const action = document.querySelector("[data-analytics-toggle]").getBoundingClientRect();
    return document.activeElement?.matches("[data-analytics-toggle]")
      && action.top >= body.top && action.bottom <= body.bottom;
  });
  assert.equal(await latePage.locator('#settings-panel').getAttribute('data-settings-mode'), null);
  assert.equal(await latePage.locator('.settings-panel__screen').isVisible(), true);
  await latePage.evaluate(() => { document.documentElement.style.fontSize = "16px"; });
  await latePage.locator('.settings-panel__analytics .settings-details > summary').click();
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
    const intro = document.querySelector('.spatial-intro').getBoundingClientRect();
    return document.body.classList.contains('has-focused-home')
      && intro.top >= header.bottom && camera.top >= intro.bottom;
  });
  await latePage.close();
  console.log(`PASS ${engine} delayed WHOOP: analytics stays visible; mobile map follows the card.`);
  for (const [width, fontSize] of [[1440, 16], [1024, 16], [320, 16], [320, 32]]) {
    const page = await browser.newPage({ viewport: { width, height: width === 320 ? 568 : 900 }, reducedMotion: "reduce" });
    await page.goto(`${origin}/?story=1`, { waitUntil: "load" });
    if (fontSize === 32) await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await page.locator("[data-constellation-nav-toggle]").click();
    await page.getByRole("button", { name: "НАСТРОЙКИ САЙТА", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.hasAttribute("data-close-settings"));
    const geometry = await page.evaluate(() => {
      const panel = document.querySelector("[data-settings-panel]");
      const body = panel.querySelector(".settings-panel__body");
      return {
        panel: panel.getBoundingClientRect().toJSON(),
        body: body.getBoundingClientRect().toJSON(),
        focus: document.activeElement.getBoundingClientRect().toJSON(),
        intro: panel.querySelector(".settings-panel__intro").getBoundingClientRect().toJSON(),
        scrollTop: body.scrollTop,
        headingFont: getComputedStyle(panel.querySelector("h2")).font,
        padding: getComputedStyle(panel).padding,
        privacyColumns: getComputedStyle(panel.querySelector(".settings-panel__privacy")).gridTemplateColumns,
        zoneColumns: getComputedStyle(panel.querySelector(".settings-whoop__zones")).gridTemplateColumns,
        storyOpacity: getComputedStyle(document.querySelector("#story-pane")).opacity,
        storyFilter: getComputedStyle(document.querySelector("#story-pane")).filter,
        mask: getComputedStyle(body).maskImage,
        overflow: document.documentElement.scrollWidth - innerWidth,
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    assert.ok(geometry.panel.width <= 540 && Math.abs(geometry.panel.left + geometry.panel.width / 2 - width / 2) < 1,
      "Settings stay compact and centered on the screen, independent of the map pane width.");
    assert.ok(geometry.panel.top >= 13 && geometry.panel.bottom <= geometry.viewport.height - 13);
    assert.equal(geometry.scrollTop, 0, "The general entry starts at the introduction, including at 200% text.");
    assert.ok(geometry.intro.top >= geometry.panel.top && geometry.body.height >= 150, "The title can scroll at large text without displacing the entire control viewport.");
    assert.ok(geometry.focus.top >= geometry.panel.top && geometry.focus.bottom <= geometry.panel.bottom);
    assert.equal(geometry.mask, "none", "A scroll mask must not fade settings controls or their focus rings.");
    assert.equal(geometry.overflow, 0);
    await page.screenshot({ path: `${directory}/${engine}-settings-split-${width}-${fontSize}.png` });
    // macOS WebKit's native Option-Tab visits all controls even when the host
    // keyboard preference limits Tab. Other engines/platforms use plain Tab.
    await page.keyboard.press(engine === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab");
    await page.waitForFunction(() => {
      const group = document.querySelector('#settings-panel .preference-choices');
      const body = group.closest('.settings-panel__body').getBoundingClientRect();
      const frame = group.getBoundingClientRect(), css = getComputedStyle(group);
      const ring = parseFloat(css.outlineWidth) + Math.max(0, parseFloat(css.outlineOffset));
      return frame.height + ring * 2 > body.height || (frame.top - ring >= body.top - .5 && frame.bottom + ring <= body.bottom + .5);
    });
    const themeFocus = await page.evaluate(() => {
      const body = document.querySelector(".settings-panel__body").getBoundingClientRect();
      const focus = document.activeElement.getBoundingClientRect();
      return {
        theme: document.activeElement.hasAttribute("data-theme-choice"),
        element: document.activeElement.outerHTML.slice(0, 240),
        focus: focus.toJSON(), body: body.toJSON(),
      };
    });
    assert.ok(themeFocus.theme && themeFocus.focus.top >= themeFocus.body.top && themeFocus.focus.bottom <= themeFocus.body.bottom,
      `Tab reaches the checked theme without clipping its focus ring at ${width}/${fontSize}: ${JSON.stringify(themeFocus)}`);
    await assertThemeGeometry(page, '#settings-panel .preference-choices');
    if (width === 320 && fontSize === 16) {
      // CI exposed shrink at a 246px reading width. Exercise it on hosts
      // with overlay scrollbars too, keeping the strict ink fields.
      await page.locator('.settings-panel__screen').evaluate(screen => { screen.style.maxWidth = '246px'; });
      await assertThemeGeometry(page, '#settings-panel .preference-choices');
      await page.locator('.settings-panel__screen').evaluate(screen => { screen.style.removeProperty('max-width'); });
    }
    if (fontSize === 32) {
      for (const selector of ["[data-motion-toggle]", "[data-contrast-toggle]"]) {
        const control = page.locator(`.settings-panel ${selector}`);
        await control.scrollIntoViewIfNeeded();
        const alignment = await control.evaluate(button => {
          const name = document.getElementById(button.getAttribute('aria-labelledby'));
          const glyph = button.querySelector('.preference-switch').getBoundingClientRect();
          return Math.abs(glyph.top + glyph.height / 2 - name.getBoundingClientRect().top - parseFloat(getComputedStyle(button).lineHeight) / 2);
        });
        assert.ok(alignment < 1, 'A multiline preference keeps its switch aligned to the first text line.');
      }
      await page.screenshot({ path: `${directory}/${engine}-settings-baselines-320-32.png` });
    }
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("[data-settings-panel]").open);
    if (width > 900) {
      assert.equal(geometry.storyOpacity, "0.16");
      assert.equal(geometry.storyFilter, "blur(3px)");
      assert.equal(await page.locator("#story-pane").evaluate(node => getComputedStyle(node).opacity), "1");
      assert.equal(await page.locator("#story-pane").evaluate(node => getComputedStyle(node).filter), "none");
      await page.locator("#story-bridge [data-close-story]").click();
      await page.locator('.site-header [data-open-settings]').click();
      const whole = await page.locator("[data-settings-panel]").evaluate(panel => ({
        headingFont: getComputedStyle(panel.querySelector("h2")).font,
        padding: getComputedStyle(panel).padding,
        privacyColumns: getComputedStyle(panel.querySelector(".settings-panel__privacy")).gridTemplateColumns,
        zoneColumns: getComputedStyle(panel.querySelector(".settings-whoop__zones")).gridTemplateColumns,
      }));
      assert.equal(whole.headingFont, geometry.headingFont, "A global dialog keeps its type role over either map layout.");
      assert.equal(whole.padding, geometry.padding, "A global dialog keeps its inner spacing over either map layout.");
      assert.equal(whole.privacyColumns, geometry.privacyColumns);
      assert.equal(whole.zoneColumns, geometry.zoneColumns);
      await page.screenshot({ path: `${directory}/${engine}-settings-whole-${width}-16.png` });
    }
    if (width === 1440) {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[data-settings-panel]').open);
      await page.locator('#screen-controls-trigger').click();
      await assertThemeGeometry(page, '#settings-panel .preference-choices');
      await page.locator('#settings-panel input[value="dark"]').check();
      await page.reload({ waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        window.themeFirstPaint = [];
        const sample = () => {
          const panel = document.querySelector('#settings-panel'), group = panel.querySelector('.preference-choices');
          const style = getComputedStyle(group, '::before');
          if (panel.open && style.visibility === 'visible' && +getComputedStyle(panel).opacity > .001) {
            const frame = group.getBoundingClientRect(), chosen = group.querySelector('input:checked').parentElement.getBoundingClientRect();
            const matrix = new DOMMatrixReadOnly(style.transform), scale = frame.width / group.offsetWidth;
            window.themeFirstPaint.push({ left: frame.left + (group.clientLeft + parseFloat(style.left) + matrix.e) * scale - chosen.left,
              width: parseFloat(style.width) * scale - chosen.width });
          }
          if (window.themeFirstPaint.length < 6) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.locator('#screen-controls-trigger').click();
      await page.waitForFunction(() => window.themeFirstPaint.length === 6);
      assert.ok(await page.evaluate(() => window.themeFirstPaint.every(frame => Math.abs(frame.left) < 1 && Math.abs(frame.width) < 1)),
        'A saved theme is correct from its first visible indicator frame: ' + JSON.stringify(await page.evaluate(() => window.themeFirstPaint)));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.id === 'screen-controls-trigger');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator('[data-command-input]').fill('приватность');
      await page.locator('.command-result').first().waitFor();
      await page.evaluate(() => {
        window.privacyEntryFrames = [];
        const sample = () => {
          const panel = document.querySelector('#settings-panel');
          if (panel.open) window.privacyEntryFrames.push({
            mode: panel.dataset.settingsMode,
            title: panel.querySelector('h2').textContent,
            controls: panel.querySelector('.settings-panel__screen').getClientRects().length,
            whoop: panel.querySelector('.settings-whoop').getClientRects().length,
            focus: document.activeElement.hasAttribute('data-analytics-toggle'),
          });
          if (window.privacyEntryFrames.length < 8) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.locator('[data-command-input]').press('Enter');
      await page.waitForFunction(() => window.privacyEntryFrames.length === 8);
      assert.ok(await page.evaluate(() => window.privacyEntryFrames.every(frame => frame.mode === undefined
        && frame.title === 'Настройки сайта' && frame.controls && frame.whoop && frame.focus)),
        'Privacy targets the analytics control in the same complete dialog from its first frame.');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.hasAttribute('data-command-input'));
      await page.locator('[data-command-input]').fill('настройки');
      await page.locator('.command-result').first().waitFor();
      await page.locator('[data-command-input]').press('Enter');
      assert.equal(await page.locator('#settings-panel').getAttribute('data-settings-mode'), null);
      assert.equal(await page.locator('#settings-panel h2').innerText(), 'Настройки сайта');
      assert.ok(await page.locator('.settings-panel__screen').isVisible());
      assert.ok(await page.locator('.settings-whoop').isVisible());

    }
    await page.close();
  }
  console.log(`PASS ${engine} settings: stable window, entry at top, keyboard theme focus and first-line switches at 200%.`);
  // Stable description geometry, immediate consent revocation and mixed input.
  const controlsPage = await browser.newPage({viewport: {width: 390, height: 844}, reducedMotion: 'no-preference'});
  await controlsPage.route('https://mc.yandex.ru/**', route => route.fulfill({contentType: 'text/javascript',
    body: 'window.__settingsMetricCalls=[...(window.ym?.a||[])].map(a=>Array.from(a));window.ym=(...a)=>window.__settingsMetricCalls.push(a);'}));
  await controlsPage.goto(origin);
  await controlsPage.evaluate(() => document.fonts.ready);
  await controlsPage.locator('[data-constellation-nav-toggle]').click();
  await controlsPage.locator('.constellation-nav [data-open-settings]').click();
  const motion = controlsPage.locator('[data-motion-toggle]');
  await motion.click();
  await controlsPage.waitForTimeout(180);
  await motion.focus();
  await controlsPage.keyboard.press('Space');
  assert.equal(await controlsPage.locator('html').getAttribute('data-focus-modality'), 'keyboard');
  assert.equal(await motion.locator('.preference-switch').evaluate(node => getComputedStyle(node, '::before').transitionDuration), '0s');
  const summary = controlsPage.locator('[data-whoop-details] > summary');
  await summary.click();
  await controlsPage.waitForTimeout(180);
  await summary.focus();
  await controlsPage.keyboard.press('Enter');
  assert.equal(await controlsPage.locator('[data-whoop-details]').evaluate(node => node.open), false);
  assert.equal(await summary.evaluate(node => getComputedStyle(node, '::after').transitionDuration), '0s');
  const analytics = controlsPage.locator('[data-analytics-toggle]');
  await analytics.scrollIntoViewIfNeeded();
  const unsetHeight = await analytics.boundingBox();
  await analytics.click();
  await controlsPage.waitForFunction(() => window.__settingsMetricCalls);
  const allowedHeight = await analytics.boundingBox();
  assert.equal(allowedHeight.height, unsetHeight.height, 'The three consent descriptions reserve one natural height.');
  const before = await controlsPage.evaluate(() => performance.timeOrigin);
  const revokedImmediately = await controlsPage.evaluate(() => new Promise(resolve => {
    const button = document.querySelector('[data-analytics-toggle]'); button.click();
    const result = {state: localStorage.getItem('anton-signal-analytics'), disabled: window.disableYaCounter111107350,
      destruct: window.__settingsMetricCalls.some(call => call[1] === 'destruct')};
    setTimeout(() => { button.click(); resolve(result); }, 40);
  }));
  assert.deepEqual(revokedImmediately, {state: 'denied', disabled: true, destruct: true});
  await controlsPage.waitForTimeout(220);
  assert.equal(await controlsPage.evaluate(() => performance.timeOrigin), before, 'A rapid explicit re-enable cancels the technical reload.');
  await analytics.click();
  await controlsPage.waitForFunction(earlier => performance.timeOrigin !== earlier, before);
  await controlsPage.waitForFunction(() => document.activeElement?.matches('[data-analytics-toggle]'));
  assert.equal(await controlsPage.locator('#settings-panel').evaluate(node => getComputedStyle(node).animationName), 'none', 'Technical return restores its context without an entrance animation.');
  assert.equal(await controlsPage.locator('[data-analytics-toggle]').getAttribute('aria-checked'), 'false');
  assert.equal(await controlsPage.locator('[data-analytics-toggle]').evaluate(button => button.getBoundingClientRect().height), unsetHeight.height);
  assert.equal(await controlsPage.locator('[data-analytics-state-copy][aria-hidden="false"]').count(), 1);
  await controlsPage.close();
  console.log(`PASS ${engine} settings: mixed keyboard input, stable consent copy and immediate stop with rapid reversal.`);
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
