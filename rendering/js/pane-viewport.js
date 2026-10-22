const host=document.getElementById('map-pane');
const queries=new Set();
function evaluate(query){return query.split(/\s+and\s+/).every(part=>{const m=part.match(/\((min|max)-(width|height):\s*([\d.]+)px\)/);return m?(m[1]==='min'?pane[m[2]]>=Number(m[3]):pane[m[2]]<=Number(m[3])):matchMedia(part).matches;});}
export const pane={
  surface:document.querySelector('.map-surface')||document.body,
  syncState(){mirror();},
  refresh(){refresh();},
  get width(){return host?.clientWidth||innerWidth;},get height(){return pane.surface?.clientHeight||host?.clientHeight||innerHeight;},
  media(query){
    const events=new EventTarget();let matches=evaluate(query);
    const result={media:query,get matches(){return matches;},addEventListener:(...a)=>events.addEventListener(...a),removeEventListener:(...a)=>events.removeEventListener(...a),addListener:f=>events.addEventListener('change',f),removeListener:f=>events.removeEventListener('change',f)};
    queries.add(()=>{const next=evaluate(query);if(next===matches)return;matches=next;events.dispatchEvent(new MediaQueryListEvent('change',{matches,media:query}));});
    return result;
  },
  get visualViewport(){return{width:pane.width,height:Math.min(pane.height,window.visualViewport?.height||innerHeight),offsetTop:window.visualViewport?.offsetTop||0,offsetLeft:0,addEventListener:(...args)=>window.visualViewport?.addEventListener(...args)};}
};
// Resolve viewport units once per pane. Nested navigation/card containers must
// not change the shared typography or the page's available width.
const syncUnits=(element,width,height)=>{element.style.setProperty('--pane-vw',width/100+'px');element.style.setProperty('--pane-vh',height/100+'px');};
let last='',pending=0;
function refresh(){const key=pane.width+':'+pane.height;if(key===last)return;last=key;syncUnits(pane.surface,pane.width,pane.height);queries.forEach(update=>update());window.dispatchEvent(new Event('resize'));}
if(host){
  syncUnits(pane.surface,pane.width,pane.height);
  new ResizeObserver(()=>{if(pending)return;pending=requestAnimationFrame(()=>{pending=0;refresh();});}).observe(host);
}
const reader=document.getElementById('story-pane');
if(reader){let queued=0,previous='';new ResizeObserver(()=>{if(queued)return;queued=requestAnimationFrame(()=>{queued=0;const key=reader.clientWidth+':'+reader.clientHeight;if(key===previous||!reader.clientWidth)return;previous=key;syncUnits(reader,reader.clientWidth,reader.clientHeight);});}).observe(reader);}
const mirror=()=>{pane.surface.className='map-surface '+document.body.className;for(const attr of [...pane.surface.attributes])if(attr.name.startsWith('data-'))pane.surface.removeAttribute(attr.name);for(const attr of document.body.attributes)if(attr.name.startsWith('data-'))pane.surface.setAttribute(attr.name,attr.value);};
if(host){new MutationObserver(mirror).observe(document.body,{attributes:true});mirror();}
