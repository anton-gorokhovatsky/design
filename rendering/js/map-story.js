import {selectMapItem,mapButtons} from './map-engine.js';
import {getTabStops} from './preferences.js';

const map=document.getElementById('map-pane'),story=document.getElementById('story-pane');
const compact=matchMedia('(max-width:999px)'),reduce=matchMedia('(prefers-reduced-motion:reduce)');
let opened=false,opener=null,readingPosition=0,loaded=false,loading;
function sync(){
  map.inert=opened&&compact.matches;story.inert=!opened;
  for(const entry of document.querySelectorAll('.map-about-trigger,[data-map-story],.map-story-link')){
    entry.setAttribute('aria-expanded',String(opened));entry.setAttribute('aria-controls','story-pane');
  }
  map.querySelector('.map-about-trigger')?.removeAttribute('popovertarget');
  const inspector=map.querySelector('.map-inspector.is-case-view');
  inspector?.setAttribute('aria-modal',String(!(opened&&!compact.matches)));
}
async function loadStory(){
  if(loaded)return;
  if(loading)return loading;
  story.innerHTML='<div class="page"><nav class="story-nav"><button type="button" class="text-link" data-close-story>Карта целиком</button></nav><p role="status">Открываю рассказ…</p></div>';
  loading=(async()=>{
    let style=document.querySelector('[data-story-style]');
    if(!style){style=document.createElement('link');style.rel='stylesheet';style.href=import.meta.resolve('../assets/map-story/story.css');style.dataset.storyStyle='';document.head.append(style);}
    const response=await fetch(import.meta.resolve('../assets/map-story/content.html'));
    if(!response.ok)throw new Error('story-content-'+response.status);
    story.innerHTML=await response.text();
    const navigation=story.querySelector('.story-nav');
    navigation.dataset.materialSurface='story-navigation';navigation.dataset.materialActive='always';
    new ResizeObserver(()=>{if(story.clientWidth)story.style.scrollPaddingBlockStart=(navigation.getBoundingClientRect().height+16)+'px';}).observe(navigation);
    await import('../assets/map-story/story.js');
    loaded=true;story.dataset.ready='true';
  })();
  try{await loading;}catch(error){
    story.innerHTML='<div class="page"><nav class="story-nav"><button type="button" class="text-link" data-close-story>Карта целиком</button></nav><p role="alert">Рассказ не загрузился. Можно попробовать ещё раз.</p><button type="button" class="text-link" data-story-retry>Повторить</button></div>';
    throw error;
  }finally{loading=null;}
}
async function show(value,{write=true,focus=true,animate=false}={}){
  if(!value&&opened)readingPosition=story.scrollTop;
  const changed=opened!==value;opened=value;
  document.body.classList.toggle('has-story-pane',value);sync();
  if(write&&changed){const url=new URL(location.href);if(value)url.searchParams.set('story','1');else url.searchParams.delete('story');history.pushState(history.state,'',url);}
  if(value){
    document.querySelector('[data-constellation-nav-toggle][aria-expanded="true"]')?.click();
    window.dispatchEvent(new CustomEvent('reading-surface-change'));
    if(animate&&!reduce.matches&&document.documentElement.dataset.reduceMotion!=='true')story.animate([{transform:'translateX(28px)',opacity:0},{transform:'translateX(0)',opacity:1}],{duration:240,easing:'cubic-bezier(.16,1,.3,1)'});
    try{await loadStory();}catch{if(opened&&focus)story.focus({preventScroll:true});return;}
    if(!opened)return;
    story.scrollTop=readingPosition;
    if(!readingPosition&&location.hash){const chapter=story.querySelector('[id="'+CSS.escape(location.hash.slice(1))+'"]');chapter?.scrollIntoView({block:'start'});}
    if(focus)(readingPosition?story:story.querySelector('h1')).focus({preventScroll:true});
  }else if(focus&&changed){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
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
  if(!story.contains(event.target))return;
  if(event.target.closest('[data-story-retry]')){void show(true,{write:false});return;}
  if(event.target.closest('[data-close-story],a[href="/?scene=map"]')){event.preventDefault();void show(false);return;}
  const link=event.target.closest('a');if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const url=new URL(link.href),point=url.searchParams.get('point');
  if(point&&url.origin===location.origin){event.preventDefault();if(compact.matches)void show(false,{write:false,focus:false});selectMapItem(point,{reveal:true,updateHistory:true});if(compact.matches){const next=new URL(location.href);next.searchParams.delete('story');history.replaceState(history.state,'',next);}mapButtons.get(point)?.focus({preventScroll:true});}
},true);
story.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.stopPropagation();if(event.target.closest('.scene-target,.scene-readout'))return;event.preventDefault();void show(false);}});
window.addEventListener('popstate',()=>{void show(new URL(location.href).searchParams.has('story'),{write:false});});
compact.addEventListener('change',sync);
new MutationObserver(sync).observe(map.querySelector('.map-inspector'),{attributes:true,attributeFilter:['class']});
document.addEventListener('keydown',event=>{
  if(!opened||event.key!=='Tab'||event.defaultPrevented)return;
  const stops=getTabStops(document.body),index=stops.indexOf(document.activeElement);if(index<0)return;
  const next=stops[index+(event.shiftKey?-1:1)];
  if(next&&story.querySelector('.story-nav')?.contains(next)){event.preventDefault();next.focus({preventScroll:true});}
},true);
void show(new URL(location.href).searchParams.has('story'),{write:false,focus:false});
