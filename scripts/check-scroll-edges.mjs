import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { startStaticServer, waitForSurfaceRest, declineAnalyticsNotice } = require('./browser-contracts.cjs');
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const engine = process.argv[2] || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const local = process.env.PORTFOLIO_SCROLL_ORIGIN ? null : await startStaticServer({ projectRoot: root, presence: false });
const origin = process.env.PORTFOLIO_SCROLL_ORIGIN || local.origin;
const dir = (process.env.PORTFOLIO_UI_ARTIFACT_DIR || root + '/.qa-artifacts/scroll-edges') + '/';
mkdirSync(dir, { recursive: true });
const browser = await ({ chromium, webkit })[engine].launch();
const report = [];
const retired = 'filter[id^="scroll-ink"],.scroll-lens-video,.scroll-lens-frost,[data-scroll-lens-frame]';
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const profiles = engine === 'webkit'
  ? [['mobile', 390, 844, 'light'], ['compact', 320, 568, 'dark']]
  : [['desktop', 1440, 900, 'light'], ['split', 1100, 720, 'dark']];

// Test the reading surfaces, not the independent authored gravity illustration.
// An icon's mask is intentional; gradients on real prose and scrollports are not.
const nativeState = async (page, selector) => page.locator(selector).evaluate((region, retired) => {
  const css = getComputedStyle(region);
  const candidates = [region, ...region.querySelectorAll('h1,h2,h3,h4,p,summary,dt,dd,figcaption,video,iframe,[data-personal-media-poster]')];
  return {
    generated: document.querySelectorAll(retired).length,
    filter: css.filter, mask: css.maskImage, webkitMask: css.webkitMaskImage || 'none',
    faded: candidates.filter(e => /gradient|scroll-ink/.test(getComputedStyle(e).maskImage + (getComputedStyle(e).webkitMaskImage || '') + getComputedStyle(e).filter)).map(e => e.tagName + '.' + e.className),
    top: region.scrollTop, max: Math.max(0, region.scrollHeight - region.clientHeight),
    overflowX: region.scrollWidth - region.clientWidth,
    overflowY: css.overflowY,
    rect: region.getBoundingClientRect().toJSON(),
  };
}, retired);
const assertNative = async (page, selector, label) => {
  const state = await nativeState(page, selector);
  assert.equal(state.generated, 0, label + ': no generated edge filters, frame, canvas or frost');
  assert.equal(state.filter, 'none', label + ': the scrollport paints natively');
  assert.equal(state.mask, 'none', label + ': no text fade mask');
  assert.equal(state.webkitMask, 'none', label + ': no prefixed text fade mask');
  assert.deepEqual(state.faded, [], label + ': real text and media have no scroll fade');
  assert.ok(['auto', 'scroll'].includes(state.overflowY), label + ': native overflow owns scrolling');
  assert.ok(state.overflowX <= 1, label + ': reading needs no horizontal scroll');
  return state;
};
const goto = async (page, path) => {
  const response = await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
  if (response) assert.equal(response.status(), 200);
  else assert.equal(new URL(page.url()).origin, origin, 'A hash-only navigation stays in the served document');
  await page.evaluate(() => document.fonts.ready);
};
const readyCase = async page => {
  await page.waitForFunction(() => document.querySelector('.case-scroll')?.clientHeight > 0
    && document.querySelector('[data-case-load-state]')?.hidden);
  await waitForSurfaceRest(page, ['[data-map-inspector]', '.case-sheet', '.case-scroll']);
};
const inputScroll = async (page, selector, amount) => {
  await page.locator(selector).evaluate((s, amount) => s.scrollBy({top: amount, behavior: 'smooth'}), amount);
  await settle(page);
};
const assertRect = (actual, expected, message) => {
  assert.ok(['x','y','width','height'].every(key => Math.abs(actual[key] - expected[key]) < .5), message + ': ' + JSON.stringify({actual,expected}));
};
const exerciseScroll = async (page, selector, lastSelector, mobile, label) => {
  const region = page.locator(selector);
  await waitForSurfaceRest(page, [selector]);
  const samples = [];
  await region.evaluate(s => {
    s.scrollTop = 0;
    s.__qaParent = s.parentElement; s.__qaInert = s.inert;
    s.__qaStableNodes = [...s.querySelectorAll('p,a,button,video,iframe,[data-personal-media-poster]')].map(node => [node, node.parentElement]);
  });
  await settle(page);
  const top = await assertNative(page, selector, label + ' top');
  if (selector === '#story-pane') await page.screenshot({path:dir + engine + '-' + label + '-top.png'});
  if (top.max > 2) {
    await inputScroll(page, selector, Math.min(240, top.max), mobile);
    await page.waitForFunction(({selector, threshold}) => document.querySelector(selector).scrollTop >= threshold, {selector, threshold: Math.min(100, top.max / 2)});
    const middle = await assertNative(page, selector, label + ' down');
    assertRect(middle.rect, top.rect, label + ': moving content preserves reader geometry');
    samples.push({phase:'down',top:middle.top});
    if (selector === '#story-pane') await page.screenshot({path:dir + engine + '-' + label + '-moving-down.png'});
    const beforeReverse = await region.evaluate(s=>s.scrollTop);
    await inputScroll(page, selector, -Math.min(200, beforeReverse), mobile);
    await page.waitForFunction(({selector, previous}) => document.querySelector(selector).scrollTop < previous, {selector, previous: beforeReverse});
    const reversed = await assertNative(page, selector, label + ' reverse');
    assertRect(reversed.rect, top.rect, label + ': direction changes preserve reader geometry');
    samples.push({phase:'reverse',from:beforeReverse,top:reversed.top});
    if (selector === '#story-pane') await page.screenshot({path:dir + engine + '-' + label + '-moving-reverse.png'});
    await region.evaluate(s => { delete s.__qaScrollRest; });
    await page.waitForFunction(selector => {
      const s=document.querySelector(selector),previous=s.__qaScrollRest;
      const since=previous?.top===s.scrollTop?previous.since:performance.now();
      s.__qaScrollRest={top:s.scrollTop,since};return performance.now()-since>=120;
    },selector,{polling:40});
    await region.evaluate(s => s.scrollTo({top:s.scrollHeight,behavior:'instant'}));
    await page.waitForFunction(selector=>{const s=document.querySelector(selector);return Math.abs(s.scrollHeight-s.clientHeight-s.scrollTop)<=2;},selector);
    await settle(page);
    const bottom = await assertNative(page, selector, label + ' bottom');
    assert.ok(Math.abs(bottom.max - bottom.top) <= 2, label + ': native bottom is reachable');
    assertRect(bottom.rect, top.rect, label + ': scrolling preserves the outer geometry');
  }
  const last = await page.locator(lastSelector).last().boundingBox(), port = await region.boundingBox();
  assert.ok(last && last.y + last.height <= port.y + port.height + 2 && last.y + last.height > port.y,
    label + ': the final item is visible inside the reading edge');
  assert.equal(await region.evaluate(s => s.parentElement === s.__qaParent && s.inert === s.__qaInert
    && s.__qaStableNodes.every(([node, parent]) => node.isConnected && node.parentElement === parent)), true,
  label + ': scrolling never reparents the reader or its existing content');
  await page.screenshot({path: dir + engine + '-' + label + '-bottom.png'});
  await region.evaluate(s => s.scrollTop = 0);
  await settle(page);
  assert.equal((await assertNative(page, selector, label + ' return')).top, 0, label + ': top is reachable after reversal');
  return {max: top.max, samples, input: 'native smooth scroll with reversal; automation is not a physical touch gesture'};
};
const selectionAndFocus = async (page, regionSelector, textSelector, linkSelector) => {
  const text = page.locator(textSelector + ':visible').first();
  await text.scrollIntoViewIfNeeded();
  const selected = await text.evaluate(e => {
    const selection = getSelection(), range = document.createRange();
    selection.removeAllRanges(); range.selectNodeContents(e); selection.addRange(range);
    return selection.toString();
  });
  assert.ok(selected.trim().length > 4, 'A real reading passage is selected');
  const selectedState = await assertNative(page, regionSelector, 'selected text');
  await page.locator(regionSelector).evaluate(s => s.scrollBy(0, s.scrollTop > 60 ? -60 : 60));
  await settle(page);
  assertRect((await assertNative(page, regionSelector, 'selected text after scroll')).rect, selectedState.rect, 'Selection and scrolling preserve reader geometry');
  assert.equal(await page.evaluate(() => getSelection().toString()), selected, 'Selection survives the native paint checkpoint');
  await page.evaluate(() => getSelection().removeAllRanges());
  const link = page.locator(linkSelector + ':visible').first();
  await link.scrollIntoViewIfNeeded();
  await link.focus();
  const tab = engine === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  await page.keyboard.press('Shift+' + tab);
  await page.keyboard.press(tab);
  assert.equal(await link.evaluate(e => e === document.activeElement && e.matches(':focus-visible')
    && getComputedStyle(e).outlineStyle !== 'none'), true, 'Keyboard returns to a visible native focus indicator');
  await assertNative(page, regionSelector, 'keyboard focus');
};

