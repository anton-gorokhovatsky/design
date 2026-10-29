import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require('playwright');
const {startStaticServer,waitForCaseLayout}=require('./browser-contracts.cjs');
const projectRoot=resolve(fileURLToPath(new URL('../',import.meta.url)));
// As in check-scroll-lens, isolate hard document navigation from WebKit's
// retired-document presence keepalive; check-live-surface covers that service.
const local=process.env.PORTFOLIO_CASE_ORIGIN?null:await startStaticServer({projectRoot,presence:false});
const origin=process.env.PORTFOLIO_CASE_ORIGIN||local.origin;
const dir=(process.env.PORTFOLIO_UI_ARTIFACT_DIR||fileURLToPath(new URL('../.qa-artifacts/case-view/',import.meta.url)))+'/';
mkdirSync(dir,{recursive:true});
const report=[];
// Software WebKitGTK can deliver fewer than three animation frames in five
// seconds during native video playback, despite unchanged button geometry.
// Sample with a timer, then use a real pointer after actionability/hit tests.
// Never force a click or invoke the DOM click handler directly.
const clickVisiblePlaybackControl=async(page)=>{
  await page.evaluate(()=>{
    delete window.__casePlaybackControl;
  });
  await page.waitForFunction(()=>{
    const button=document.querySelector('[data-case-pause]');
    if(!button)return false;
    const signature=JSON.stringify(button.getBoundingClientRect().toJSON());
    const previous=window.__casePlaybackControl;
    const stableSamples=previous?.signature===signature?previous.stableSamples+1:0;
    const stableSince=stableSamples?previous.stableSince:performance.now();
    const stableFor=performance.now()-stableSince;
    window.__casePlaybackControl={signature,stableSamples,stableSince,stableFor};
    // A delayed callback is not motion: require elapsed stability, not a frame
    // or timer cadence. At least two identical measurements span 300 ms.
    return stableSamples>0&&stableFor>=300;
  },undefined,{polling:100});
  const state=await page.locator('[data-case-pause]').evaluate(button=>{
    const box=button.getBoundingClientRect();
    const clip=button.closest('.case-scroll, .case-layout').getBoundingClientRect();
    const style=getComputedStyle(button);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    return {x,y,box:box.toJSON(),label:button.textContent,
      visible:style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>0&&box.width>0&&box.height>0,
      enabled:!button.disabled&&!button.closest('[inert]'),
      inside:box.left>=Math.max(0,clip.left)&&box.right<=Math.min(innerWidth,clip.right)&&box.top>=Math.max(0,clip.top)&&box.bottom<=Math.min(innerHeight,clip.bottom),
      hit:button.contains(document.elementFromPoint(x,y)),
      stability:window.__casePlaybackControl};
  });
  assert.ok(state.visible&&state.enabled&&state.inside&&state.hit,JSON.stringify(state));
  await page.mouse.click(state.x,state.y);
  return state;
};
// Choices are native radios: one visible figure, arrow navigation and no autoplay.
const checkStudy = async (page, root, name) => {
  const study = page.locator(root);
  await study.locator('fieldset').waitFor();
  for (const value of ['a', 'b', 'c']) {
    await study.locator(`input[value="${value}"]`).check();
    assert.equal(await study.locator('figure:visible').count(), 1);
    assert.equal(await study.locator('figure:visible').getAttribute('data-state'), value);
    for (const image of await study.locator('figure:visible img').all()) {
      // Native lazy loading can defer an offscreen figure indefinitely. Bring
      // the selected image into view before waiting for the actual pixels.
      await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(image => image.complete && image.naturalWidth > 0,
        await image.elementHandle(), { timeout: 5000 });
      await image.evaluate(image => image.decode());
    }
  }
  await study.locator('input[value="a"]').focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await study.locator(`input[name="${name}"]:checked`).getAttribute('value'), 'b');
};
try {
for(const engine of [process.argv[2]||'chromium']) {
  assert.ok(['chromium','webkit'].includes(engine));
  const browser=await ({chromium,webkit})[engine].launch();
  let page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  page.setDefaultTimeout(5000);
  // Cold browser/document startup in CI is separate from UI response time.
  page.setDefaultNavigationTimeout(15000);
  const result={engine,status:'PASS',errors:[],cases:[]};
  page.on('pageerror',error=>result.errors.push(error.message));
  try {
    for(const id of ['garage','private-practice','garage-app','garage-institutions','eleven','narkomfin']) {
      await page.goto(origin+'/?point='+id,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('[data-map-inspector]').dataset.selectedMapId);
      await page.evaluate(()=>document.fonts.ready);
      await waitForCaseLayout(page);
      const geometry=await page.evaluate(()=>{
        const scroll=document.querySelector('.case-scroll');
        const close=document.querySelector('[data-close-inspector]').getBoundingClientRect();
        return {root:document.documentElement.scrollWidth-innerWidth,overflow:scroll.scrollWidth-scroll.clientWidth,
          close:close.bottom,viewport:scroll.getBoundingClientRect().bottom,
          paused:document.querySelector('[data-map-preview-video]').paused,
          metaAnimation:getComputedStyle(document.querySelector('.map-readout__meta-track')||document.querySelector('[data-map-meta]')).animationName};
      });
      assert.equal(geometry.root,0);
      assert.ok(geometry.overflow<=1);
      assert.ok(geometry.close<650 && geometry.viewport<=900);
      assert.equal(geometry.paused,true,'Reduced motion does not autoplay');
      assert.equal(geometry.metaAnimation,'none','Full metadata wraps; no marquee');
      await page.screenshot({path:dir+engine+'-'+id+'.jpg',type:'jpeg',quality:84});
      if(id==='eleven') {
        await checkStudy(page, '#light-study', 'eleven-light');
        assert.match(await page.locator('[data-map-related] a[href="?point=narkomfin"]').textContent(), /Архитектура, история и\s+3D-модель дома/);
        await page.locator('.case-scroll').evaluate(element => element.scrollTop = 0);

        const reading=page.locator('.case-scroll');
        const closeBefore=await page.locator('[data-close-inspector]').boundingBox();
        const bounds=await reading.boundingBox();
        await page.mouse.move(bounds.x+bounds.width*.8,bounds.y+bounds.height*.6);
        await page.mouse.wheel(0,12000);
        await page.waitForFunction(()=>{const s=document.querySelector('.case-scroll');return s.scrollTop>0&&s.scrollTop+s.clientHeight>=s.scrollHeight-2;});
        geometry.scrollRange=await reading.evaluate(element=>element.scrollTop);
        assert.deepEqual(await page.locator('[data-close-inspector]').boundingBox(),closeBefore);
        await page.screenshot({path:dir+engine+'-eleven-bottom.jpg',type:'jpeg',quality:86});
        await page.mouse.wheel(0,-12000);
        await page.waitForFunction(()=>document.querySelector('.case-scroll').scrollTop===0);
        assert.deepEqual(await page.locator('[data-close-inspector]').boundingBox(),closeBefore);
        geometry.input='wheel down/up';
      }
      result.cases.push({id,geometry});
    }
    const next=page.locator('.case-story .map-related__item').first();
    const nextId=new URL(await next.getAttribute('href'),origin).searchParams.get('point');
    await next.click();
    await page.waitForFunction(id=>document.querySelector('.map-inspector').dataset.selectedMapId===id,nextId);
    assert.equal(await page.locator('.case-scroll').evaluate(el=>el.scrollTop),0);
    await page.goBack({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('.map-inspector').dataset.selectedMapId==='narkomfin');
    for(let i=0;i<18;i++) {
      await page.keyboard.press(engine==='webkit'&&process.platform==='darwin'?'Alt+Tab':'Tab');
      assert.equal(await page.evaluate(()=>document.querySelector('.map-inspector').contains(document.activeElement)),true,'Focus remains inside case');
    }
    // Resizing moves the actual video into the single mobile reading column.
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>document.querySelector('.case-media').parentElement.classList.contains('case-inline-media'));
    assert.equal(await page.locator('.case-media video').count(),1);
    await page.setViewportSize({width:1440,height:650});
    await page.waitForFunction(()=>document.querySelector('.case-media').parentElement.classList.contains('case-layout'));
    await waitForCaseLayout(page);
    const closeBefore=await page.locator('[data-close-inspector]').boundingBox();
    const reading=page.locator('.case-scroll');
    await reading.focus();
    assert.equal(await reading.evaluate(element=>document.activeElement===element),true);
    await page.keyboard.press('Home');
    await page.waitForFunction(()=>document.querySelector('.case-scroll').scrollTop===0);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(()=>document.querySelector('.case-scroll').scrollTop>0);
    await waitForCaseLayout(page);
    assert.deepEqual(await page.locator('[data-close-inspector]').boundingBox(),closeBefore,'Keyboard scrolling keeps close fixed');
    result.keyboard=[];
    for(const [end,home] of [['End','Home'],['Control+End','Control+Home']]) {
      await page.keyboard.press(end);
      await page.waitForFunction(()=>{const s=document.querySelector('.case-scroll');return s.scrollTop>0&&s.scrollTop+s.clientHeight>=s.scrollHeight-2;});
      const bottom=await reading.evaluate(element=>element.scrollTop);
      await page.keyboard.press(home);
      await page.waitForFunction(()=>document.querySelector('.case-scroll').scrollTop===0);
      assert.deepEqual(await page.locator('[data-close-inspector]').boundingBox(),closeBefore,'Edge keys keep close fixed');
      result.keyboard.push({end,home,bottom,top:0});
    }
    await page.keyboard.press('PageDown');
    await page.waitForFunction(()=>document.querySelector('.case-scroll').scrollTop>0);
    await page.keyboard.press('PageUp');
    await page.waitForFunction(()=>document.querySelector('.case-scroll').scrollTop===0);
    await waitForCaseLayout(page);
    const media=await page.locator('.case-media').boundingBox();
    await page.mouse.move(media.x+media.width/2,media.y+media.height/2);
    await page.mouse.wheel(0,12000);
    await page.waitForFunction(()=>document.querySelector('.case-scroll').scrollTop>0);
    assert.deepEqual(await page.locator('[data-close-inspector]').boundingBox(),closeBefore,'Wheel over media uses the same case scroller');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.body.hasAttribute('data-case-open'));
    assert.equal(await page.locator('[data-practice-map]').evaluate(el=>el.inert),false);
    await page.goto(origin+'/?point=youtube',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('[data-map-inspector]').dataset.selectedMapId);
    assert.equal(await page.locator('.is-case-view').count(),0,'Personal view retains its compact layout');
    assert.equal(await page.locator('.has-reading-frame .case-sheet').count(),1,'Personal readouts use the same fixed rounded shell');
    assert.equal(await page.locator('[data-map-title]').textContent(),'YOUTUBE');
    await page.goto(origin+'/?point=garage-site',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('[data-map-inspector]').dataset.selectedMapId);
    await waitForCaseLayout(page);
    await page.emulateMedia({reducedMotion:'no-preference'});
    // preload=metadata must not be required to decode a frame before playback.
    // Include public transfer time only after the setting permits video to play.
    await page.waitForFunction(()=>{const v=document.querySelector('.case-media video');return !v.paused&&v.currentTime>.15},undefined,{timeout:15000,polling:100});
    result.playbackControls=[await clickVisiblePlaybackControl(page)];
    await page.waitForFunction(()=>document.querySelector('.case-media video').paused,undefined,{polling:100});
    const pausedAt=await page.locator('.case-media video').evaluate(v=>v.currentTime);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.case-media video').evaluate(v=>v.paused),true);
    assert.ok(Math.abs(await page.locator('.case-media video').evaluate(v=>v.currentTime)-pausedAt)<.03);
    result.playbackControls.push(await clickVisiblePlaybackControl(page));
    await page.waitForFunction(time=>{const v=document.querySelector('.case-media video');return !v.paused&&Math.abs(v.currentTime-time)>.1;},pausedAt,{polling:100});
    result.playbackControls.push(await clickVisiblePlaybackControl(page));
    await page.waitForFunction(()=>document.querySelector('.case-media video').paused,undefined,{polling:100});
    await page.setViewportSize({width:1440,height:900});
    await page.locator('.case-scroll').evaluate(el=>el.scrollTop=0);
    await page.waitForTimeout(180);
    for(const theme of ['light','dark']) {
      await page.emulateMedia({colorScheme:theme});
      await waitForCaseLayout(page);
      await page.locator('.case-sheet').screenshot({path:dir+engine+'-story-'+theme+'.jpg',type:'jpeg',quality:90});
      await page.locator('.case-header').screenshot({path:dir+engine+'-header-'+theme+'.jpg',type:'jpeg',quality:86});
    }
    await page.locator('[data-close-inspector]').click();
    await page.waitForFunction(()=>!document.body.hasAttribute('data-case-open'));
    assert.equal(await page.locator('.map-inspector').evaluate(el=>getComputedStyle(el).opacity),'0','No flash of the old small readout on close');
    await page.screenshot({path:dir+engine+'-restored-map.jpg',type:'jpeg',quality:84});
    // The case lifecycle above finishes on the map. Give the independent work
    // route its own document and input state instead of inheriting the native
    // video session, media overrides and same-document navigation history.
    await page.close();
    page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(15000);
    page.on('pageerror',error=>result.errors.push(error.message));
    // A managed route must not remain a native fragment target. WebKit can
    // otherwise pin the work scroller to its first row after a direct visit.
    await page.goto(origin + '/?story=1#work');
    await page.waitForFunction(() => document.querySelector('#story-pane')?.dataset.ready === 'true'
      && document.querySelector('[data-content-panel].is-open')?.dataset.view === 'work');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const directWorkBody = page.locator('.content-panel__body');
    const directWorkBox = await directWorkBody.boundingBox();
    await page.mouse.move(directWorkBox.x + directWorkBox.width / 2, directWorkBox.y + directWorkBox.height / 2);
    await page.mouse.wheel(0, 600);
    await page.waitForFunction(() => document.querySelector('.content-panel__body').scrollTop > 40);
    await page.waitForTimeout(600);
    assert.ok(await directWorkBody.evaluate(element => element.scrollTop > 40),
      'Direct work route keeps the position reached by a real wheel gesture');
    assert.equal(new URL(page.url()).hash, '#work', 'Direct scrolling preserves the public work URL');
    // Check the route around a case, including the place the reader returns to.
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin + '/#work');
      // Same-document navigation resolves before the panel's next-frame scroll
      // restoration and focus. Wait for that lifecycle before sending input.
      await page.waitForFunction(() => {
        const panel = document.querySelector('[data-content-panel]');
        const position = history.state?.panelPosition;
        const target = position?.view === 'work' && position.pointId
          ? panel.querySelector(`.work-row[data-map-point="${CSS.escape(position.pointId)}"]`)
          : panel.querySelector('[data-close-panel]');
        return panel.dataset.view === 'work' && panel.classList.contains('is-open')
          && target && document.activeElement === target;
      }, undefined, { polling: 50 });
      await page.waitForFunction(() => document.getAnimations().every(animation =>
        animation.animationName !== 'window-reveal'
        || (!animation.pending && animation.playState !== 'running')),
      undefined, {polling:50});
      assert.equal(await page.locator('.content-panel__more').count(), 0,
        'Scroll continuation uses the common edge effect, without a footer command');
      const body = page.locator('.content-panel__body');
      await body.focus();
      await page.keyboard.press('PageDown');
      await page.waitForFunction(() => document.querySelector('.content-panel__body').scrollTop > 20);
      assert.equal(new URL(page.url()).hash, '#work', 'Keyboard scrolling stays in the existing list');
      await page.keyboard.press('End');
      await page.waitForFunction(() => {
        const e = document.querySelector('.content-panel__body');
        return e.scrollTop + e.clientHeight >= e.scrollHeight - 2;
      });
      await page.keyboard.press('Home');
      await page.waitForFunction(() => document.querySelector('.content-panel__body').scrollTop === 0);
      const row = page.locator('.work-row[data-map-point="ilmix"]');
      await row.scrollIntoViewIfNeeded();
      const scrollTop = await page.locator('.content-panel__body').evaluate(el => el.scrollTop);
      await row.click();
      await page.waitForFunction(() => document.body.hasAttribute('data-case-open'));
      await page.locator('[data-close-inspector]').click();
      await page.waitForFunction(() => document.activeElement.dataset.mapPoint === 'ilmix');
      assert.equal(new URL(page.url()).hash, '#work');
      assert.ok(Math.abs(await page.locator('.content-panel__body').evaluate(el => el.scrollTop) - scrollTop) < 2);
      await row.click();
      await page.waitForFunction(() => document.body.hasAttribute('data-case-open'));
      await page.goBack();
      await page.waitForFunction(top => Math.abs(document.querySelector('.content-panel__body').scrollTop - top) < 2, scrollTop);
      await page.goForward();
      await page.waitForFunction(() => document.body.hasAttribute('data-case-open'));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement.dataset.mapPoint === 'ilmix');
      // Each case entry owns its reading position and source related link.
      await page.goto(origin + '/?preview=garage&point=garage');
      await page.waitForFunction(() => document.querySelector('[data-map-inspector]').dataset.selectedMapId === 'garage');
      await waitForCaseLayout(page);
      const related = page.locator('[data-map-related] a[href="?point=garage-endowment"]');
      await related.scrollIntoViewIfNeeded();
      await related.focus();
      const caseTop = await page.locator('.case-scroll').evaluate(el => el.scrollTop);
      assert.ok(caseTop > 20, 'The source related link is reached by scrolling the case');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('[data-map-inspector]').dataset.selectedMapId === 'garage-endowment');
      await waitForCaseLayout(page);
      assert.equal(await page.locator('.case-scroll').evaluate(el => el.scrollTop), 0, 'A newly opened related project starts at its heading');
      await page.goBack();
      await page.waitForFunction(top => document.querySelector('[data-map-inspector]').dataset.selectedMapId === 'garage'
        && Math.abs(document.querySelector('.case-scroll').scrollTop - top) < 2
        && document.activeElement?.matches('[data-map-related] a[href="?point=garage-endowment"]'), caseTop);
      // Closing and deliberately opening the same point creates a fresh entry;
      // Forward must not inherit the earlier related-link reading position.
      await page.locator('[data-close-inspector]').click();
      await page.waitForFunction(() => !document.body.hasAttribute('data-case-open'));
      await page.locator('[data-map-id="garage"]').first().click();
      if (!await page.locator('body').evaluate(el => el.hasAttribute('data-case-open'))) {
        await page.locator('.point-preview a').click();
      }
      await page.waitForFunction(() => document.body.hasAttribute('data-case-open')
        && document.querySelector('[data-map-inspector]').dataset.selectedMapId === 'garage');
      await waitForCaseLayout(page);
      assert.equal(await page.locator('.case-scroll').evaluate(el => el.scrollTop), 0);
      await page.goBack();
      await page.waitForFunction(() => !document.body.hasAttribute('data-case-open'));
      await page.goForward();
      await page.waitForFunction(() => document.body.hasAttribute('data-case-open')
        && document.querySelector('[data-map-inspector]').dataset.selectedMapId === 'garage'
        && document.querySelector('.case-scroll').scrollTop === 0
        && document.activeElement?.matches('[data-map-title]'));
      (result.relatedReturns ||= []).push({width, restoredTop: caseTop, freshForwardTop: 0});
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin + '/#contact');
    // Hash navigation can finish before the panel applies its state and focus.
    await page.waitForFunction(() => document.querySelector('[data-content-panel]').dataset.view === 'contact'
      && document.activeElement?.matches('[data-close-panel]'));
    assert.equal(await page.locator('.content-panel__more').count(), 0, 'No footer continuation command in other sections');
    assert.equal(await page.locator('[data-command-input]').evaluate(input => Boolean(input.closest('[inert]'))), false,
      'Returning from a mobile case must not leave desktop search inert');
    await page.locator('[data-command-input]').click();
    await page.locator('[data-command-input]').fill('Хотлайн');
    const searchResult = page.getByRole('option', { name: /Кэмп Hotline/ });
    await searchResult.waitFor({ state: 'visible' });
    await page.locator('[data-command-results]').evaluate(element => Promise.all(
      element.getAnimations().map(animation => animation.finished.catch(() => {})),
    ));
    // WebKitGTK can stall inside locator.click's frame-based scroll wait.
    // Check the actual hit target, then send an ordinary pointer click.
    const target = await searchResult.evaluate(button => {
      const box = button.getBoundingClientRect();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      return { x, y, enabled: !button.disabled && !button.closest('[inert]'),
        inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
        hit: button.contains(document.elementFromPoint(x, y)) };
    });
    assert.ok(target.enabled && target.inside && target.hit, JSON.stringify(target));
    await page.mouse.click(target.x, target.y);
    await page.waitForFunction(() => document.body.hasAttribute('data-case-open')
      && document.querySelector('[data-map-inspector]').dataset.selectedMapId === 'hotline-camp');
    await page.locator('[data-close-inspector]').click();
    await page.waitForFunction(() => document.querySelector('[data-content-panel]').dataset.view === 'contact');
    await page.goto(origin + '/?point=running');
    await page.waitForFunction(() => document.querySelectorAll('[data-map-related] a.map-related__item').length === 9);
    const productHref = 'https://doronin.store/tproduct/840694551052-kovyor';
    const productAction = page.locator('[data-map-related] a.map-related__action');
    await productAction.waitFor();
    assert.equal(await productAction.getAttribute('href'), productHref);
    assert.equal(await productAction.getAttribute('target'), '_blank');
    assert.ok((await productAction.getAttribute('rel')).includes('noreferrer'));
    const merchCase = page.locator('[data-map-related] a.map-related__item[href="?point=doronin"]');
    await merchCase.focus();
    await page.keyboard.press(engine === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
    assert.equal(await productAction.evaluate(el => document.activeElement === el), true,
      'The project link and its product action are distinct consecutive keyboard stops');
    await page.context().route(productHref, route => route.fulfill({ status: 200,
      contentType: 'text/html', body: '<!doctype html><title>Product destination</title>' }));
    const productPopupPromise = page.waitForEvent('popup');
    await page.keyboard.press('Enter');
    const productPopup = await productPopupPromise;
    await productPopup.waitForLoadState('domcontentloaded');
    assert.equal(productPopup.url(), productHref, 'Buy opens the real product URL directly');
    assert.equal(await page.locator('[data-map-inspector]').getAttribute('data-selected-map-id'), 'running',
      'The product action does not become a related case transition');
    await productPopup.close();
    await page.context().unroute(productHref);
    // Compare the document itself: WebKit can round timeOrigin differently
    // between reads, which is not evidence of a document navigation.
    const sourceDocument = await page.evaluateHandle(() => document);
    await page.locator('[data-map-related] a[href="?point=hotline-camp"]').click();
    await page.waitForFunction(() => document.body.hasAttribute('data-case-open'));
    assert.equal(await sourceDocument.evaluate(node => node === document), true, 'Related points open without reloading the page');
    await sourceDocument.dispose();
    await page.goto(origin + '/?route=observation&step=9');
    await page.waitForFunction(() => document.querySelector('[data-observation-pause]').hidden);
    assert.equal(await page.locator('[data-observation-pause]').isVisible(), false, 'The final step has no meaningless Continue action');
    await page.locator('[data-observation-previous]').click();
    assert.equal(await page.locator('[data-observation-pause]').isVisible(), true);
    // “О карте” opens the requested adjacent reader; Escape preserves the map.
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin + '/?scene=map');
      assert.equal(await page.locator('[data-open-panel="map-making"], #map-making').count(), 0);
      assert.equal(await page.locator('#light-study').isVisible(), false);
      const selector = width === 1440 ? '.map-about-trigger' : '.map-story-link';
      if (width === 390) await page.locator('[data-constellation-nav-toggle]').click();
      await page.locator(selector).click();
      await page.waitForSelector('#story-pane[data-ready="true"]');
      assert.match(await page.locator('#story-pane').innerText(), /Соседство здесь определяется связями/);
      assert.equal(await page.locator('#story-pane').evaluate(e => e.scrollWidth > e.clientWidth + 1), false);
      // A temporary settings dialog preserves the visible reader and its URL.
      await page.locator('#story-pane').evaluate(el => el.scrollTop = 480);
      await page.waitForFunction(() => document.querySelector('#story-pane').scrollTop === 480);
      const readerUrl = page.url();
      for (const exit of ['escape', 'close']) {
        await page.locator('[data-constellation-nav-toggle]').click();
        await page.locator('[data-constellation-nav] [data-open-settings]').click();
        await page.waitForFunction(() => document.querySelector('[data-settings-panel]').open);
        if (exit === 'escape') await page.keyboard.press('Escape');
        else await page.locator('[data-close-settings]').click();
        await page.waitForFunction(() => !document.querySelector('[data-settings-panel]').open
          && document.body.classList.contains('has-story-pane')
          && document.querySelector('#story-pane').scrollTop === 480);
        assert.equal(page.url(), readerUrl, 'Closing settings preserves the reader route');
      }
      (result.settingsReturns ||= []).push({width, scrollTop: 480, exits: ['escape', 'close']});
      await page.locator('#story-title').evaluate(el => el.focus({preventScroll: true}));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('#story-pane').inert);
      await page.waitForFunction(selector => document.activeElement?.matches(selector), width === 1440 ? selector : '[data-constellation-nav-toggle]');
    }
    // The remaining case study retains the same failed-load and retry contract.
    await page.route('**/js/case-content.json*', route => route.abort());
    await page.goto(origin + '/?point=eleven');
    await page.getByText('Не удалось загрузить подробности.', { exact: true }).waitFor();
    await page.unroute('**/js/case-content.json*');
    await page.locator('[data-case-load-state] button').click();
    await page.locator('#light-study fieldset').waitFor();
    assert.deepEqual(result.errors,[]);
  } catch(error) {
    result.status='FAIL';result.error=error.stack||error.message;
    result.lastState=await page.evaluate(()=>({
      active:document.activeElement?.outerHTML.slice(0,240),
      scroll:document.querySelector('.case-scroll')?.scrollTop,
      panelScroll:document.querySelector('.content-panel__body')?.scrollTop,
      continuationInput:window.__continuationInput,
      panelPosition:history.state?.panelPosition,
      panelAnimation:getComputedStyle(document.querySelector('.content-panel__body')).animationName,
      keyRegionFocused:document.activeElement===document.querySelector('.case-scroll'),
      playbackControl:window.__casePlaybackControl,
    })).catch(()=>null);
    console.log('Case failure state:',JSON.stringify(result.lastState));
    await page.screenshot({path:dir+engine+'-flow-FAIL.jpg',type:'jpeg',quality:84}).catch(()=>{});
  }
  report.push(result);console.log(result.status,engine,result.error||'');
  await browser.close();
}
writeFileSync(dir+'flow-report-'+(process.argv[2]||'chromium')+'.json',JSON.stringify(report,null,2)+'\n');
if(report.some(result=>result.status==='FAIL'))process.exitCode=1;

} finally { if(local) await new Promise(resolve=>local.server.close(resolve)); }
