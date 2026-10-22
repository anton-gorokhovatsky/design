import {selectMapItem,mapButtons} from './map-engine.js';
import {getTabStops} from './preferences.js';
import {pane} from './pane-viewport.js';

const map=document.getElementById('map-pane'),story=document.getElementById('story-pane');
const bridge=document.getElementById('story-bridge');
const compact=matchMedia('(max-width:999px)'),reduce=matchMedia('(prefers-reduced-motion:reduce)');
let opened=false,opener=null,readingPosition=0,loaded=false,loading,contentLoading,contentReady=false,activeTransition,showRevision=0;
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
  map.inert=opened&&compact.matches;story.inert=!opened;bridge.inert=!opened;
  for(const entry of document.querySelectorAll('.map-about-trigger,[data-map-story],.map-story-link')){
    entry.setAttribute('aria-expanded',String(opened));entry.setAttribute('aria-controls','story-pane');
  }
  map.querySelector('.map-about-trigger')?.removeAttribute('popovertarget');
  const inspector=map.querySelector('.map-inspector.is-case-view');
  inspector?.setAttribute('aria-modal',String(!(opened&&!compact.matches)));
}
async function prepareStory(){
  if(contentReady)return;
  if(contentLoading)return contentLoading;
  story.innerHTML='<div class="page"><p class="story-loading" role="status">Открываю рассказ…</p></div>';
  contentLoading=(async()=>{
    let style=document.querySelector('[data-story-style]');
    if(!style){style=document.createElement('link');style.rel='stylesheet';style.href=import.meta.resolve('../assets/map-story/story.css');style.dataset.storyStyle='';document.head.append(style);}
    const response=await fetch(import.meta.resolve('../assets/map-story/content.html'));
    if(!response.ok)throw new Error('story-content-'+response.status);
    story.innerHTML=await response.text();contentReady=true;
  })();
  try{await contentLoading;}finally{contentLoading=null;}
}
async function loadStory(transition,content){
  if(loaded)return;
  if(loading)return loading;
  loading=(async()=>{await content;await transition;await import('../assets/map-story/story.js');loaded=true;story.dataset.ready='true';})();
  try{await loading;}catch(error){
    story.innerHTML='<div class="page"><p role="alert">Рассказ не загрузился. Можно попробовать ещё раз.</p><button type="button" class="text-link" data-story-retry>Повторить</button></div>';
    throw error;
  }finally{loading=null;}
}
async function show(value,{write=true,focus=true,animate=false}={}){
  const revision=++showRevision;
  if(!value&&opened){rememberReading();readingPosition=story.scrollTop;}
  const changed=opened!==value;opened=value;
  const moving=changed&&animate&&!reduce.matches&&document.documentElement.dataset.reduceMotion!=='true';
  activeTransition?.skipTransition();
  const content=value?prepareStory():Promise.resolve();void content.catch(()=>{});
  const snapshot=moving&&typeof document.startViewTransition==='function';
  document.body.classList.toggle('story-uses-snapshot',snapshot);
  document.body.classList.toggle('story-is-moving',moving);
  const apply=()=>{if(revision!==showRevision)return;document.body.classList.toggle('has-story-pane',value);sync();};
  let transition;
  if(snapshot){
    const view=document.startViewTransition(()=>{apply();pane.refresh();});
    void view.ready.catch(()=>{});activeTransition=view;transition=view.finished.catch(()=>{});
  }else{apply();transition=Promise.all(moving?document.getElementById('split-shell').getAnimations().map(a=>a.finished.catch(()=>{})):[]);}
  if(moving)void transition.then(()=>{if(revision===showRevision)document.body.classList.remove('story-is-moving','story-uses-snapshot');});
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
      const entry=[...document.querySelectorAll('.map-about-trigger,.mobile-map-story')].find(el=>el.getClientRects().length);
      const target=modal?.querySelector('[data-close-inspector]')||(opener?.getClientRects().length?opener:entry);
      target?.focus({preventScroll:true});
    }));
  }
}
document.addEventListener('click',event=>{
  const entry=event.target.closest('.map-about-trigger,[data-map-story],.map-story-link');
  if(entry&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();opener=entry;void show(true,{animate:event.detail>0});return;}
  if(event.target.closest('[data-close-story]')){event.preventDefault();void show(false,{animate:event.detail>0});return;}
  if(!story.contains(event.target))return;
  if(event.target.closest('[data-story-retry]')){void show(true,{write:false});return;}
  if(event.target.closest('[data-close-story],a[href="/?scene=map"]')){event.preventDefault();void show(false,{animate:event.detail>0});return;}
  const link=event.target.closest('a');if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const url=new URL(link.href),point=url.searchParams.get('point');
  if(point&&url.origin===location.origin){event.preventDefault();if(compact.matches)void show(false,{write:false,focus:false});selectMapItem(point,{reveal:true,updateHistory:true});if(compact.matches){const next=new URL(location.href);next.searchParams.delete('story');history.replaceState(history.state,'',next);}mapButtons.get(point)?.focus({preventScroll:true});}
},true);
bridge.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();void show(false);}});
story.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.stopPropagation();if(event.target.closest('.scene-target,.scene-readout'))return;event.preventDefault();void show(false);}});
window.addEventListener('popstate',()=>{void show(new URL(location.href).searchParams.has('story'),{write:false});});
compact.addEventListener('change',()=>{activeTransition?.skipTransition();document.body.classList.remove('story-is-moving','story-uses-snapshot');sync();});
new MutationObserver(sync).observe(map.querySelector('.map-inspector'),{attributes:true,attributeFilter:['class']});
document.addEventListener('keydown',event=>{
  if(opened&&event.key==='Escape'&&!event.defaultPrevented&&(document.activeElement===opener||document.activeElement===document.body)){event.preventDefault();void show(false);return;}
  if(!opened||event.key!=='Tab'||event.defaultPrevented)return;
  const stops=getTabStops(document.body),index=stops.indexOf(document.activeElement);if(index<0)return;
  const next=stops[index+(event.shiftKey?-1:1)];
  if(next&&bridge.contains(next)){event.preventDefault();next.focus({preventScroll:true});}
},true);
void show(new URL(location.href).searchParams.has('story'),{write:false,focus:false});