try {
  for (const [profile, width, height, theme] of profiles) {
    if (process.env.SCROLL_PROFILES && !process.env.SCROLL_PROFILES.split(',').includes(profile)) continue;
    const mobile = width <= 680;
    const page = await browser.newPage({ viewport: {width, height}, colorScheme: theme, reducedMotion: 'no-preference', isMobile: mobile, hasTouch: mobile });
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(15000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let iframeLoads = 0;
    // A deterministic cross-origin player proves browsing-context continuity;
    // this fixture does not assert YouTube availability or playback policy.
    await page.route('https://www.youtube-nocookie.com/embed/**', route => {
      iframeLoads++;
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>html,body{margin:0;height:100%;background:#111;color:white}button{margin:16px}</style><button onclick="this.textContent=\'Clicked\'">Play</button>' });
    });
    const check = async (name, run) => {
      if (process.env.SCROLL_CASES && !process.env.SCROLL_CASES.split(',').includes(name)) return;
      const result = { engine, profile, name, status: 'PASS' }, errorStart = pageErrors.length;
      try { await run(result); assert.deepEqual(pageErrors.slice(errorStart), [], 'No runtime errors in this reading path'); }
      catch (error) {
        result.status = 'FAIL'; result.error = error.stack || error.message;
        await page.screenshot({path: dir + engine + '-' + profile + '-' + name + '-FAIL.png'}).catch(() => {});
      }
      report.push(result); console.log(result.status, engine, profile, name, result.error || '');
    };
    try {
      await check('story', async result => {
        await goto(page, '/?story=1#map');
        await page.waitForSelector('#story-pane[data-ready="true"]');
        await page.waitForFunction(() => !document.body.classList.contains('story-is-moving'));
        result.scroll = await exerciseScroll(page, '#story-pane', '#story-pane .page > :last-child', mobile, profile + '-story');
        await selectionAndFocus(page, '#story-pane', '#story-pane .intro p', '#story-pane .text-link[href]');
        await page.locator('#story-pane').evaluate(s => s.scrollTop = 480);
        await settle(page);
        const before = await page.locator('#story-pane').evaluate(s => s.scrollTop);
        // The usual settings detour must preserve the exact place of reading.
        await page.locator('[data-open-settings]').first().evaluate(e => e.click());
        await page.waitForFunction(() => document.querySelector('[data-settings-panel]').open);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('[data-settings-panel]').open);
        assert.ok(Math.abs(await page.locator('#story-pane').evaluate(s => s.scrollTop) - before) < 2, 'Settings return preserves the story reading position');
        await waitForSurfaceRest(page, ['#story-pane']);
        await assertNative(page, '#story-pane', 'story after settings');
        await page.locator('#story-pane [data-close-story]').click();
        await page.waitForFunction(() => !document.body.classList.contains('has-story-pane'));
        assert.equal(await page.locator(retired).count(), 0);
      });
      await check('case-text', async result => {
        await goto(page, '/?point=principle-data-intuition' + (profile === 'split' ? '&story=1' : ''));
        await readyCase(page);
        result.scroll = await exerciseScroll(page, '.case-scroll', '.case-story > :visible:not(.visually-hidden)', mobile, profile + '-case-text');
        await selectionAndFocus(page, '.case-scroll', '[data-map-description]', '[data-map-description] a[href]');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.body.hasAttribute('data-case-open'));
        assert.equal(await page.evaluate(() => Boolean(document.activeElement?.getClientRects().length && !document.activeElement.closest('[inert]'))), true, 'Case close returns focus to visible context');
      });
      await check('case-media', async result => {
        await goto(page, '/?point=youtube' + (profile === 'split' ? '&story=1' : ''));
        await readyCase(page);
        await page.locator('[data-personal-media-poster]').evaluate(image => image.decode());
        result.poster = await exerciseScroll(page, '.case-scroll', '.case-story a[href]:visible', mobile, profile + '-poster');
        assert.equal(await page.locator('[data-personal-media-poster]').evaluate(e => getComputedStyle(e).opacity), '1', 'The original poster remains visible');
        const loadsBefore = iframeLoads;
        await page.locator('[data-play-personal-media]').click();
        const player = page.locator('.case-scroll iframe');
        await player.contentFrame().getByRole('button', {name:'Play', exact:true}).waitFor();
        await player.evaluate(e => { window.__qaPlayer = e; e.__qaParent = e.parentElement; });
        for (const top of [0, 240, 80, 100000, 0]) {
          await page.locator('.case-scroll').evaluate((s, top) => s.scrollTop = top, top);
          await settle(page);
          await assertNative(page, '.case-scroll', 'player at ' + top);
          assert.equal(await player.evaluate(e => e === window.__qaPlayer && e.parentElement === e.__qaParent
            && getComputedStyle(e).transform === 'none' && getComputedStyle(e).opacity === '1'), true, 'The original iframe stays native and connected');
        }
        assert.equal(iframeLoads - loadsBefore, 1, 'Scrolling never reloads the player');
        assert.equal(await player.count(), 1, 'There is one player browsing context');
        await player.scrollIntoViewIfNeeded();
        await player.contentFrame().getByRole('button', {name:'Play', exact:true}).click();
        await player.contentFrame().getByRole('button', {name:'Clicked', exact:true}).waitFor();
        await page.locator('[data-personal-media-source]').focus();
        await page.keyboard.press('Shift+Tab');
        assert.equal(await player.evaluate(e => e === document.activeElement), true, 'Keyboard enters the original player');
        await page.keyboard.press('Escape');
        await page.locator('[data-close-inspector]').click();
        await page.waitForFunction(() => !document.body.hasAttribute('data-case-open'));
        assert.equal(await page.locator('iframe').count(), 0, 'Closing releases the original player');
        await goto(page, '/?point=hotline-camp' + (profile === 'split' ? '&story=1' : ''));
        await readyCase(page);
        const video = page.locator('.case-media video');
        await page.waitForFunction(() => document.querySelector('.case-media video')?.readyState >= 2);
        await page.waitForFunction(() => !document.querySelector('.case-media video').paused
          && document.querySelector('[data-case-pause]').textContent === 'Пауза');
        await page.locator('[data-case-pause]').click();
        await page.waitForFunction(() => document.querySelector('.case-media video').paused);
        const saved = await video.evaluate(v => { window.__qaVideo = v; return {time: v.currentTime, src: v.currentSrc}; });
        // The reviewed baseline and candidate both report time 0 in WebKit
        // after a full offscreen return. Preserve exact time at the visible edge;
        // record that existing offscreen limitation without claiming it fixed.
        result.videoVisible = [];
        const edgeTop = await video.evaluate(v => {
          const s=document.querySelector('.case-scroll');
          return Math.max(0, Math.min(s.scrollHeight-s.clientHeight, s.scrollTop+v.getBoundingClientRect().top-s.getBoundingClientRect().top+24));
        });
        for (const top of [edgeTop, Math.max(0,edgeTop-48), edgeTop, 0]) {
          await page.locator('.case-scroll').evaluate((s,top)=>s.scrollTo({top,behavior:'instant'}),top);
          await settle(page);
          const time=await video.evaluate(v=>v.currentTime);
          assert.ok(Math.abs(time-saved.time)<.05, 'Visible native clipping preserves the paused frame: '+JSON.stringify({saved: saved.time,time,top}));
          await assertNative(page,'.case-scroll','visible paused video');
          result.videoVisible.push({top,time});
        }
        result.videoScroll = await exerciseScroll(page, '.case-scroll', '.case-story a[href]:visible', mobile, profile + '-video');
        const actual = await video.evaluate(v => ({same:v === window.__qaVideo, time:v.currentTime, src:v.currentSrc, paused:v.paused, opacity:getComputedStyle(v).opacity}));
        assert.equal(actual.same, true); assert.equal(actual.src, saved.src); assert.equal(actual.paused, true);
        result.videoOffscreenReturn = {before:saved.time,after:actual.time,same:actual.same,src:actual.src,paused:actual.paused};
        assert.equal(actual.opacity, '1', 'Native video never switches to a raster copy');
        await page.locator('[data-motion-toggle]').first().evaluate(e => e.click());
        await assertNative(page, '.case-scroll', 'motion preference');
        await page.locator('[data-motion-toggle]').first().evaluate(e => e.click());
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.body.hasAttribute('data-case-open'));
      });
      await check('sections', async result => {
        result.sections = {};
        for (const section of ['work', 'approach', 'principles', 'contact']) {
          await goto(page, '/#' + section);
          await page.waitForFunction(section => document.querySelector('[data-content-panel].is-open')
            && !document.querySelector('[data-panel-section="' + section + '"]').hidden, section);
          await settle(page);
          const lastSelector = section==='approach'?'#panel-approach .approach-grid li:last-child p':'#panel-' + section + ' a[href]:visible';
          result.sections[section] = await exerciseScroll(page, '.content-panel__body', lastSelector, mobile, profile + '-' + section);
          await selectionAndFocus(page, '.content-panel__body', section==='principles'?'.principle-row__title':'#panel-' + section + ' p', section==='approach'?'.content-panel__body':'#panel-' + section + ' a[href]');
          assert.equal(new URL(page.url()).hash, '#'+section, 'Reading preserves the section URL');
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('[data-content-panel]').classList.contains('is-open'));
          assert.equal(await page.evaluate(() => Boolean(document.activeElement?.getClientRects().length && !document.activeElement.closest('[inert]'))), true, 'Section close returns visible focus');
        }
      });
      await check('settings', async result => {
        await goto(page, '/');
        await declineAnalyticsNotice(page);
        if (mobile) {
          await page.locator('[data-constellation-nav-toggle]').click();
          await page.locator('[data-nav-utility][data-open-settings]').click();
        } else await page.locator('#screen-controls-trigger').click();
        await page.waitForFunction(() => document.querySelector('[data-settings-panel]').open);
        await page.locator('[data-settings-panel] .settings-details').last().locator('summary').click();
        await page.waitForFunction(() => [...document.querySelectorAll('[data-settings-panel] .settings-details')].at(-1)?.open);
        await waitForSurfaceRest(page, ['.settings-panel__body', '.settings-panel']);
        result.scroll = await exerciseScroll(page, '.settings-panel__body', '.settings-panel__details[href]', mobile, profile + '-settings');
        await selectionAndFocus(page, '.settings-panel__body', '.settings-presence p:not([hidden])', '.settings-panel__details[href]');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('[data-settings-panel]').open
          && document.activeElement?.matches('[data-nav-utility][data-open-settings], [data-constellation-nav-toggle], #screen-controls-trigger'));
        assert.equal(await page.locator(retired).count(), 0);
      });
    } finally { await page.close(); }
  }
} finally {
  await browser.close();
  if (local) await new Promise(resolve => local.server.close(resolve));
}
writeFileSync(dir + engine + '-scroll-edges' + (process.env.SCROLL_CASES ? '-' + process.env.SCROLL_CASES.replaceAll(',', '-') : '') + '.json', JSON.stringify(report, null, 2) + '\n');
if (report.some(result => result.status === 'FAIL')) process.exitCode = 1;
