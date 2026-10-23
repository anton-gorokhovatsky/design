import {selectMapItem,mapButtons} from './map-engine.js';
import {getTabStops} from './preferences.js';
import {pane} from './pane-viewport.js';
import {observeScrollLens} from './viewport-ui.js';

const map=document.getElementById('map-pane'),story=document.getElementById('story-pane');
const bridge=document.getElementById('story-bridge');
const compact=matchMedia('(max-width:999px)'),reduce=matchMedia('(prefers-reduced-motion:reduce)');
const menu=map.querySelector('[data-constellation-nav]');
let focusPlane;
let opened=false,opener=null,readingPosition=0,loaded=false,loading,contentLoading,contentReady=false,activeTransition,showRevision=0;
observeScrollLens(story,()=>story.querySelectorAll('h1,h2,p,figcaption,.gravity-texture'),{
  owner:document.body,enabled:()=>opened&&!document.body.classList.contains('story-is-moving')
});
let readingAnchor=null,readingWidth=0,readingFrame=0,readingMetrics=[];
function anchorAt(scroll){
  const top=scroll+24,metric=readingMetrics.find(m=>m.top+m.height>top+1);
  if(metric)readingAnchor={element:metric.element,fraction:Math.max(0,(top-metric.top)/metric.height),gap:Math.max(0,metric.top-top)};
}
function rememberReading(){
  if(!opened||!loaded||document.body.classList.contains('story-is-moving'))return;
  const origin=story.getBoundingClientRect().top-story.scrollTop;
  readingMetrics=[...story.querySelectorAll('h1,h2,p,.scene,figcaption,.footer')].map(element=>{const rect=element.getBoundingClientRect();return {element,top:rect.top-origin,height:rect.height};});
  anchorAt(story.scrollTop);
  readingWidth=story.clientWidth;readingPosition=story.scrollTop;
}
function restoreReading(){
  if(!opened||!loaded||document.body.classList.contains('story-is-moving'))return;
  if(readingAnchor&&readingWidth!==story.clientWidth){
    if(story.scrollTop!==readingPosition)anchorAt(story.scrollTop);
    const {element,fraction,gap}=readingAnchor,rect=element.getBoundingClientRect();
    story.scrollTop+=rect.top+rect.height*fraction-story.getBoundingClientRect().top-24-gap;
  }
  rememberReading();
}
story.addEventListener('scroll',()=>{if(story.clientWidth===readingWidth)rememberReading();},{passive:true});
new ResizeObserver(()=>{if(readingFrame)return;readingFrame=requestAnimationFrame(()=>{readingFrame=0;restoreReading();});}).observe(story);
function sync(){
  const menuAbove=opened&&compact.matches&&menu.classList.contains('is-open');
  map.inert=false;story.inert=!opened||menuAbove;bridge.inert=!opened||menuAbove;
  document.body.classList.toggle('story-menu-open',menuAbove);
  if(menuAbove){
    menu.setAttribute('popover','manual');
    if(!menu.matches(':popover-open'))menu.showPopover();
  }else if(menu.hasAttribute('popover')){
    if(menu.matches(':popover-open'))menu.hidePopover();
    menu.removeAttribute('popover');
  }
  for(const entry of document.querySelectorAll('.map-about-trigger,[data-map-story],.map-story-link')){
    entry.setAttribute('aria-expanded',String(opened));entry.setAttribute('aria-controls','story-pane');
  }
  map.querySelector('.map-about-trigger')?.removeAttribute('popovertarget');
  const inspector=map.querySelector('.map-inspector.is-case-view');
  inspector?.setAttribute('aria-modal',String(!(opened&&!compact.matches)));
}
function renderStory(html){
  story.innerHTML='<div class="story-actions"><button type="button" class="ui-close" data-close-story data-material-surface="story-close" data-material-active="always" aria-label="Закрыть рассказ и вернуться к карте"><svg class="ui-close__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7 17 17M17 7 7 17"/></svg></button></div>'+html;
}
async function prepareStory(){
  if(contentReady)return;
  if(contentLoading)return contentLoading;
  renderStory('<div class="page"><p class="story-loading" role="status">Открываю рассказ…</p></div>');
  contentLoading=(async()=>{
    let style=document.querySelector('[data-story-style]'),styleReady=Promise.resolve();
    if(!style){style=document.createElement('link');style.rel='stylesheet';style.href=import.meta.resolve('../assets/map-story/story.css');style.dataset.storyStyle='';styleReady=new Promise((resolve,reject)=>{style.addEventListener('load',resolve,{once:true});style.addEventListener('error',reject,{once:true});});document.head.append(style);}
    const response=await fetch(import.meta.resolve('../assets/map-story/content.html'));
    if(!response.ok)throw new Error('story-content-'+response.status);
    const html=await response.text();await Promise.all([styleReady,import('../assets/map-story/focus.js').then(module=>{focusPlane=module.focusPlane;})]);renderStory(html);contentReady=true;
  })();
  try{await contentLoading;}finally{contentLoading=null;}
}
async function loadStory(transition,content){
  if(loaded)return;
  if(loading)return loading;
  loading=(async()=>{await content;await transition;await import('../assets/map-story/story.js');loaded=true;story.dataset.ready='true';})();
  try{await loading;}catch(error){
    renderStory('<div class="page"><p role="alert">Рассказ не загрузился. Можно попробовать ещё раз.</p><button type="button" class="text-link" data-story-retry>Повторить</button></div>');
    throw error;
  }finally{loading=null;}
}
function snapshotUnfold(apply){
  const previousBounds=story.getBoundingClientRect();
  document.body.classList.add('story-is-moving','story-uses-snapshot');
  const view=document.startViewTransition(()=>{apply();pane.refresh();});
  let svg,surface,frame=0,cancelled=false;
  const cleanup=()=>{cancelled=true;cancelAnimationFrame(frame);surface?.clear();svg?.remove();if(activeTransition===controller)document.body.classList.remove('story-is-moving','story-uses-snapshot');};
  const controller={skipTransition(){view.skipTransition();cleanup();}};activeTransition=controller;
  void view.ready.then(()=>{
    if(cancelled)return;
    svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width','0');svg.setAttribute('height','0');svg.setAttribute('aria-hidden','true');svg.style.position='absolute';document.body.append(svg);
    // The browser's viewport-sized image avoids repainting the live map each frame.
    surface=focusPlane(svg,story,{bounds:opened?story.getBoundingClientRect():previousBounds,portrait:compact.matches,attach:false});
    const start=performance.now(),opening=opened;
    const paint=()=>{const t=Math.min(1,(performance.now()-start)/420);surface.paint(Math.pow(opening?1-t:t,1.3));if(t<1)frame=requestAnimationFrame(paint);};paint();
  }).catch(()=>{});
  return view.finished.catch(()=>{}).then(cleanup);
}
function unfold(apply,value){
  const shell=document.getElementById('split-shell');
  // Keep line breaks stable while the window reveals the reading surface.
  const wasOpen=document.body.classList.contains('has-story-pane');
  document.body.classList.add('has-story-pane');
  const width=story.clientWidth,readingBounds=story.getBoundingClientRect();
  document.body.classList.toggle('has-story-pane',wasOpen);
  story.style.setProperty('--story-reading-width',width+'px');
  story.style.setProperty('--story-reading-unit',width/100+'px');
  story.style.setProperty('--story-reading-height',readingBounds.height+'px');story.style.setProperty('--story-reading-pane-width',readingBounds.width+'px');
  shell.getBoundingClientRect();
  document.body.classList.add('story-is-moving');
  document.body.classList.toggle('story-is-closing',!value);
  apply();
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width','0');svg.setAttribute('height','0');svg.setAttribute('aria-hidden','true');svg.style.position='absolute';document.body.append(svg);
  const surface=focusPlane(svg,story,{bounds:readingBounds,portrait:compact.matches});
  const timing={duration:420,easing:getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim(),fill:'both'};
  const clock=story.animate([{opacity:value?0:1},{opacity:value?1:0}],timing);
  const animations=[clock,...shell.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity)];
  let frame=0;
  const paint=()=>{const t=Math.min(1,Math.max(0,Number(clock.currentTime||0)/timing.duration));surface.paint(Math.pow(value?1-t:t,1.3));frame=requestAnimationFrame(paint);};
  paint();
  const cleanup=()=>{cancelAnimationFrame(frame);animations.forEach(a=>a.cancel());surface.clear();svg.remove();story.style.removeProperty('--story-reading-width');story.style.removeProperty('--story-reading-unit');story.style.removeProperty('--story-reading-height');story.style.removeProperty('--story-reading-pane-width');document.body.classList.remove('story-is-moving','story-is-closing');};
  activeTransition={skipTransition:cleanup};
  return Promise.all(animations.map(a=>a.finished.catch(()=>{}))).then(()=>{if(svg.isConnected)cleanup();});
}
async function show(value,{write=true,focus=true,animate=false}={}){
  const revision=++showRevision;
  if(!value&&opened){rememberReading();readingPosition=story.scrollTop;}
  const changed=opened!==value;opened=value;
  const moving=changed&&animate&&!reduce.matches&&document.documentElement.dataset.reduceMotion!=='true';
  activeTransition?.skipTransition();
  const content=value?prepareStory():Promise.resolve();void content.catch(()=>{});
  const apply=()=>{if(revision!==showRevision)return;document.body.classList.toggle('has-story-pane',value);map.dataset.materialActive=value?'always':'none';sync();};
  await content.catch(()=>{});
  if(revision!==showRevision)return;
  let transition;
  if(moving&&contentReady)transition=!compact.matches&&typeof document.startViewTransition==='function'?snapshotUnfold(apply):unfold(apply,value);
  else{apply();transition=Promise.resolve();}
  if(write&&changed){const url=new URL(location.href);if(value)url.searchParams.set('story','1');else url.searchParams.delete('story');history.pushState(history.state,'',url);}
  if(value){
    document.querySelector('[data-constellation-nav-toggle][aria-expanded="true"]')?.click();
    window.dispatchEvent(new CustomEvent('reading-surface-change'));
    try{await loadStory(transition,content);}catch{if(opened&&focus)story.focus({preventScroll:true});return;}
    if(!opened||revision!==showRevision)return;
    story.scrollTop=readingPosition;
    if(!readingPosition&&location.hash){const chapter=story.querySelector('[id="'+CSS.escape(location.hash.slice(1))+'"]');chapter?.scrollIntoView({block:'start'});}
    await transition;
    if(opened&&revision===showRevision){restoreReading();if(focus)(readingPosition?story:story.querySelector('h1')).focus({preventScroll:true});}
  }else if(focus&&changed){
    await transition;if(opened||revision!==showRevision)return;pane.refresh();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(opened||revision!==showRevision)return;
      const modal=map.querySelector('.map-inspector.is-case-view.is-open');
      const menuToggle=map.querySelector('[data-constellation-nav-toggle]');
      const entry=compact.matches?menuToggle:map.querySelector('.map-about-trigger');
      const origin=opener?.closest('[data-constellation-nav]')?menuToggle:opener;
      const target=modal?.querySelector('[data-close-inspector]')||(origin?.getClientRects().length&&getComputedStyle(origin).visibility!=='hidden'?origin:entry);
      target?.focus({preventScroll:true});
    }));
  }
}
document.addEventListener('click',event=>{
  const entry=event.target.closest('.map-about-trigger,[data-map-story],.map-story-link');
  if(entry&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();opener=entry;void show(true,{animate:event.detail>0});return;}
  if(event.target.closest('[data-close-story]')){event.preventDefault();void show(false,{animate:event.detail>0});return;}
  if(opened&&compact.matches&&map.contains(event.target)&&event.target.closest('[data-nav-view],[data-nav-utility],[data-open-settings]')){
    void show(false,{focus:false,animate:event.detail>0});
    return;
  }
  if(!story.contains(event.target))return;
  if(event.target.closest('[data-story-retry]')){void show(true,{write:false});return;}
  if(event.target.closest('[data-close-story],a[href="/?scene=map"]')){event.preventDefault();void show(false,{animate:event.detail>0});return;}
  const link=event.target.closest('a');if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const url=new URL(link.href),point=url.searchParams.get('point');
  if(point&&url.origin===location.origin){event.preventDefault();if(compact.matches)void show(false,{write:false,focus:false});selectMapItem(point,{reveal:true,updateHistory:true});if(compact.matches){const next=new URL(location.href);next.searchParams.delete('story');history.replaceState(history.state,'',next);}mapButtons.get(point)?.focus({preventScroll:true});}
},true);
bridge.addEventListener('keydown',event=>{if(opened&&event.key==='Escape'){event.preventDefault();void show(false);}});
story.addEventListener('keydown',event=>{if(opened&&event.key==='Escape'&&!event.defaultPrevented){event.stopPropagation();if(event.target.closest('.scene-target,.scene-readout'))return;event.preventDefault();void show(false);}});
window.addEventListener('popstate',()=>{void show(new URL(location.href).searchParams.has('story'),{write:false});});
compact.addEventListener('change',()=>{activeTransition?.skipTransition();document.body.classList.remove('story-is-moving','story-is-closing','story-uses-snapshot');sync();});
new MutationObserver(sync).observe(map.querySelector('.map-inspector'),{attributes:true,attributeFilter:['class']});
new MutationObserver(sync).observe(menu,{attributes:true,attributeFilter:['class']});
document.addEventListener('keydown',event=>{
  if(opened&&event.key==='Escape'&&!event.defaultPrevented&&(document.activeElement===opener||document.activeElement===document.body)){event.preventDefault();void show(false);return;}
  if(!opened||event.key!=='Tab'||event.defaultPrevented)return;
  const stops=getTabStops(document.body),index=stops.indexOf(document.activeElement);if(index<0)return;
  const next=stops[index+(event.shiftKey?-1:1)];
  if(next&&bridge.contains(next)){event.preventDefault();next.focus({preventScroll:true});}
},true);
void show(new URL(location.href).searchParams.has('story'),{write:false,focus:false});
