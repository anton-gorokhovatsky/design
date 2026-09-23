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
      if(type==='image') {
        await page.locator(selector).evaluate(i=>i.decode());
        assert.equal(await page.locator('.personal-media__play').evaluate(e=>getComputedStyle(e,'::after').backgroundColor),'rgb(255, 255, 255)','The play glyph remains legible on the same dark poster in both themes');
      }
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
        // Compare the former side padding, not just pixels inside the picture.
        // An in-place stretch can pass the latter while missing the reference.
        const gap=bounds.x-port.x, flareClips=type!=='links' && gap>=12 ? [
          {x:port.x+gap-10,y:edge==='top'?port.y+18:port.y+port.height-34,width:8,height:16},
          {x:port.x+port.width-gap+2,y:edge==='top'?port.y+18:port.y+port.height-34,width:8,height:16},
        ] : [];
        const flared=[];
        for(const clip of flareClips) flared.push(await page.screenshot({clip}));
        const visible=await page.screenshot({clip});
        await page.locator(affected).evaluate(e=>{
          e.dataset.lensStyle=e.getAttribute('style')||'';e.style.filter='none';e.style.transform='none';
          if(e.matches('canvas')) {e.style.visibility='hidden';e.closest('.case-scroll').querySelector('video, [data-personal-media-poster]').style.opacity='1';}
          const frost=e.parentElement.querySelector('.scroll-lens-frost');if(frost)frost.style.visibility='hidden';
        });
        const plain=await page.screenshot({clip});
        const padding=[];
        for(const clip of flareClips) padding.push(await page.screenshot({clip}));
        await page.locator(affected).evaluate(e=>{
          e.setAttribute('style',e.dataset.lensStyle);delete e.dataset.lensStyle;
          if(e.matches('canvas'))e.closest('.case-scroll').querySelector('video, [data-personal-media-poster]').style.opacity='0';
          const frost=e.parentElement.querySelector('.scroll-lens-frost');if(frost)frost.style.visibility='';
        });
        const difference=await delta(page,visible,plain);
        assert.ok(difference>1.2,'The '+edge+' edge changes actual pixels: '+difference);
        const flare=[];
        for(let i=0;i<flared.length;i++) {
          flare.push(await delta(page,flared[i],padding[i]));
          // The original poster's near-black sides meet a near-black dark theme.
          // Verify painted coverage too, instead of requiring an invented contrast.
          if(type==='image') {
            const coverage=await page.locator(affected).evaluate((c,r)=>{
              const b=c.getBoundingClientRect(),x=c.width/b.width,y=c.height/b.height;
              const pixels=c.getContext('2d').getImageData(Math.round((r.x-b.x)*x),Math.round((r.y-b.y)*y),Math.round(r.width*x),Math.round(r.height*y)).data;
              let painted=0;for(let n=3;n<pixels.length;n+=4)if(pixels[n]>200)painted++;
              return painted/(pixels.length/4);
            },flareClips[i]);
            assert.ok(coverage>.7,'Image pixels occupy the former side padding: '+coverage);
          }
          assert.ok(flare[i]>(type==='image'?2:10),'The picture fills the former '+(i?'right':'left')+' padding at the '+edge+' edge: '+flare[i]);
        }
        const corners=await readRenderedFrameCorners(page,'.case-sheet');
        assert.ok(corners.every(n=>n<12),'All four rendered corners reveal the backdrop: '+corners);
        assert.deepEqual(await page.locator('.case-sheet').boundingBox(),sheet,'The outside frame stays fixed');
        result.edges[edge]={difference,flare,corners};
        if(type==='image') {
          const play=page.locator('.personal-media__play'), b=await play.boundingBox();
          const glyph={x:b.x+b.width/2-8,y:b.y+b.height/2-10,width:18,height:20};
          const shown=await page.screenshot({clip:glyph});
          await play.evaluate(e=>e.style.visibility='hidden');
          const underneath=await page.screenshot({clip:glyph});
          await play.evaluate(e=>e.style.visibility='');
          assert.ok(await delta(page,shown,underneath)>30,'The play glyph is painted above the refracted picture');
        }
        await page.screenshot({path:dir+engine+'-'+name+'-'+edge+'.png'});
      }
      if(type==='image') {
        // A picture that ends inside the viewport must retain its own rounded
        // corner. The earlier contour collapsed that radius into pointed ears.
        result.innerCorners=[];
        for(const edge of ['top','bottom']) {
          await align(page,selector,edge,-18);
          const corner=await page.locator(selector).evaluate((picture,edge)=>{
            const c=picture.closest('.case-scroll').querySelector('.scroll-lens-video');
            const r=picture.getBoundingClientRect(),p=c.getBoundingClientRect(),d=c.width/p.width;
            const end=edge==='top'?r.top-p.top:r.bottom-p.top;
            const scan=distance=>{
              const y=Math.floor((end+(edge==='top'?distance:-distance))*d);
              const row=c.getContext('2d').getImageData(0,y,c.width,1).data;
              const x=[];for(let n=3;n<row.length;n+=4)if(row[n]>200)x.push((n-3)/4/d);
              return [x[0],x.at(-1)];
            };
            const tip=scan(1),body=scan(16);
            return {left:tip[0]-body[0],right:body[1]-tip[1],background:getComputedStyle(picture.parentElement).backgroundColor};
          },edge);
          assert.ok(corner.left>8 && corner.right>8,'The '+edge+' picture corners stay rounded: '+JSON.stringify(corner));
          assert.equal(corner.background,'rgba(0, 0, 0, 0)','No straight background remains behind the flared picture');
          result.innerCorners.push({edge,...corner});
        }
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
        await page.locator('[data-close-personal-media]').focus();
        await page.keyboard.press('Tab');
        await settle(page);
        assert.equal(await page.locator('iframe').evaluate(f=>f===document.activeElement),true,'Keyboard enters the original player');
        assert.equal(await page.locator('iframe').evaluate(f=>f.style.transform),'','Keyboard playback controls remain undistorted');
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
