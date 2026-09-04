import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require('playwright');
const {startStaticServer,waitForCaseLayout}=require('./browser-contracts.cjs');
const projectRoot=resolve(fileURLToPath(new URL('../',import.meta.url)));
const local=process.env.PORTFOLIO_CASE_ORIGIN?null:await startStaticServer({projectRoot});
const origin=process.env.PORTFOLIO_CASE_ORIGIN||local.origin;
const dir=(process.env.PORTFOLIO_UI_ARTIFACT_DIR||fileURLToPath(new URL('../.qa-artifacts/case-view/',import.meta.url)))+'/';
mkdirSync(dir,{recursive:true});
const report=[];
// WebKitGTK's scrollIntoView protocol can stall for a visible sticky media
// caption during playback. Use a real pointer after explicit actionability and
// hit-test checks; never force a click or invoke the DOM click handler directly.
const clickVisiblePlaybackControl=async(page)=>{
  await page.evaluate(()=>{delete window.__casePlaybackControl;});
  await page.waitForFunction(()=>{
    const button=document.querySelector('[data-case-pause]');
    if(!button)return false;
    const signature=JSON.stringify(button.getBoundingClientRect().toJSON());
    const previous=window.__casePlaybackControl;
    const frames=previous?.signature===signature?previous.frames+1:0;
    window.__casePlaybackControl={signature,frames};
    return frames>=3;
  });
  const state=await page.locator('[data-case-pause]').evaluate(button=>{
    const box=button.getBoundingClientRect();
    const clip=button.closest('.case-scroll').getBoundingClientRect();
    const style=getComputedStyle(button);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    return {x,y,box:box.toJSON(),label:button.textContent,
      visible:style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)>0&&box.width>0&&box.height>0,
      enabled:!button.disabled&&!button.closest('[inert]'),
      inside:box.left>=Math.max(0,clip.left)&&box.right<=Math.min(innerWidth,clip.right)&&box.top>=Math.max(0,clip.top)&&box.bottom<=Math.min(innerHeight,clip.bottom),
      hit:button.contains(document.elementFromPoint(x,y))};
  });
  assert.ok(state.visible&&state.enabled&&state.inside&&state.hit,JSON.stringify(state));
  await page.mouse.click(state.x,state.y);
  return state;
};
try {
for(const engine of [process.argv[2]||'chromium']) {
  assert.ok(['chromium','webkit'].includes(engine));
  const browser=await ({chromium,webkit})[engine].launch();
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  page.setDefaultTimeout(5000);
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
    assert.equal(await page.locator('.is-case-view').count(),0,'Personal view is the unmodified baseline');
    assert.equal(await page.locator('[data-map-title]').textContent(),'YOUTUBE');
    await page.goto(origin+'/?point=garage-site',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('[data-map-inspector]').dataset.selectedMapId);
    await waitForCaseLayout(page);
    await page.emulateMedia({reducedMotion:'no-preference'});
    // preload=metadata must not be required to decode a frame before playback.
    // Include public transfer time only after the setting permits video to play.
    await page.waitForFunction(()=>{const v=document.querySelector('.case-media video');return !v.paused&&v.currentTime>.15},undefined,{timeout:15000});
    result.playbackControls=[await clickVisiblePlaybackControl(page)];
    await page.waitForFunction(()=>document.querySelector('.case-media video').paused);
    const pausedAt=await page.locator('.case-media video').evaluate(v=>v.currentTime);
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.case-media video').evaluate(v=>v.paused),true);
    assert.ok(Math.abs(await page.locator('.case-media video').evaluate(v=>v.currentTime)-pausedAt)<.03);
    result.playbackControls.push(await clickVisiblePlaybackControl(page));
    await page.waitForFunction(time=>{const v=document.querySelector('.case-media video');return !v.paused&&Math.abs(v.currentTime-time)>.1;},pausedAt);
    result.playbackControls.push(await clickVisiblePlaybackControl(page));
    await page.waitForFunction(()=>document.querySelector('.case-media video').paused);
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
    assert.deepEqual(result.errors,[]);
  } catch(error) {
    result.status='FAIL';result.error=error.stack||error.message;
    result.lastState=await page.evaluate(()=>({
      active:document.activeElement?.outerHTML.slice(0,240),
      scroll:document.querySelector('.case-scroll')?.scrollTop,
      keyRegionFocused:document.activeElement===document.querySelector('.case-scroll'),
    })).catch(()=>null);
    await page.screenshot({path:dir+engine+'-flow-FAIL.jpg',type:'jpeg',quality:84}).catch(()=>{});
  }
  report.push(result);console.log(result.status,engine,result.error||'');
  await browser.close();
}
writeFileSync(dir+'flow-report-'+(process.argv[2]||'chromium')+'.json',JSON.stringify(report,null,2)+'\n');
if(report.some(result=>result.status==='FAIL'))process.exitCode=1;

} finally { if(local) await new Promise(resolve=>local.server.close(resolve)); }
