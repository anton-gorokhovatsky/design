const host=document.getElementById('map-pane');
const queries=new Set();
function evaluate(query){return query.split(/\s+and\s+/).every(part=>{const m=part.match(/\((min|max)-(width|height):\s*([\d.]+)px\)/);return m?(m[1]==='min'?pane[m[2]]>=Number(m[3]):pane[m[2]]<=Number(m[3])):matchMedia(part).matches;});}
export const pane={
  surface:document.querySelector('.map-surface')||document.body,
  get width(){return host?.clientWidth||innerWidth;},get height(){return host?.clientHeight||innerHeight;},
  media(query){
    const events=new EventTarget();let matches=evaluate(query);
    const result={media:query,get matches(){return matches;},addEventListener:(...a)=>events.addEventListener(...a),removeEventListener:(...a)=>events.removeEventListener(...a),addListener:f=>events.addEventListener('change',f),removeListener:f=>events.removeEventListener('change',f)};
    queries.add(()=>{const next=evaluate(query);if(next===matches)return;matches=next;events.dispatchEvent(new MediaQueryListEvent('change',{matches,media:query}));});
    return result;
  },
  get visualViewport(){return{width:pane.width,height:Math.min(pane.height,window.visualViewport?.height||innerHeight),offsetTop:window.visualViewport?.offsetTop||0,offsetLeft:0,addEventListener:(...args)=>window.visualViewport?.addEventListener(...args)};}
};
let last='';if(host)new ResizeObserver(()=>{const key=pane.width+':'+pane.height;if(key===last)return;last=key;queries.forEach(update=>update());window.dispatchEvent(new Event('resize'));}).observe(host);
const mirror=()=>{pane.surface.className='map-surface '+document.body.className;for(const attr of [...pane.surface.attributes])if(attr.name.startsWith('data-'))pane.surface.removeAttribute(attr.name);for(const attr of document.body.attributes)if(attr.name.startsWith('data-'))pane.surface.setAttribute(attr.name,attr.value);};
if(host){new MutationObserver(mirror).observe(document.body,{attributes:true});mirror();}
