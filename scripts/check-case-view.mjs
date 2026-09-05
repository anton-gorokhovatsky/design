import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { startStaticServer, readMaterialAuditExpression, waitForCaseLayout } = require('./browser-contracts.cjs');
const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const local = process.env.PORTFOLIO_CASE_ORIGIN ? null : await startStaticServer({ projectRoot });
const origin = process.env.PORTFOLIO_CASE_ORIGIN || local.origin;
const dir = (process.env.PORTFOLIO_UI_ARTIFACT_DIR || fileURLToPath(new URL('../.qa-artifacts/case-view/', import.meta.url))) + '/';
mkdirSync(dir, { recursive: true });
const report = [];
try {
for (const engine of [process.argv[2] || 'chromium']) {
  assert.ok(['chromium', 'webkit'].includes(engine));
  if (process.env.CASE_ENGINE && process.env.CASE_ENGINE !== engine) continue;
  const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
  for (const [name, width, height, theme, text] of [
    ['desktop-light',1440,900,'light'], ['desktop-dark',1440,900,'dark'],
    ['short',1440,650,'light'], ['tablet-light',1024,768,'light'], ['tablet-dark',1024,768,'dark'],
    ['mobile-light',390,844,'light'], ['mobile-dark',390,844,'dark'],
    ['compact',320,568,'light'], ['compact-dark',320,568,'dark'], ['text200',1440,900,'dark',200],
  ]) {
    if (process.env.CASE_NAME && !process.env.CASE_NAME.split(',').includes(name)) continue;
    const page = await browser.newPage({ viewport: {width,height}, colorScheme: theme,
      reducedMotion:'reduce', isMobile:width<=680, hasTouch:width<=680 });
    page.setDefaultTimeout(5000);
    const mobileWebKit = engine==='webkit' && width<=680;
    const result = {engine,name,status:'PASS',errors:[],input:mobileWebKit?'programmatic scroll; mobile WebKit has no wheel support':'mouse wheel'};
    page.on('pageerror', e => result.errors.push(e.message));
    try {
      const response = await page.goto(origin+'/?point=garage-site',{waitUntil:'domcontentloaded'});
      assert.equal(response.status(), 200, 'The real production page is served');
      await page.waitForFunction(() => document.querySelector('.map-inspector.is-case-view'));
      await page.evaluate(() => document.fonts.ready);
      if (text) await page.evaluate(() => document.documentElement.style.fontSize='200%');
      await waitForCaseLayout(page);
      const close = page.locator('[data-close-inspector]');
      const scroll = page.locator('.case-scroll');
      const scrollBy = async delta => {
        if (mobileWebKit) await scroll.evaluate((element,value) => element.scrollBy(0,value),delta);
        else await page.mouse.wheel(0,delta);
      };
      const before = await close.boundingBox();
      const measure = () => page.evaluate(() => {
        const scroll = document.querySelector('.case-scroll');
        const description = document.querySelector('.map-readout__description');
        const b = document.querySelector('.case-sheet').getBoundingClientRect();
        const media = document.querySelector('.case-media').getBoundingClientRect();
        return {top:scroll.scrollTop,client:scroll.clientHeight,total:scroll.scrollHeight,
          sheet:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},media:{x:media.x,y:media.y},
          nestedOverflow:description.scrollHeight-description.clientHeight,
          copyOverflow:description.scrollWidth-description.clientWidth,
          scrollbar:getComputedStyle(scroll).scrollbarWidth,
          scrollX:scroll.scrollWidth-scroll.clientWidth,pageX:document.documentElement.scrollWidth-innerWidth};
      });
      result.start = await measure();
      result.type = await page.evaluate(() => {
        const size = selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
        return {
          labels: ['[data-map-meta]', '.map-evidence dt', '.map-related__header > span', '.case-media figcaption span'].map(size),
          body: size('.map-evidence dd'),
          role: size('[data-map-evidence-role]'),
          roleFamily: getComputedStyle(document.querySelector("[data-map-evidence-role]")).fontFamily,
          roleLabelFamily: getComputedStyle(document.querySelector("[data-map-evidence-role-label]")).fontFamily,
          mediaCount: document.querySelectorAll('.case-media video').length,
        };
      });
      assert.ok(result.type.labels.every(size => Math.abs(size-result.type.labels[0])<.02),'Service labels share one type role');
      assert.ok(result.type.body >= 16,'Reading text retains the browser default size or larger');
      assert.ok(Math.abs(result.type.role-result.type.body)<.02,'The long role uses the shared reading size');
      assert.match(result.type.roleFamily,/Golos/,'Long role copy uses Golos');
      assert.match(result.type.roleLabelFamily,/Rene/,'The role label retains the author face');
      assert.equal(result.type.mediaCount,1,'The case uses the original single video');
      assert.equal(await page.locator('.map-axis-label,.map-node-label,.origin-marker__label').evaluateAll(elements=>elements.every(el=>getComputedStyle(el).visibility==='hidden')),true,'Backdrop labels cannot collide with case edges');
      await page.screenshot({path:dir+engine+'-'+name+'-top.jpg',type:'jpeg',quality:86});
      if (name.startsWith('desktop-')) await page.screenshot({path:dir+engine+'-'+name+'-case-edge.jpg',type:'jpeg',quality:90,
        clip:{x:Math.max(0,result.start.sheet.x-110),y:Math.max(0,result.start.sheet.y-60),width:480,height:250}});
      assert.equal(result.start.pageX,0,'No page overflow');
      assert.ok(result.start.scrollX <= 1,'No case horizontal overflow');
      assert.ok(result.start.copyOverflow <= 1,'No text extends into the sheet padding at enlarged font sizes');
      assert.equal(result.start.scrollbar,'none','The case hides the native scrollbar without disabling scrolling');
      assert.ok(result.start.nestedOverflow <= 1,'No nested description scroller');
      if (width>900) assert.ok(Math.abs(result.start.media.y-result.start.sheet.y)<2,'Media and story share a top axis');
      const material = await page.evaluate(readMaterialAuditExpression);
      assert.deepEqual(material.failures,[],'Shared material contract');
      const b = await scroll.boundingBox();
      assert.ok(b.y>=before.y+before.height && b.y+b.height<=height-8,'The entire scrolling viewport fits below the fixed close row');
      if (['short','mobile-light','mobile-dark','compact','text200'].includes(name)) {
        assert.ok(result.start.total>result.start.client+20,'Long content really requires scrolling in this fixture');
      }
      await page.mouse.move(b.x+b.width*.78,b.y+Math.min(b.height*.6,420));
      await scrollBy(12000);
      await page.waitForFunction(() => { const s=document.querySelector('.case-scroll'); return s.scrollTop+s.clientHeight>=s.scrollHeight-2; });
      result.bottom = await measure();
      if (result.start.total>result.start.client+2) assert.ok(result.bottom.top>0,'Input actually moved the content');
      const lastLink = await page.locator('.case-story .map-related__item').last().boundingBox();
      assert.ok(lastLink.y>=b.y && lastLink.y+lastLink.height<=height-8,'The last related case is fully reachable');
      assert.deepEqual(await close.boundingBox(),before,'Close does not move while reading');
      assert.equal(await close.isVisible(),true);
      await page.screenshot({path:dir+engine+'-'+name+'-bottom.jpg',type:'jpeg',quality:86});
      await scrollBy(-12000);
      await page.waitForFunction(() => document.querySelector('.case-scroll').scrollTop===0);
      assert.deepEqual(await close.boundingBox(),before,'Close stays fixed when returning to top');
      await scrollBy(12000);
      await page.waitForTimeout(200);
      await close.click();
      await page.waitForFunction(() => !document.body.hasAttribute('data-case-open'));
      if (width>900) await page.waitForFunction(()=>getComputedStyle(document.querySelector('.map-axis-label--north')).visibility==='visible');
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.mapId),'garage-site','Close returns focus to the selected point');
      assert.equal(await page.locator('.ad-map-home,.ad-landmarks,.ad-utilities,.ad-intro').count(),0,'Rejected home/navigation experiment is absent');
      await page.locator('[data-map-id="garage-site"]').click();
      await page.waitForFunction(() => document.body.hasAttribute('data-case-open'));
      assert.equal((await measure()).top,0,'Reopening starts at the beginning');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.body.hasAttribute('data-case-open'));
      assert.deepEqual(result.errors,[]);
    } catch (error) {
      result.status='FAIL'; result.error=error.stack || error.message;
      await page.screenshot({path:dir+engine+'-'+name+'-FAIL.jpg',type:'jpeg',quality:82}).catch(()=>{});
    }
    report.push(result);
    console.log(result.status,engine,name,result.error||'');
    await page.close();
  }
  await browser.close();
}
writeFileSync(dir+'report-'+(process.argv[2] || 'chromium')+(process.env.CASE_NAME?'-'+process.env.CASE_NAME:'')+'.json',JSON.stringify(report,null,2)+'\n');
if (report.some(result=>result.status==='FAIL')) process.exitCode=1;

} finally { if (local) await new Promise(resolve => local.server.close(resolve)); }
