import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const {chromium, webkit} = require('playwright');
const {startStaticServer, readRenderedFrameCorners} = require('./browser-contracts.cjs');
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const engine = process.argv[2] || 'chromium';
assert.ok(['chromium','webkit'].includes(engine));
const local = process.env.PORTFOLIO_LENS_ORIGIN ? null : await startStaticServer({projectRoot:root});
const origin = process.env.PORTFOLIO_LENS_ORIGIN || local.origin;
const dir = (process.env.PORTFOLIO_UI_ARTIFACT_DIR || root+'/.qa-artifacts/scroll-lens')+'/';
mkdirSync(dir,{recursive:true});
const browser = await ({chromium,webkit})[engine].launch();
const report = [];
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const align = async (page, selector, edge, inset=18) => {
  await page.locator(selector).evaluate((e,{edge,inset}) => {
    const s=e.closest('.case-scroll'), r=e.getBoundingClientRect(), p=s.getBoundingClientRect();
    s.scrollTop += edge==='top' ? r.top-p.top+inset : r.bottom-p.bottom-inset;
  },{edge,inset});
  await settle(page);
};
const delta = (page, a, b) => page.evaluate(async sources => {
  const read = async source => {const i=new Image();i.src='data:image/png;base64,'+source;await i.decode();
    const c=document.createElement('canvas');c.width=i.width;c.height=i.height;
    const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,c.width,c.height).data;};
  const [x,y]=await Promise.all(sources.map(read));let d=0;
  for(let n=0;n<x.length;n++) if(n%4!==3) d+=Math.abs(x[n]-y[n]);
  return d/(x.length*.75);
},[a.toString('base64'),b.toString('base64')]);
try {
  for(const [name,width,height,theme,point,selector,type] of [
    ['poster',390,568,'light','youtube','[data-personal-media-poster]','image'],
    ['poster-compact',320,568,'dark','youtube','[data-personal-media-poster]','image'],
    ['player',390,568,'light','youtube','[data-personal-media-screen]','player'],
    ['player-dark',320,568,'dark','youtube','[data-personal-media-screen]','player'],
    ['player-short',390,380,'light','youtube','[data-personal-media-screen]','player'],
    ['reel',390,480,'light','hotline-camp','.case-inline-media video','video'],
    ['links',1440,650,'light','running','.map-related__item:nth-child(1)','links'],
    ['links-mobile',390,568,'dark','running','.map-related__item:nth-child(1)','links'],
  ]) {
    if(process.env.LENS_CASES && !process.env.LENS_CASES.split(',').includes(name)) continue;
    const page=await browser.newPage({viewport:{width,height},colorScheme:theme,reducedMotion:'no-preference'});
    page.setDefaultTimeout(8000);
    const result={engine,name,status:'PASS',errors:[],edges:{}};
    page.on('pageerror',e=>result.errors.push(e.message));
    let loads=0;
    try {
      // This cross-origin fixture exercises a composited moving video layer and
      // native controls; it does not claim availability of YouTube's service.
      await page.route('https://player.example.test/lens-fixture.mp4',r=>r.fulfill({path:root+'/assets/reels/hotline-camp.mp4',contentType:'video/mp4'}));
      await page.route('https://www.youtube-nocookie.com/embed/**',r=>{loads++;return r.fulfill({contentType:'text/html',body:'<!doctype html><script>location.replace("https://player.example.test/embed")</script>'});});
      await page.route('https://player.example.test/embed',r=>{return r.fulfill({contentType:'text/html',body:'<!doctype html><style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:cover}button{position:absolute;top:45%;left:45%}</style><video autoplay muted loop playsinline src="https://player.example.test/lens-fixture.mp4"></video><button onclick="this.textContent=\'Clicked\'">Play</button>'});});
      assert.equal((await page.goto(origin+'/?point='+point,{waitUntil:'load'})).status(),200);
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForFunction(()=>document.querySelector('.case-scroll')?.clientHeight>0
        && document.querySelector('[data-map-inspector]').getAnimations().every(a=>a.playState!=='running'));
      if(type==='image') await page.locator(selector).evaluate(i=>i.decode());
      if(type==='player') {
        await page.locator('[data-play-personal-media]').click();
        await page.locator('iframe').contentFrame().locator('video').evaluate(async v=>{await v.play();v.autoplay=false;v.removeAttribute('autoplay');v.pause();});
        await page.locator('iframe').evaluate(f=>f.dataset.original='yes');
        result.focus=await page.locator('iframe').evaluate(f=>({active:f===document.activeElement,visible:f.matches(':focus-visible')}));
      }
      if(type==='video') {
        await page.waitForFunction(()=>document.querySelector('.case-inline-media video')?.readyState>=2);
        await page.locator('[data-case-pause]').click();
      }
      const sheet=await page.locator('.case-sheet').boundingBox();
      let target;
      for(const edge of ['top','bottom']) {
        target=type==='links'?`.map-related__track > li:nth-child(${edge==='top'?1:7}) strong`:selector;
        // The player projection must never feed its transformed bounds back into scrolling.
        await align(page,target,edge,type==='links'?-4:18);
        const port=await page.locator('.case-scroll').boundingBox();
        const bounds=await page.locator(target).boundingBox();
        assert.ok(edge==='top'?bounds.y<port.y+50:bounds.y+bounds.height>port.y+port.height-50,'The actual content reaches this edge');
        const clip={x:Math.max(port.x,bounds.x)+8,y:edge==='top'?port.y+4:port.y+port.height-64,
          width:Math.min(bounds.width,port.width)-16,height:60};
        const affected=type==='player'?'iframe':['video','image'].includes(type)?'.scroll-lens-video':target;
        await page.waitForFunction(sel=>{const e=document.querySelector(sel);return e&&(e.style.filter.includes('scroll-ink')||e.style.transform.includes('matrix3d'));},affected);
        const visible=await page.screenshot({clip});
        await page.locator(affected).evaluate(e=>{
          e.dataset.lensStyle=e.getAttribute('style')||'';e.style.filter='none';e.style.transform='none';
          if(e.matches('canvas')) {e.style.visibility='hidden';e.previousElementSibling.style.opacity='1';}
          const frost=e.parentElement.querySelector('.scroll-lens-frost');if(frost)frost.style.visibility='hidden';
        });
        const plain=await page.screenshot({clip});
        await page.locator(affected).evaluate(e=>{
          e.setAttribute('style',e.dataset.lensStyle);delete e.dataset.lensStyle;
          if(e.matches('canvas'))e.previousElementSibling.style.opacity='0';
          const frost=e.parentElement.querySelector('.scroll-lens-frost');if(frost)frost.style.visibility='';
        });
        const difference=await delta(page,visible,plain);
        assert.ok(difference>1.2,'The '+edge+' edge changes actual pixels: '+difference);
        const corners=await readRenderedFrameCorners(page,'.case-sheet');
        assert.ok(corners.every(n=>n<12),'All four rendered corners reveal the backdrop: '+corners);
        assert.deepEqual(await page.locator('.case-sheet').boundingBox(),sheet,'The outside frame stays fixed');
        result.edges[edge]={difference,corners};
        await page.screenshot({path:dir+engine+'-'+name+'-'+edge+'.png'});
      }
      if(type==='links') {
        await page.locator(target).evaluate(e=>{const s=document.getSelection();s.removeAllRanges();const r=document.createRange();r.selectNodeContents(e);s.addRange(r);});
        await settle(page);
        assert.equal(await page.locator(target).evaluate(e=>e.style.filter),'','Selected text is native');
        await page.evaluate(()=>getSelection().removeAllRanges());
        await page.locator(target).evaluate(e=>e.closest('a').focus({preventScroll:true}));
        await page.keyboard.press('Shift+Tab');
        await page.locator(target).evaluate(e=>e.closest('a').focus({preventScroll:true}));
        await settle(page);
        assert.equal(await page.locator(target).evaluate(e=>e.style.filter),'','Focused link stays sharp');
        assert.equal(await page.locator(target).evaluate(e=>getComputedStyle(e.closest('a')).outlineStyle),'solid');
      }
      if(type==='player') {
        assert.equal(await page.locator('iframe').contentFrame().locator('video').evaluate(v=>v.paused),true,'The same paused fixture frame survives both edges');
        assert.equal(loads,1,'Scrolling does not reload or duplicate the browsing context');
        assert.equal(await page.locator('iframe').count(),1);
        assert.equal(await page.locator('iframe').getAttribute('data-original'),'yes');
        // Hit testing follows the projected browsing context, not an invisible copy.
        await page.locator('iframe').contentFrame().locator('button').click();
        assert.equal(await page.locator('iframe').contentFrame().locator('button').textContent(),'Clicked');
      }
      if(type==='video') assert.equal(await page.locator(selector).evaluate(v=>v.paused),true,'Manual pause survives both edges');
      // Exercise the site's real motion control while an effect is mounted.
      // Chromium's automation can update a fresh matchMedia read without delivering
      // change to existing listeners after screenshot capture. System preferences
      // are therefore verified on entry, independently from live control teardown.
      await page.locator('[data-motion-toggle]').first().evaluate(e=>e.click());
      await page.waitForFunction(()=>!document.querySelector('filter[id^="scroll-ink"],.scroll-lens-video,.scroll-lens-frost'));
      if(type==='player') assert.equal(await page.locator('iframe').evaluate(f=>f.style.transform),'');
      if(type==='video') assert.equal(await page.locator(selector).evaluate(v=>v.style.opacity),'');
      await page.locator('[data-motion-toggle]').first().evaluate(e=>e.click());
      await settle(page);
      await page.locator('[data-close-inspector]').click();
      await settle(page);
      assert.equal(await page.locator('filter[id^="scroll-ink"],.scroll-lens-video,.scroll-lens-frost').count(),0,'Closing clears all effect resources');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.goto(origin+'/?point='+point,{waitUntil:'load'});
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.reduceMotion),'true');
      assert.equal(await page.locator('filter[id^="scroll-ink"],.scroll-lens-video,.scroll-lens-frost').count(),0,'System reduced motion starts without optical layers');
      if(engine==='chromium') {
        await page.emulateMedia({reducedMotion:'no-preference',forcedColors:'active'});
        await page.reload({waitUntil:'load'});
        assert.equal(await page.evaluate(()=>matchMedia('(forced-colors: active)').matches),true);
        assert.equal(await page.locator('filter[id^="scroll-ink"],.scroll-lens-video,.scroll-lens-frost').count(),0,'Forced colors starts without optical layers');
      }
      assert.deepEqual(result.errors,[]);
    } catch(e) {
      result.status='FAIL';result.error=e.stack;result.diagnostic=await page.evaluate(()=>({reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,root:document.documentElement.dataset,filters:[...document.querySelectorAll('filter[id^="scroll-ink"]')].map(e=>e.id),effects:[...document.querySelectorAll('[style*="scroll-ink"]')].map(e=>({tag:e.tagName,cls:e.className,filter:e.style.filter})),scroll:(()=>{const s=document.querySelector('.case-scroll');return s&&{top:s.scrollTop,max:s.scrollHeight-s.clientHeight,rect:s.getBoundingClientRect().toJSON()};})()}));console.log(JSON.stringify(result.diagnostic));await page.screenshot({path:dir+engine+'-'+name+'-FAIL.png'}).catch(()=>{});
    } finally {await page.close();}
    report.push(result);console.log(result.status,engine,name,JSON.stringify(result.edges),result.error||'');
  }
} finally {await browser.close();if(local)await new Promise(r=>local.server.close(r));}
writeFileSync(dir+engine+'-scroll-lens.json',JSON.stringify(report,null,2)+'\n');
if(report.some(r=>r.status==='FAIL'))process.exitCode=1;
