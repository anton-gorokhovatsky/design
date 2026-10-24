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
async function checkFamilies(page){
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>document.documentElement.dataset.reduceMotion==='true');
 await page.locator('#scene-time').evaluate(e=>e.scrollIntoView());
 await page.locator('[data-layout="map"]').check();
 const failures=await page.locator('#scene-time').evaluate(async scene=>{
  const {mapItems}=await import('/js/map-data.js');
  const button=id=>scene.querySelector(`[data-point="${id}"]`),center=id=>{const r=button(id).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};};
  const p=center('private-practice'),w=scene.clientWidth;
  return mapItems.filter(item=>item.id!=='private-practice'&&item.parent!=='private-practice')
   .filter(item=>{const q=center(item.id);return Math.abs(q.x-p.x)<w*.15+4&&Math.abs(q.y-p.y)<w*.105+4;}).map(item=>({id:item.id,relative:{x:center(item.id).x-p.x,y:center(item.id).y-p.y},scene:{w,h:scene.clientHeight}}));
 });
 assert.deepEqual(failures,[],'Foreign families stay outside the full private-practice orbits');
 if(page.viewportSize().width>=390)assert.equal(await page.locator('#scene-time .scene-label').evaluateAll(labels=>labels.filter(e=>+getComputedStyle(e).opacity>.9).length),5,'All principal captions remain visible in the spatial scene');
 await page.locator('[data-layout="time"]').check();
 const remote=await page.locator('#scene-time').evaluate(scene=>{
  const ids=['garage','early-career','ilmix','private-practice','optimal','running'];
  return [...scene.querySelectorAll('.scene-label')].flatMap((label,i)=>{
   if(+getComputedStyle(label).opacity<.9)return [];
   const a=label.getBoundingClientRect(),b=scene.querySelector(`[data-point="${ids[i]}"]`).getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;
   const gap=Math.hypot(Math.max(a.x-x,0,x-a.right),Math.max(a.y-y,0,y-a.bottom));
   return gap>(ids[i]==='garage'?scene.clientWidth*.12+30:scene.clientWidth*.035+30)?[{id:ids[i],gap}]:[];
  });
 });
 assert.deepEqual(remote,[],'Captions remain close to their own visible object, including the glow');
}
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900},colorScheme:width===1440?'light':'dark'});
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto(origin+'/');
  const entry=page.locator(width===1440?'.map-about-trigger':'.map-story-link');
  const openStory=async()=>{if(width===390)await page.locator('[data-constellation-nav-toggle]').click();await entry.click();};
  assert.equal(requests.some(url=>url.includes('/assets/map-story/')),false,'Scenes wait for the reader');
  await page.evaluate(()=>document.fonts.ready);
  // Compare the same loaded day state before and after opening the story.
  // The pending readout is one metrics line shorter on a compact screen.
  await page.waitForFunction(()=>document.querySelector('[data-whoop-recovery]')?.textContent.includes('77'));
  const mapGeometry=()=>page.locator('[data-floating-console]').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
  const originalGeometry=await mapGeometry();
  if(width===390)await page.locator('[data-constellation-nav-toggle]').click();
  await page.locator('[data-nav-view="map"]').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.activeElement?.id==='map');
  if(width===390){
   await page.locator('[data-constellation-nav-toggle]').click();
   assert.equal(await page.locator('[data-nav-view="map"] .constellation-nav__label').evaluate(e=>getComputedStyle(e).textDecorationLine),'none','The current Map uses color without an underline in compact navigation');
  }
  await entry.waitFor({state:'visible'});
  await entry.focus();await page.keyboard.press('Enter');
  const story=page.locator('#story-pane');await page.waitForSelector('#story-pane[data-ready="true"]');
  await page.waitForFunction(()=>document.activeElement?.id==='story-title');
  assert.equal(await story.evaluate(e=>e.inert),false);
  await page.waitForFunction(()=>!document.body.classList.contains('story-is-moving'));
  const menuStory=page.locator('.map-story-link');
  assert.equal(await menuStory.getAttribute('aria-current'),'page','The open story is the current destination');
  assert.equal(await page.locator('[data-constellation-nav] [aria-current]').count(),1,'The menu has one current destination');
  assert.equal(await menuStory.getAttribute('href'),'?story=1','The current destination keeps a real address');
  const mapAddress=new URL(await page.locator('[data-nav-view="map"]').getAttribute('href'),origin);
  assert.equal(mapAddress.searchParams.has('story'),false,'The Map address itself returns the whole map');
  assert.equal(mapAddress.hash,'#map');
  for(const method of ['pointer','keyboard']){
   await story.evaluate(e=>e.scrollTop=480);
   const readingPosition=await story.evaluate(e=>e.scrollTop),address=page.url(),historyLength=await page.evaluate(()=>history.length);
   await page.locator('[data-constellation-nav-toggle]').click();
   assert.equal(await menuStory.locator('span').evaluate(e=>getComputedStyle(e).textDecorationLine),'none','The current story keeps the compact menu free of underlines');
   if(method==='pointer')await menuStory.click();else{await menuStory.focus();await page.keyboard.press('Enter');}
   await page.waitForFunction(()=>document.activeElement?.id==='story-pane');
   assert.equal(await page.locator('[data-constellation-nav-toggle]').getAttribute('aria-expanded'),'false','Returning to the current story closes its menu');
   assert.ok(Math.abs(await story.evaluate(e=>e.scrollTop)-readingPosition)<1,'Returning to the current story preserves reading position');
   assert.equal(page.url(),address,'Returning to the current story keeps its address');
   assert.equal(await page.evaluate(()=>history.length),historyLength,'Returning to the current story adds no history entry');
   assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('story-is-moving')),false,'Returning to the current story starts no opening animation');
  }
  await story.evaluate(e=>e.scrollTop=0);
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
  assert.equal(await menuStory.getAttribute('aria-current'),null,'Closing the story removes its current state');
  await page.goBack();await page.waitForFunction(()=>document.body.classList.contains('has-story-pane'));
  assert.equal(await menuStory.getAttribute('aria-current'),'page','Back restores the current story');
  await page.goForward();await page.waitForFunction(()=>!document.body.classList.contains('has-story-pane'));
  assert.equal(await menuStory.getAttribute('aria-current'),null,'Forward restores the closed story');
  await openStory();await page.waitForFunction(()=>!document.body.classList.contains('story-is-moving'));
  await page.locator('[data-constellation-nav-toggle]').click();
  const mapLink=page.locator('[data-nav-view="map"]');
  await mapLink.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!document.body.classList.contains('has-story-pane')&&!document.body.classList.contains('story-is-moving'));
  await page.waitForFunction(()=>document.activeElement?.id==='map');
  assert.equal(new URL(page.url()).searchParams.has('story'),false,'Map navigation returns the map to the whole window');
  assert.equal(new URL(page.url()).hash,'#map','Map navigation synchronizes the address');
  assert.equal(await mapLink.getAttribute('aria-current'),'page','Map becomes current after returning');
  assert.equal(await menuStory.getAttribute('aria-current'),null);
  await page.goBack();await page.waitForFunction(()=>document.body.classList.contains('has-story-pane'));
  assert.equal(await menuStory.getAttribute('aria-current'),'page','Back from Map restores the story destination');
  await page.goForward();await page.waitForFunction(()=>!document.body.classList.contains('has-story-pane'));
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
  const neighbor=await page.locator('#scene-practice button[data-point]:not([data-point="tarski"])').evaluateAll(nodes=>nodes.map(e=>{
   const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
   return e.contains(document.elementFromPoint(x,y))?{x,y}:null;
  }).find(Boolean));
  assert.ok(neighbor,'Another visible satellite is available for the pointer path');
  await page.mouse.move(neighbor.x,neighbor.y);
  assert.equal(new URL(await page.locator('#scene-practice .scene-readout a').getAttribute('href')).searchParams.get('point'),'tarski','Incidental hover cannot replace an explicitly selected project link');
  await page.locator('#scene-practice .scene-readout a').click();
  assert.equal(new URL(page.url()).searchParams.get('point'),'tarski');
  assert.equal(await page.locator('#map-pane').evaluate(e=>e.inert),false);
  await page.waitForSelector('.map-inspector.is-case-view.is-open');
  await page.waitForFunction(()=>document.activeElement?.matches('.map-inspector h2'));
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
  await checkFamilies(page);
  if(width===1440){
   await page.goto(origin+'/?story=1&view=time&filter=project#map');await page.waitForSelector('#story-pane[data-ready="true"]');
   const mapDestination=await page.locator('[data-nav-view="map"]').getAttribute('href');
   const mapDestinationUrl=new URL(mapDestination,origin);
   assert.equal(mapDestinationUrl.searchParams.has('story'),false);
   assert.equal(mapDestinationUrl.searchParams.get('view'),'time','The real Map address retains the map mode');
   assert.equal(mapDestinationUrl.searchParams.get('filter'),'project','The real Map address retains the map filter');
   await page.goto(mapDestinationUrl.href);
   assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('has-story-pane')),false,'Opening the real Map address does not reopen the story');
   assert.equal(await page.locator('[data-map-filter="project"]').getAttribute('aria-pressed'),'true','The retained project filter is really selected');
   assert.equal(await page.locator('[data-map-filter="all"]').getAttribute('aria-pressed'),'false');
   await page.goto(origin+'/?story=1#work');await page.waitForSelector('#story-pane[data-ready="true"]');
   assert.equal(await page.locator('[data-nav-view="work"]').getAttribute('aria-current'),'page','A parallel section keeps its current destination');
   assert.equal(await menuStory.getAttribute('aria-current'),null,'An expanded parallel story does not compete with the current section');
   assert.equal(await menuStory.getAttribute('aria-expanded'),'true');
   await page.locator('[data-close-panel]').click();
   assert.equal(await menuStory.getAttribute('aria-current'),'page','Closing the parallel section restores the story destination');
  }
  // A section and the reader form one navigation history, including direct entries.
  for(const view of ['work','approach','contact']){
   await page.goto(origin+'/?story=1#map');await page.waitForSelector('#story-pane[data-ready="true"]');
   await story.evaluate(e=>e.scrollTop=450);
   await page.locator('[data-constellation-nav-toggle]').click();
   await page.locator(`[data-nav-view="${view}"]`).click();
   await page.waitForSelector(`[data-content-panel].is-open[data-view="${view}"]`);
   if(width===390){
    await page.waitForFunction(()=>!document.body.classList.contains('has-story-pane'));
    assert.equal(new URL(page.url()).searchParams.has('story'),false);
    await page.goBack();await page.waitForFunction(()=>document.body.classList.contains('has-story-pane'));
    await page.waitForFunction(()=>Math.abs(document.querySelector('#story-pane').scrollTop-450)<2);
    await page.goForward();await page.waitForSelector(`[data-content-panel].is-open[data-view="${view}"]`);
    await page.waitForFunction(()=>!document.body.classList.contains('has-story-pane'));
   }else{
    await page.locator('#story-pane [data-close-story]').click();
    await page.waitForFunction(()=>document.activeElement?.matches('[data-close-panel]'));
    assert.equal(await page.locator('[data-content-panel]').getAttribute('data-view'),view);
   }
   await page.locator('[data-close-panel]').click();
   await page.waitForFunction(()=>document.activeElement!==document.body&&!document.activeElement?.closest('[inert]'));
   await page.goto(origin+'/?story=1#'+view);
   await page.waitForSelector(`[data-content-panel].is-open[data-view="${view}"]`);
   if(width===390){
    assert.equal(new URL(page.url()).searchParams.has('story'),false,'A narrow composite address resolves to its section');
    assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('has-story-pane')),false);
   }else await page.waitForSelector('#story-pane[data-ready="true"]');
   await page.locator('[data-close-panel]').click();
   await page.waitForFunction(()=>document.activeElement!==document.body&&!document.activeElement?.closest('[inert]'));
  }
  if(width===390)for(const point of ['principle-wings','garage-site']){
   await page.goto(origin+'/?story=1&point='+point);
   await page.waitForSelector('.map-inspector.is-open');
   assert.equal(new URL(page.url()).searchParams.has('story'),false,'A narrow point address exposes the selected card');
   assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('has-story-pane')),false);
   await page.locator('[data-close-inspector]').click();
  }
  if(process.env.PORTFOLIO_UI_ARTIFACT_DIR){mkdirSync(process.env.PORTFOLIO_UI_ARTIFACT_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.PORTFOLIO_UI_ARTIFACT_DIR,`story-${width}.png`)});}
  await page.close();
 }
 // Short fields retain readable endpoints and full point descriptions at 200% text.
 const enlarged=await browser.newPage({viewport:{width:320,height:568},reducedMotion:'reduce'});
 await enlarged.goto(origin+'/?qa&font=200&scene=map&view=time#map');
 await enlarged.evaluate(()=>document.fonts.ready);
 await enlarged.waitForFunction(()=>!document.querySelector('[data-map-links]').hasAttribute('data-layout-pending'));
 assert.equal(await enlarged.locator('.orbital-radar i span:visible').count(),2);
 await enlarged.locator('[data-map-id="ilmix"]').focus();await enlarged.keyboard.press('Enter');
 await enlarged.locator('.point-preview:not([hidden])').waitFor();
 assert.equal(await enlarged.locator('.point-preview h2').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'A large-text point title stays readable beside or below its logo');
 await enlarged.close();
 // Visible glyph centres share the menu axis at every supported compact/text size.
 const axisPage=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 for(const width of [320,390,430])for(const font of [100,200]){
  await axisPage.setViewportSize({width,height:844});
  await axisPage.goto(origin+'/?qa&font='+font+'&story=1#map');
  await axisPage.waitForSelector('#story-pane[data-ready="true"]');
  await axisPage.waitForFunction(()=>{
   const menu=document.querySelector('.constellation-nav__cluster').getBoundingClientRect();
   const close=document.querySelector('#story-pane .story-actions path').getBoundingClientRect();
   return Math.abs(menu.x+menu.width/2-close.x-close.width/2)<1;
  }).catch(async error=>{
   console.error('Story axis',width,font,await axisPage.evaluate(()=>{
    const story=document.querySelector('#story-pane');
    return {pane:story.getBoundingClientRect().toJSON(),clientWidth:story.clientWidth,inset:story.style.getPropertyValue('--story-close-inset'),
     menu:document.querySelector('.constellation-nav__cluster').getBoundingClientRect().toJSON(),close:story.querySelector('.story-actions path').getBoundingClientRect().toJSON()};
   }));
   throw error;
  });
  const axis=await axisPage.evaluate(()=>{
   const menu=document.querySelector('.constellation-nav__cluster').getBoundingClientRect();
   const close=document.querySelector('#story-pane .story-actions path').getBoundingClientRect();
   const button=document.querySelector('#story-pane .story-actions button').getBoundingClientRect();
   return {delta:Math.abs(menu.x+menu.width/2-close.x-close.width/2),left:button.left,right:button.right,width:button.width,height:button.height};
  });
  assert.ok(axis.delta<1,'Story close follows the unchanged menu glyph axis');
  assert.ok(axis.left>=0&&axis.right<=width&&axis.width>=44&&axis.height>=44,'The aligned close keeps its complete touch target inside the viewport');
 }
 // A reserved scrollbar consumes reading width on Linux even when macOS uses an overlay.
 await axisPage.setViewportSize({width:320,height:844});
 await axisPage.goto(origin+'/?qa&font=200&story=1#map');
 await axisPage.waitForSelector('#story-pane[data-ready="true"]');
 await axisPage.addStyleTag({content:'#story-pane::-webkit-scrollbar{width:16px}'});
 await axisPage.evaluate(()=>window.dispatchEvent(new Event('resize')));
 await axisPage.waitForFunction(()=>{
  const menu=document.querySelector('.constellation-nav__cluster').getBoundingClientRect();
  const close=document.querySelector('#story-pane .story-actions path').getBoundingClientRect();
  return Math.abs(menu.x+menu.width/2-close.x-close.width/2)<1;
 });
 assert.equal(await axisPage.locator('#story-pane').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'The aligned target fits the reading area beside a reserved scrollbar');
 assert.ok(await axisPage.locator('#story-pane [data-close-story]').evaluate(e=>e.clientWidth>=44&&e.clientHeight>=44));
 await axisPage.close();
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
 await retry.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 assert.equal(await retry.locator('#story-motion').count(),0);
 assert.equal(await retry.locator('#story-pane').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 await checkFamilies(retry);
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
