import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {mkdirSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const require=createRequire(import.meta.url);
const {startStaticServer,readMaterialAuditExpression}=require('./browser-contracts.cjs');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const engine=process.argv[2]||'chromium';
const {origin,server}=await startStaticServer({projectRoot:root});
const browser=await({chromium,webkit}[engine]).launch();
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},colorScheme:width===1440?'light':'dark'});
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(origin+'/');
  const entry=page.locator(width===1440?'.map-about-trigger':'.map-story-link');
  const openStory=async()=>{if(width===390)await page.locator('[data-constellation-nav-toggle]').click();await entry.click();};
  assert.equal(requests.some(url=>url.includes('/assets/map-story/')),false,'Scenes wait for the reader');
  await page.evaluate(()=>document.fonts.ready);
  const mapGeometry=()=>page.locator('[data-floating-console]').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
  const originalGeometry=await mapGeometry();
  if(width===390)await page.locator('[data-constellation-nav-toggle]').click();
  await entry.waitFor({state:'visible'});
  await entry.focus();await page.keyboard.press('Enter');
  const story=page.locator('#story-pane');await page.waitForSelector('#story-pane[data-ready="true"]');
  await page.waitForFunction(()=>document.activeElement?.id==='story-title');
  assert.equal(await story.evaluate(e=>e.inert),false);
  const materials=await page.evaluate(readMaterialAuditExpression);
  assert.equal(materials.active.filter(s=>s.surface.startsWith('paired-')).length,2,'Both panes register the shared material');
  assert.deepEqual(materials.failures,[],'The paired composition shares one glass recipe without nested material ancestors');
  if(width===390){
   const menu=page.locator('[data-constellation-nav-toggle]');
   await menu.click();
   await page.waitForFunction(()=>document.querySelector('[data-constellation-nav]').matches(':popover-open'));
   assert.equal(await story.evaluate(e=>e.inert),true,'Only the reader rests behind the menu');
   const menuItem=page.locator('[data-nav-view="contact"]');
   await menuItem.click({trial:true});
   assert.equal(await menuItem.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'The menu remains clickable outside the top pane');
   await page.keyboard.press('Escape');
   await page.waitForFunction(()=>!document.querySelector('#story-pane').inert);
   assert.equal(new URL(page.url()).searchParams.has('story'),true,'Closing the menu preserves the story');
   await story.locator('h1').focus();
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(selector=>document.activeElement?.matches(selector),width===1440?'.map-about-trigger':'[data-constellation-nav-toggle]');
  // Three complete roundtrips catch accumulated offsets from hidden panels.
  for(let round=0;round<3;round++){
   await openStory();await page.waitForFunction(()=>!document.querySelector('#story-pane').inert);
   await page.locator('#story-pane [data-close-story]').click();
   await page.waitForFunction(()=>!document.body.classList.contains('story-is-moving'));
   await page.waitForFunction(selector=>document.activeElement?.matches(selector),width===1440?'.map-about-trigger':'[data-constellation-nav-toggle]');
   const geometry=await mapGeometry();
   geometry.forEach((box,i)=>Object.keys(box).forEach(key=>assert.ok(Math.abs(box[key]-originalGeometry[i][key])<1,`Closing restores panel ${i} ${key}: ${box[key]} vs ${originalGeometry[i][key]}`)));
  }
  await openStory();await page.waitForFunction(()=>!document.querySelector('#story-pane').inert);
  await page.waitForFunction(()=>!document.body.classList.contains('story-is-moving'));
  assert.equal(await page.locator('.story-nav,#story-motion').count(),0,'The reader has no duplicate settings bar');
  assert.equal(await story.locator('footer,#share-story').count(),0,'The reader does not duplicate the visible map or expose sharing');
  const paragraph=story.locator('.intro p').last();
  await paragraph.evaluate(e=>{const s=e.closest('#story-pane');s.scrollTop+=e.getBoundingClientRect().top-s.getBoundingClientRect().top-12;});
  await page.waitForFunction(()=>document.querySelector('.intro p:last-child').style.filter.includes('scroll-ink'));
  await story.evaluate(e=>e.scrollTop=0);
  const panels=await page.locator('#map-pane,#story-pane').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};}));
  assert.ok(width>999?panels[1].x>panels[0].x+panels[0].w:panels[1].y>panels[0].y+panels[0].h,'The shared bridge joins both visible panes');
  await page.evaluate(()=>document.querySelector('[data-motion-toggle]').click());assert.equal(await page.locator('html').getAttribute('data-reduce-motion'),'true');
  await page.evaluate(()=>document.querySelector('[data-motion-toggle]').click());assert.equal(await page.locator('html').getAttribute('data-reduce-motion'),null);
  await page.locator('#practice').evaluate(e=>e.scrollIntoView());
  if(width===1440){
   const chapterOffset=()=>page.locator('#practice').evaluate(e=>e.getBoundingClientRect().top-document.querySelector('#story-pane').getBoundingClientRect().top);
   const offset=await chapterOffset();
   for(const nextWidth of [390,1440]){
    await page.setViewportSize({width:nextWidth,height:900});
    await page.waitForFunction(y=>Math.abs(document.querySelector('#practice').getBoundingClientRect().top-document.querySelector('#story-pane').getBoundingClientRect().top-y)<2,offset);
    assert.ok(Math.abs(await chapterOffset()-offset)<2,'Resizing retains the chapter being read');
   }
  }
  const target=page.locator('#scene-practice button[data-point="tarski"]');await target.focus();await target.press('Enter');
  assert.deepEqual((await page.evaluate(readMaterialAuditExpression)).failures,[],'Scene readouts keep the same material without a filtered ancestor');
  const label=page.locator('#scene-practice .scene-readout.is-visible');await label.locator('a').focus();await label.locator('a').press('Escape');
  assert.equal(await story.evaluate(e=>e.inert),false);assert.equal(await label.count(),0);
  await target.press('Enter');const scroll=await story.evaluate(e=>e.scrollTop);
  await page.locator('#scene-practice .scene-readout a').click();
  assert.equal(new URL(page.url()).searchParams.get('point'),'tarski');
  assert.equal(await page.locator('#map-pane').evaluate(e=>e.inert),false);
  await page.waitForSelector('.map-inspector.is-case-view.is-open');
  if(width===1440){
   await page.waitForFunction(()=>document.querySelector('.map-inspector').getAttribute('aria-modal')==='false');
   await page.evaluate(async()=>{const{getTabStops}=await import('/js/preferences.js');getTabStops(document.querySelector('.map-inspector')).at(-1).focus({preventScroll:true});});
   await page.keyboard.press('Tab');assert.equal(await page.locator('#story-bridge').evaluate(e=>e.contains(document.activeElement)),true,'Tab leaves the map through the shared return control');
   assert.ok(Math.abs(await story.evaluate(e=>e.scrollTop)-scroll)<2,'Tab preserves reading position');
   const close=await page.locator('#story-pane [data-close-story]').boundingBox();await page.mouse.click(close.x+close.width/2,close.y+close.height/2);
   await page.waitForFunction(()=>document.activeElement?.matches('[data-close-inspector]'));
   await page.keyboard.press('Escape');await openStory();
   await page.waitForFunction(y=>Math.abs(document.querySelector('#story-pane').scrollTop-y)<2,scroll);
  }else{
   assert.equal(await story.evaluate(e=>e.inert),true);await page.goBack();await page.waitForFunction(()=>!document.querySelector('#story-pane').inert);
  }
  await page.waitForFunction(()=>!document.body.classList.contains('story-is-moving'));
  assert.equal(await story.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  assert.deepEqual(errors,[]);
  if(process.env.PORTFOLIO_UI_ARTIFACT_DIR){mkdirSync(process.env.PORTFOLIO_UI_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.PORTFOLIO_UI_ARTIFACT_DIR,`story-${width}.png`)});}
  await page.close();
 }
 // Always-visible periods must fit together, including the narrowest map.
 for (const width of [1440,390,320]) {
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  await page.goto(origin+'/?scene=map&view=time#map');
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>!document.querySelector('[data-map-links]').hasAttribute('data-layout-pending'));
  const captions=await page.locator('[data-time-anchor]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.mapLabelId,left:r.left,top:r.top,right:r.right,bottom:r.bottom,opacity:getComputedStyle(e).opacity};}));
  assert.equal(captions.length,5);
  for(const [i,a] of captions.entries()){
   assert.equal(a.opacity,'1');
   assert.ok(a.left>=0&&a.right<=width,`${a.id} remains inside ${width}px`);
   for(const b of captions.slice(i+1))assert.ok(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom,`${a.id} and ${b.id} remain separate at ${width}px`);
  }
  await page.close();
 }
 const failedOpening=await browser.newPage({viewport:{width:390,height:844}});
 const retryErrors=[];failedOpening.on('pageerror',error=>retryErrors.push(error.message));
 let failedOpeningOnce=false;await failedOpening.route('**/assets/map-story/content.html*',route=>{if(!failedOpeningOnce){failedOpeningOnce=true;return route.fulfill({status:503,body:'Unavailable'});}return route.continue();});
 await failedOpening.goto(origin+'/');await failedOpening.locator('[data-constellation-nav-toggle]').click();await failedOpening.locator('.map-story-link').click();await failedOpening.locator('[data-story-retry]').click();await failedOpening.waitForSelector('#story-pane[data-ready="true"]');
 assert.deepEqual(retryErrors,[],'A failed first opening keeps the retry usable');
 assert.equal(await failedOpening.locator('body').evaluate(e=>e.classList.contains('story-is-moving')),false);
 await failedOpening.close();
 const retry=await browser.newPage({viewport:{width:320,height:700},reducedMotion:'reduce'});
 let failed=false;await retry.route('**/assets/map-story/content.html*',route=>{if(!failed){failed=true;return route.fulfill({status:503,body:'Unavailable'});}return route.continue();});
 await retry.goto(origin+'/?story=1');await retry.locator('[data-story-retry]').click();await retry.waitForSelector('#story-pane[data-ready="true"]');
 await retry.evaluate(()=>document.documentElement.style.fontSize='200%');
 await retry.waitForFunction(()=>document.documentElement.dataset.reduceMotion==='true');
 assert.equal(await retry.locator('#story-motion').count(),0);
 assert.equal(await retry.locator('#story-pane').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 // A stacked map remains a usable window when the author card needs more room.
 await retry.setViewportSize({width:320,height:568});
 await retry.locator('#scene-time').evaluate(e=>e.scrollIntoView());
 await retry.locator('#scene-time .scene-year').first().waitFor({state:'visible'});
 assert.ok(await retry.locator('#scene-time .scene-year').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=24),'Year labels enlarge with the 200% text preference');
 assert.equal(await retry.locator('#story-pane').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 const dataLink=retry.locator('.whoop-compact-trigger');
 await retry.keyboard.press('Tab');await dataLink.focus();
 await retry.waitForFunction(()=>{
  const target=document.querySelector('.whoop-compact-trigger'),r=target.getBoundingClientRect();
  const pane=document.querySelector('#map-pane').getBoundingClientRect();
  return r.top>=pane.top&&r.bottom<=pane.bottom&&target.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
 });
 await retry.keyboard.press('Enter');
 await retry.waitForFunction(()=>document.querySelector('.settings-panel').contains(document.activeElement));
 await retry.keyboard.press('Escape');
 await retry.waitForFunction(()=>{
  const target=document.querySelector('.whoop-compact-trigger'),r=target.getBoundingClientRect();
  return target===document.activeElement&&target.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
 });
 await retry.close();
 console.log(`Map story ${engine}: repeated geometry roundtrip, joined responsive panes, visible entry, lazy scenes, shared motion, nearby labels, case return, keyboard, retry and 320px/200% passed.`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
