import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require('playwright');
const { startStaticServer, readMaterialAuditExpression, waitForCaseLayout, readRenderedFrameCorners } = require('./browser-contracts.cjs');
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
        const frame = document.querySelector('.case-sheet');
        const corners = [[b.left+1,b.top+1],[b.right-1,b.top+1],[b.left+1,b.bottom-1],[b.right-1,b.bottom-1]];
        const media = document.querySelector('.case-media').getBoundingClientRect();
        return {top:scroll.scrollTop,client:scroll.clientHeight,total:scroll.scrollHeight,
          sheet:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},media:{x:media.x,y:media.y,width:media.width},
          rounded:parseFloat(getComputedStyle(frame).borderRadius)>=20 && getComputedStyle(frame).overflow==='hidden',
          cornerLeaks:corners.filter(([x,y])=>frame.contains(document.elementFromPoint(x,y))).length,
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
      assert.ok(result.start.rounded && (engine==='webkit' || result.start.cornerLeaks===0),'The complete visible frame has four clipped round corners');
      if (width>900) assert.ok(Math.abs(result.start.media.y-result.start.sheet.y)<2,'Media and story share a top axis');
      else assert.ok(Math.abs(result.start.media.x-result.start.sheet.x)<2
        && Math.abs(result.start.media.width-(result.start.sheet.right-result.start.sheet.x))<2,
      'Inline video spans the full frame while text retains its inset');
      const material = await page.evaluate(readMaterialAuditExpression);
      assert.deepEqual(material.failures,[],'Shared material contract');
      const b = await scroll.boundingBox();
      assert.ok(b.y>=before.y+before.height && b.y+b.height<=height-8,'The entire scrolling viewport fits below the fixed close row');
      if (['short','mobile-light','mobile-dark','compact','text200'].includes(name)) {
        assert.ok(result.start.total>result.start.client+20,'Long content really requires scrolling in this fixture');
      }
      await page.mouse.move(b.x+b.width*.78,b.y+Math.min(b.height*.6,420));
      await scroll.evaluate(e=>e.scrollTop=(e.scrollHeight-e.clientHeight)/2);
      result.middle = await measure();
      assert.deepEqual(result.middle.sheet,result.start.sheet,'The outer frame stays stationary in the middle of a read');
      assert.ok(result.middle.rounded && (engine==='webkit' || result.middle.cornerLeaks===0),'No straight frame cut appears in mid-scroll');
      result.cornerPixels = await readRenderedFrameCorners(page,'.case-sheet');
      assert.ok(result.cornerPixels.every(delta=>delta<12), 'Rendered corners reveal the background; a rectangular fill must not cover them: '+result.cornerPixels);
      if (name==='desktop-light'||name==='mobile-dark') await page.screenshot({path:dir+engine+'-'+name+'-middle.jpg',type:'jpeg',quality:90});
      await scrollBy(12000);
      await page.waitForFunction(() => { const s=document.querySelector('.case-scroll'); return s.scrollTop+s.clientHeight>=s.scrollHeight-2; });
      result.bottom = await measure();
      assert.deepEqual(result.bottom.sheet,result.start.sheet,'All four outer frame corners stay on screen at the end');
      assert.ok(result.bottom.rounded && (engine==='webkit' || result.bottom.cornerLeaks===0),'The rounded silhouette survives scrolling to the end');
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
      if (name==='mobile-light') {
        // Computed filter:url() is not evidence that Safari paints filtered video.
        // Compare actual edge pixels against the same paused frame without the lens.
        await page.emulateMedia({reducedMotion:'no-preference'});
        await page.waitForFunction(()=>!document.querySelector('.case-media video').paused);
        await page.locator('[data-case-pause]').click();
        await scroll.evaluate(s=>{
          const v=s.querySelector('video');
          s.scrollTop+=v.getBoundingClientRect().top-s.getBoundingClientRect().top+24;
        });
        const lens=page.locator('.scroll-lens-video');
        await lens.waitFor({state:'visible'});
        const frameBefore=await page.locator('.case-sheet').boundingBox();
        const media=await page.locator('.case-media video').boundingBox();
        const port=await scroll.boundingBox();
        const clip={x:media.x+12,y:port.y+8,width:media.width-24,height:60};
        const painted=await page.screenshot({clip});
        const original=await lens.evaluate(c=>{const value=c.style.filter;c.style.filter='none';return value;});
        const plain=await page.screenshot({clip});
        await lens.evaluate((c,value)=>c.style.filter=value,original);
        result.videoLensPixelDelta=await page.evaluate(async sources=>{
          const read=async source=>{const i=new Image();i.src='data:image/png;base64,'+source;await i.decode();
            const c=document.createElement('canvas');c.width=i.width;c.height=i.height;
            const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,c.width,c.height).data;};
          const [a,b]=await Promise.all(sources.map(read));let delta=0;
          for(let n=0;n<a.length;n++)if(n%4!==3)delta+=Math.abs(a[n]-b[n]);
          return delta/(a.length*.75);
        },[painted.toString('base64'),plain.toString('base64')]);
        assert.ok(result.videoLensPixelDelta>4,'The video edge is visibly refracted in this engine');
        await page.screenshot({path:dir+engine+'-video-lens.png'});
        assert.equal(await page.locator('.case-media video').count(),1,'No duplicate video decoder');
        assert.equal(await page.locator('.case-media video').evaluate(v=>v.paused),true,'The lens preserves manual pause');
        assert.deepEqual(await page.locator('.case-sheet').boundingBox(),frameBefore,'The effect cannot reshape its outer frame');
        await page.emulateMedia({reducedMotion:'reduce'});
        await lens.waitFor({state:'detached'});
        assert.equal(await page.locator('.case-media video').evaluate(v=>v.style.opacity),'','Reduced motion restores native video immediately');
        assert.equal(await page.locator('filter[id^="scroll-ink"]').count(),0,'Reduced motion removes optical filters');
      }
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
