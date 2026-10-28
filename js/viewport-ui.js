import {pane} from './pane-viewport.js';
import { reducedMotion } from "./preferences.js";

const scrollRegionFromKey = (event, region, reduceMotion) => {
  if (event.target.matches("input, select, textarea") || !["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) return;
  const maximum = region.scrollHeight - region.clientHeight;
  const step = event.key.startsWith("Page") ? region.clientHeight * 0.82 : 48;
  const top = event.key === "Home" ? 0 : event.key === "End" ? maximum
    : region.scrollTop + (["ArrowDown", "PageDown"].includes(event.key) ? step : -step);
  event.preventDefault();
  region.scrollTo({ top: Math.max(0, Math.min(maximum, top)), behavior: reduceMotion ? "auto" : "smooth" });
};

const e=new Map;let t=0;const o="http://www.w3.org/2000/svg",a=matchMedia("(forced-colors: active)"),n=56,r=32,i=(e,t,o,a,i)=>{const s=o+64,l=88,c=`${t}:${e.fullWidth}:${e.gutter||0}:${JSON.stringify(e.cutouts||[])}`;if(e.textureWidth!==c){const o=e.canvas;o.height=l;const a=o.getContext("2d"),i=a.createImageData(o.width,l);for(let a=0;a<l;a++){const s=Math.max(0,Math.min(1,1-(a-r)/n));for(let n=0;n<o.width;n++){const r=n/(o.width-1),l=e.gutter||0,c=1+Math.min(.5,2*l/Math.max(1,t-2*l))*s**2,d=e.media?0:e.fullWidth?(r-.5)*t*(1/c-1):-(r-.5)*Math.min(.42*t,168)*s**2*Math.sin(Math.PI*r)**2,m=4*(a*o.width+n);i.data[m]=128+d/64*255,i.data[m+1]=128,i.data[m+2]=255*s,i.data[m+3]=255}}const s=a.createImageData(o.width,l),d=4*o.width;for(let e=0;e<l;e++)s.data.set(i.data.subarray(e*d,(e+1)*d),(l-e-1)*d);a.putImageData(s,0,0),e.images[1].setAttribute("href",o.toDataURL());for(const[a,n,s,c]of e.cutouts||[])for(let e=Math.max(0,Math.floor(n+r));e<Math.min(l,c+r);e++)for(let n=Math.max(0,Math.floor(a/t*o.width));n<Math.min(o.width,Math.ceil(s/t*o.width));n++){const t=4*(e*o.width+n);i.data[t]=128,i.data[t+2]=0}a.putImageData(i,0,0),e.images[0].setAttribute("href",o.toDataURL()),e.textureWidth=c}const d=`${t}:${o}`;if(e.geometry!==d){for(const t of[e.filter,...e.filter.children])t.setAttribute("x",0),t.setAttribute("y",-32/o),t.setAttribute("width",1),t.setAttribute("height",s/o);e.displaceX.setAttribute("scale",64/t);const a=e.media?2.2:2.6;e.blur.setAttribute("stdDeviation",`${a/t} ${a/o}`),e.fade.setAttribute("amplitude",e.media?".28":".72"),e.fade.setAttribute("exponent",e.media?"2.4":"3.4"),e.geometry=d}e.images.forEach((t,s)=>{const c=s?i:a,d=c-(s?n:r),m=null!==c&&d<o+r&&d+l>-32;t.setAttribute("y",m?d/o:0),t.setAttribute("height",l/o),e.mapLayers[s].setAttribute("in",m?s?"lower":"upper":"empty")})},s=(e,t,o)=>null===t?0:Math.max(0,Math.min(1,1-(o?e-t:t-e)/n)),l=(e,t)=>{const o=s(t,e.top,!0),a=s(t,e.bottom,!1),r=Math.max(o,a)**2,i=Math.min(1,Math.max(o,a)*n/(n-e.frameRadius)),l=e.insetMedia?0:i*i*(3-2*i),c=Math.min(e.radius,e.width/2,e.height/2),d=Math.max(0,c-Math.min(t,e.height-t)),m=e.cornerPower||2,u=c-Math.pow(Math.max(0,c**m-d**m),1/m);return{bend:r,sample:t+8*(o**2-a**2),left:e.left*(1-l)+u,right:e.left+e.width+(e.portWidth-e.left-e.width)*l-u}},c=e=>{const t=e.matches("video"),o=getComputedStyle(e.closest(".personal-media__screen")||e.parentElement).backgroundColor,a=document.createElement("canvas");a.className="scroll-lens-video",a.setAttribute("aria-hidden","true");const i=a.getContext("2d"),s=document.createElement("canvas"),c=s.getContext("2d");if(!i||!c)return null;const d=e.style.opacity;let m,u=0,h=!1;const p=(d=!1)=>{if(h||!m||(t?e.readyState<2:!e.complete||!e.naturalWidth))return;const u=m,p=Math.min(devicePixelRatio||1,2),f=Math.round(u.width*p),g=Math.round(u.height*p),y=Math.round(u.portWidth*p),b=g;if(!(f&&g&&y&&b))return;a.width===y&&a.height===b||(a.width=y,a.height=b);const v=s.width!==f||s.height!==g;if(v&&(s.width=f,s.height=g),!d||v||!a.isConnected){const a=t?e.videoWidth:e.naturalWidth,n=t?e.videoHeight:e.naturalHeight,r=Math.min(f/a,g/n),i=a*r,s=n*r;c.clearRect(0,0,f,g),c.fillStyle=o,c.fillRect(0,0,f,g),c.drawImage(e,(f-i)/2,t?0:(g-s)/2,i,s)}i.clearRect(0,0,y,b),i.save(),i.beginPath();const w=Math.min(u.radius*p,f/2,g/2),M=u.left*p,x=2/(u.cornerPower||2);for(const[e,t,o]of[[M+f-w,w,-1],[M+f-w,g-w,0],[M+w,g-w,1],[M+w,w,2]])for(let a=0;a<=16;a++){const n=(o+a/16)*Math.PI/2,r=Math.cos(n),s=Math.sin(n);i.lineTo(e+w*Math.sign(r)*Math.abs(r)**x,t+w*Math.sign(s)*Math.abs(s)**x)}i.closePath(),i.clip(),i.drawImage(s,u.left*p,0),i.restore();const S=[null===u.top?null:[u.top-r,u.top+n],null===u.bottom?null:[u.bottom-n,u.bottom+r]].filter(Boolean).map(([e,t])=>[Math.max(0,Math.floor(e*p)),Math.min(b,Math.ceil(t*p))]).filter(([e,t])=>t>e);2===S.length&&S[0][1]>=S[1][0]&&(S[0][1]=S[1][1],S.pop());for(const[e,t]of S){i.clearRect(0,e,y,t-e);for(let o=e;o<t;o++){const e=l(u,(o+.5)/p),t=(e.right-e.left)*p;if(t<=0)continue;const a=Math.min(f,t/(1+.16*e.bend)),n=Math.max(0,Math.min(g-1,e.sample*p-.5));i.drawImage(s,(f-a)/2,n,a,1,e.left*p,o,t,1)}}a.style.left=-u.left+"px",a.style.width=u.portWidth+"px",a.style.height=u.height+"px",a.isConnected||e.parentElement.append(a),e.style.opacity="0"},f=()=>{u=0,!h&&t&&(document.hidden||p(),e.requestVideoFrameCallback?u=e.requestVideoFrameCallback(f):e.paused||(u=requestAnimationFrame(f)))},g=()=>{p(),u||f()};for(const t of["load","loadeddata","seeked","play"])e.addEventListener(t,g);return{canvas:a,draw:p,setGeometry(e){m=e,u||f()},dispose(){h=!0,e.cancelVideoFrameCallback?e.cancelVideoFrameCallback(u):cancelAnimationFrame(u);for(const t of["load","loadeddata","seeked","play"])e.removeEventListener(t,g);e.style.opacity=d,a.remove()}}},d=e=>{const t=e.style.transform,o=e.style.transformOrigin,a=e.parentElement,r=a.style.overflow,i=a.style.clipPath,s=document.createElement("span");return s.className="scroll-lens-frost",s.setAttribute("aria-hidden","true"),e.after(s),e.style.transformOrigin="50% 0",{draw(t){const{top:o,bottom:r,height:i}=t,c=e=>null===e?0:Math.max(0,Math.min(1,1+Math.min(0,e)/n)),d=c(o),m=c(null===r?null:i-r),u=null===o?0:Math.max(0,Math.min(i-1,o)),h=null===r?i:Math.max(u+1,Math.min(i,r)),p=h-u,f=1+.16*d**2,g=1+.16*m**2,y=u+Math.min(8*d**2,.3*p),b=(g-f)/p,v=f-b*u,w=((h-Math.min(8*m**2,.3*p))*g-y*f)/p,M=y*f-w*u;e.style.transform=`matrix3d(${w*v-M*b},0,0,0,0,${v},0,${-b},0,0,1,0,0,${-M},0,${w})`;const x=[],S=[],A=Math.ceil(i/4);for(let e=0;e<=A;e++){const o=e/A*i,a=l(t,o);x.push(`${a.left-t.left}px ${o}px`),S.unshift(`${a.right-t.left}px ${o}px`)}a.style.overflow="visible",a.style.clipPath=`polygon(${[...x,...S].join(",")})`,s.style.left=-t.left+"px",s.style.width=t.portWidth+"px";const C=[];null!==o&&C.push(`linear-gradient(#000 ${o}px, transparent ${o+n}px)`),null!==r&&C.push(`linear-gradient(transparent ${r-n}px, #000 ${r}px)`),s.style.maskImage=C.join(","),s.style.webkitMaskImage=C.join(",")},dispose(){e.style.transform=t,e.style.transformOrigin=o,a.style.overflow=r,a.style.clipPath=i,s.remove()}}},clearScrollLenses=t=>e.get(t)?.reset(),observeScrollLens=(r,s,{owner:l=r,enabled:m=()=>!0,fullWidth:u=!1}={})=>{if(!r)return;const h=new Map,pressedPointers=new Set;let p,f,g,y,b=0;const v=(e,t=null)=>{if(e.moveBefore)return void e.moveBefore(r,t);const o=[...r.querySelectorAll("video")].map(e=>[e,e.currentTime,e.paused,e.src]);e.insertBefore(r,t);for(const[e,t,a,n]of o){const o=()=>{e.src===n&&(e.currentTime=t,a?e.pause():e.play().catch(()=>{}))};e.readyState?o():e.addEventListener("loadedmetadata",o,{once:!0})}},w=e=>{const t=r.scrollTop,o=r.scrollLeft,a=document.activeElement,n=document.getSelection(),i=n&&!n.isCollapsed&&(r.contains(n.anchorNode)||r.contains(n.focusNode))&&[n.anchorNode,n.anchorOffset,n.focusNode,n.focusOffset];e(),r.scrollTop=t,r.scrollLeft=o,r.contains(a)&&a.focus({preventScroll:!0}),i&&n.setBaseAndExtent(...i)},M=()=>{if(!f)return;r.style.removeProperty("--scroll-ink-filter");if(pressedPointers.size)return;if(r.parentElement===f){r.querySelector("iframe")||w(()=>{v(f.parentElement,f),f.remove(),f=null;for(const[e,t]of y)r.style[e]=t})}else{f.remove(),f=null;for(const[e,t]of y)r.style[e]=t}},x=(e,t)=>{t.player?t.player.dispose():t.media&&t.media.dispose(),t.filter?.remove(),$.unobserve(e),h.delete(e)},S=()=>{for(const[e,t]of h)x(e,t);g=null,M(),p?.remove(),p=null},A=(e,a=!0)=>{if(e.matches("iframe")){const t={player:d(e)};return h.set(e,t),$.observe(e),t}p||(p=document.createElementNS(o,"svg"),p.setAttribute("width","0"),p.setAttribute("height","0"),p.setAttribute("aria-hidden","true"),p.style.position="absolute",pane.surface.append(p));const n="scroll-ink-"+ ++t,r=document.createElementNS(o,"filter");for(const[e,t]of Object.entries({id:n,filterUnits:"objectBoundingBox",primitiveUnits:"objectBoundingBox",x:"0",y:"0",width:"1",height:"1","color-interpolation-filters":"sRGB"}))r.setAttribute(e,t);r.innerHTML='<feFlood flood-color="#808000" result="neutral"/>\n      <feFlood flood-opacity="0" result="empty"/>\n      <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="upper"/>\n      <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="lower"/>\n      <feMerge result="map"><feMergeNode in="neutral"/><feMergeNode in="upper"/><feMergeNode in="lower"/></feMerge>\n      <feComponentTransfer in="map" result="offset"><feFuncR type="linear" intercept="-.0019607843"/><feFuncG type="linear" slope="0" intercept=".5"/></feComponentTransfer>\n      <feDisplacementMap in="SourceGraphic" in2="offset" xChannelSelector="R" yChannelSelector="G" result="warped"/>\n      <feGaussianBlur in="warped" edgeMode="duplicate" result="blurred"/>\n      <feColorMatrix in="map" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 1 0 0" result="depth"/>\n      <feComponentTransfer in="depth" result="haze"><feFuncA type="gamma" exponent="1.5"/></feComponentTransfer>\n      <feComposite in="warped" in2="haze" operator="out" result="sharp"/>\n      <feComposite in="blurred" in2="haze" operator="in" result="soft"/>\n      <feComposite in="sharp" in2="soft" operator="arithmetic" k2="1" k3="1" result="frost"/>\n      <feComponentTransfer in="depth" result="fade"><feFuncA type="gamma" exponent="2.4"/></feComponentTransfer>\n      <feComposite in="frost" in2="fade" operator="out"/>',p.append(r);const i=document.createElement("canvas");i.width=64;const s={id:n,filter:r,canvas:i,images:[...r.querySelectorAll("feImage")],mapLayers:[...r.querySelectorAll("feMergeNode")].slice(1),displaceX:r.querySelector("feDisplacementMap"),blur:r.querySelector("feGaussianBlur"),fade:r.querySelector('[result="fade"] feFuncA'),media:e.matches("img, video")?c(e):null};return a&&(h.set(e,s),$.observe(e)),s},C=()=>{if(b=0,f&&r.parentElement!==f&&M(),!r.isConnected||l.hidden||"true"===l.getAttribute("aria-hidden")||!m()||reducedMotion.matches||a.matches)return void S();f&&(f.style.gridArea=getComputedStyle(r).gridArea);const e=r.getBoundingClientRect();if(!e.height||r.scrollHeight<=r.clientHeight+1)return void S();const t=new Set(s());for(const[e,o]of h)t.has(e)||x(e,o);const o=e.height/r.offsetHeight||1,c=r.scrollTop>1,d=r.scrollTop+r.clientHeight<r.scrollHeight-1,p=document.getSelection(),E=[...t].map(e=>({element:e,rect:(e.matches("iframe")?e.parentElement:e).getBoundingClientRect(),height:e.offsetHeight,width:e.offsetWidth})),$=t=>t.width&&t.height&&t.bottom>e.top&&t.top<e.bottom,_=t=>[c&&t.top<e.top+n*o&&t.bottom>e.top,d&&t.bottom>e.bottom-n*o&&t.top<e.bottom],q=[!1,!1];for(const{element:e,rect:t,width:o,height:a}of E)o&&a&&!e.matches("img,video,iframe,[data-material-surface],a,button,input,select,textarea")&&!e.querySelector("[data-material-surface],a,button,input,select,textarea")&&_(t).forEach((e,t)=>q[t]||=e);const L=[];let F=!1;for(const t of r.querySelectorAll("a,button,input,select,textarea,[data-material-surface],img,video,iframe")){const a=t.getBoundingClientRect();if(!$(a))continue;const n=t.closest(".map-related__preview"),r=getComputedStyle(t);"visible"!==r.visibility||0===+r.opacity&&!h.get(t)?.media||n&&0===+getComputedStyle(n).opacity||(t.matches("img,video,iframe")&&(F=!0),t.matches("a:not([data-material-surface])")&&E.some(({element:e})=>t.contains(e))||(t.matches(".story-actions .ui-close,[data-close-inspector]")?L.push([(a.left-e.left)/o-4,(a.top-e.top)/o-4,(a.right-e.left)/o+4,(a.bottom-e.top)/o+4].map(e=>Math.round(10*e)/10)):_(a).forEach((e,t)=>{e&&(q[t]=!1)})))}const R=document.activeElement,k=p&&!p.isCollapsed&&(r.contains(p.anchorNode)||r.contains(p.focusNode))||R!==r&&r.contains(R)&&R.matches(":focus-visible")&&$(R.getBoundingClientRect());if(!(q.some(Boolean)||u&&f)||k||F)r.style.removeProperty("--scroll-ink-filter");else{if(!f&&!r.querySelector("iframe")){if(pressedPointers.size)return;const e=getComputedStyle(r);return f=document.createElement("div"),f.dataset.scrollLensFrame="",f.style.cssText=`min-width:0;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden;flex:${e.flex};grid-area:${e.gridArea};margin:${e.margin};border-radius:${e.borderRadius};corner-shape:${e.cornerShape||"round"}`,y=["margin","flex"].map(e=>[e,r.style[e]]),w(()=>{r.before(f),v(f),r.style.margin="0",r.style.flex="1 1 auto"}),C()}if(f){g||=A(r,!1);const e=r.clientWidth,t=r.clientHeight,o=u&&parseFloat(getComputedStyle(r.querySelector(".page")).paddingLeft)||0,a=`${e}:${t}:${o}:${q}:${JSON.stringify(L)}`;g.window!==a&&(g.fullWidth=u,g.gutter=o,g.cutouts=L,i(g,e,t,q[0]?0:null,q[1]?t:null),g.window=a),r.style.setProperty("--scroll-ink-filter",`url(#${g.id})`)}}for(const{element:t,rect:a,height:n,width:s}of E){if(!t.matches("img, video, iframe"))continue;const l=p&&!p.isCollapsed&&(t.contains(p.anchorNode)||t.contains(p.focusNode)),m=_(a);let u=h.get(t);const f=t.closest("a, button, iframe"),g=f?f.matches(":focus-visible")||t.matches("iframe")&&t===document.activeElement&&"keyboard"===document.documentElement.dataset.focusModality:t.contains(document.activeElement);if(!s||!n||!m.some(Boolean)||l||g||t.matches("[data-material-surface]")||t.querySelector("[data-material-surface], a, button, input, select, textarea")){u&&x(t,u);continue}if(u||=A(t),!u.player&&!u.media){x(t,u);continue}const y=getComputedStyle(t.closest(".personal-media__screen, .map-hover-preview__mosaic-main")),b=y.cornerShape||"round",v={width:s,height:n,insetMedia:Boolean(t.closest(".personal-media__screen")),left:(a.left-e.left)/o,y:(a.top-e.top)/o,portWidth:r.clientWidth,portHeight:r.clientHeight,frameRadius:Math.min(40,parseFloat(getComputedStyle(r).borderTopLeftRadius)||0),top:c?(e.top-a.top)/o:null,bottom:d?(e.bottom-a.top)/o:null,radius:parseFloat(y.borderTopLeftRadius)||0,cornerPower:b.startsWith("superellipse(")?2**parseFloat(b.slice(13)):"squircle"===b?4:2};u.player?u.player.draw(v):(u.media.setGeometry(v),u.media.draw(!0),i(u,r.clientWidth,n,v.top,v.bottom),u.media.canvas.style.filter=`url(#${u.id})`)}},E=()=>{b||(b=requestAnimationFrame(C))},$=new ResizeObserver(E),releasePointer=e=>{pressedPointers.delete(e.pointerId)&&E()},releasePointers=()=>{if(pressedPointers.size){pressedPointers.clear();E()}};$.observe(r),r.addEventListener("scroll",()=>{cancelAnimationFrame(b),C()},{passive:!0}),r.addEventListener("pointerdown",e=>pressedPointers.add(e.pointerId),{capture:true,passive:true}),window.addEventListener("pointerup",releasePointer,{capture:true,passive:true}),window.addEventListener("pointercancel",releasePointer,{capture:true,passive:true}),window.addEventListener("blur",releasePointers),window.addEventListener("pagehide",releasePointers),r.addEventListener("focusin",E),r.addEventListener("focusout",E),l.addEventListener("animationend",E),document.addEventListener("selectionchange",E),window.addEventListener("resize",E,{passive:!0}),reducedMotion.addEventListener("change",E),a.addEventListener("change",E),new MutationObserver(E).observe(r,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["hidden"]}),new MutationObserver(E).observe(l,{attributes:!0,attributeFilter:["class","open","hidden","aria-hidden"]});const _={reset:S,schedule:E};return e.set(r,_),E(),_},m=document.querySelector("[data-map-inspector]");observeScrollLens(m,()=>m.querySelectorAll(".map-readout__identity h2, .map-readout__identity p, [data-map-description], .map-evidence dt, .map-evidence dd:not(:has(.case-figure)), .map-evidence__copy, .case-details h3, .case-details h4, .case-details p, .observation-preview, .map-related__header, .map-related__item > :is(strong, span)"),{enabled:()=>!m.classList.contains("has-reading-frame")});const lensPanel=document.querySelector(".content-panel__body");observeScrollLens(lensPanel,()=>lensPanel.querySelectorAll(".work-intro > *, .approach-intro > *, .work-row > :not(img), .approach-grid li > *, .contact-intro > :not(.contact-resume), .contact-links a > *"),{owner:document.querySelector("[data-content-panel]")});const u=document.querySelector(".settings-panel__body");observeScrollLens(u,()=>u.querySelectorAll("p, h3, .settings-whoop__zones dt, .settings-whoop__zones dd, .settings-panel__privacy dt, .settings-panel__privacy dd"),{owner:document.querySelector("[data-settings-panel]")});

const observeScrollEdges = (region, { owner = region } = {}) => {
  if (!region) return;
  let frame = 0;
  const update = () => {
    frame = 0;
    const active = region.clientHeight > 0 && region.scrollHeight > region.clientHeight + 1;
    const top = active ? Math.max(0, region.scrollTop) : 0;
    const bottom = active ? Math.max(0, region.scrollHeight - region.clientHeight - top) : 0;
    region.style.setProperty("--scroll-fade-top", Math.min(14, top) + "px");
    region.style.setProperty("--scroll-fade-bottom", Math.min(14, bottom) + "px");
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  region.addEventListener("scroll", schedule, { passive: true });
  region.addEventListener("focusin", schedule);
  owner.addEventListener("animationend", schedule);
  const resize = new ResizeObserver(schedule);
  resize.observe(region);
  const contents = new MutationObserver(() => {
    for (const child of region.children) resize.observe(child);
    schedule();
  });
  contents.observe(region, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(schedule).observe(owner, {
    attributes: true, attributeFilter: ["class", "open", "hidden"],
  });
  for (const child of region.children) resize.observe(child);
  window.addEventListener("resize", schedule, { passive: true });
  schedule();
};

observeScrollEdges(document.querySelector(".settings-panel__body"), {
  owner: document.querySelector("[data-settings-panel]"),
});
observeScrollEdges(lensPanel, { owner: document.querySelector("[data-content-panel]") });
const compactCommandViewport = pane.media("(max-width: 900px)");
const commandViewportProperties = [
  "--command-focus-left",
  "--command-focus-top",
  "--command-focus-width",
];
const clearCommandViewportPosition = () => {
  commandViewportProperties.forEach((property) => {
    document.documentElement.style.removeProperty(property);
  });
};
const setCommandGeometry = (element, group, values) => {
  for (const [name, value] of Object.entries(values)) {
    element.style.setProperty(
      `--command-${group}-${name}`,
      typeof value === "number" ? value.toFixed(2) + "px" : value,
    );
  }
};
const getCommandVisualViewport = () => {
  const viewport = pane.visualViewport;

  return {
    height: viewport?.height || pane.height,
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
    width: viewport?.width || pane.width,
  };
};
const positionDetachedCommandResults = () => {
  const dock = document.querySelector("[data-command-form]");
  const results = document.querySelector("[data-command-results]");
  const status = document.querySelector("[data-command-status]");

  if (!dock || !results) return;

  const compact = compactCommandViewport.matches;
  const focusedMobile = compact && dock.classList.contains("is-open");
  for (const element of [dock, results, status].filter(Boolean)) {
    const visible = focusedMobile && !element.hidden && (element === dock || element.classList.contains("is-open"));
    if (visible && element.showPopover) {
      element.setAttribute("popover", "manual");
      if (!element.matches(":popover-open")) element.showPopover();
    } else if (element.hasAttribute("popover")) {
      if (element.matches(":popover-open")) element.hidePopover();
      element.removeAttribute("popover");
    }
  }
  const bounds = dock.getBoundingClientRect();
  const surface = compact ? dock : dock.closest("[data-floating-console]") || dock;
  const surfaceBounds = surface.getBoundingClientRect();
  const viewport = getCommandVisualViewport();
  if (focusedMobile) {
    const visual = window.visualViewport;
    const map = document.getElementById("map-pane").getBoundingClientRect();
    viewport.left = Math.max(visual?.offsetLeft || 0, map.left);
    viewport.width = Math.max(0, Math.min((visual?.offsetLeft || 0) + (visual?.width || innerWidth), map.right) - viewport.left);
    const frameInset = parseFloat(getComputedStyle(document.getElementById("split-shell")).paddingBottom) || 0;
    viewport.height = Math.max(0, Math.min(viewport.top + (visual?.height || innerHeight), innerHeight - frameInset) - viewport.top);
  }
  const gap = 8;
  let anchorTop = surfaceBounds.top;
  let anchorBottom = surfaceBounds.bottom;
  const resultWidth = compact ? surfaceBounds.right - bounds.left
    : Math.max(surfaceBounds.right - bounds.left, Math.min(surfaceBounds.width, 640));
  let width = Math.min(resultWidth, Math.max(0, viewport.width - gap * 2));
  let left = Math.max(viewport.left + gap,
    Math.min(surfaceBounds.right - width, viewport.left + viewport.width - gap - width));

  if (focusedMobile) {
    anchorTop = Math.max(viewport.top + gap, viewport.top + viewport.height - bounds.height - gap);
    anchorBottom = anchorTop + bounds.height;
    left = viewport.left + gap;
    width = Math.max(0, viewport.width - gap * 2);
    setCommandGeometry(document.documentElement, "focus", { left, top: anchorTop, width });
    anchorTop = dock.getBoundingClientRect().top;
    anchorBottom = anchorTop + bounds.height;
  } else {
    clearCommandViewportPosition();
  }

  const spaceAbove = Math.max(0, anchorTop - viewport.top - gap * 2);
  const spaceBelow = Math.max(0, viewport.top + viewport.height - anchorBottom - gap * 2);

  [results, status].filter(Boolean).forEach((element) => {
    setCommandGeometry(element, "results", { left, width });

    const contentHeight = element.scrollHeight;
    const opensBelow = !focusedMobile && (contentHeight > spaceAbove && spaceBelow > spaceAbove);
    let maxHeight = opensBelow ? spaceBelow : spaceAbove;
    const peek = [...element.children].map(row => row.offsetTop + row.offsetHeight / 2)
      .filter(height => height <= maxHeight).at(-1);
    if (contentHeight > maxHeight && peek) maxHeight = peek;
    element.dataset.placement = opensBelow ? "below" : "above";
    setCommandGeometry(element, "results", {
      "max-height": maxHeight,
      top: opensBelow
        ? anchorBottom + gap
        : focusedMobile
          ? anchorTop - gap - Math.min(maxHeight, contentHeight)
          : "auto",
      bottom: opensBelow || focusedMobile
        ? "auto"
        : pane.height - anchorTop + gap,
    });
  });
};
let commandPositionFrame = 0;
const scheduleDetachedCommandResultsPosition = () => {
  window.cancelAnimationFrame(commandPositionFrame);
  commandPositionFrame = window.requestAnimationFrame(
    positionDetachedCommandResults,
  );
};

pane.visualViewport?.addEventListener(
  "resize",
  scheduleDetachedCommandResultsPosition,
  { passive: true },
);
pane.visualViewport?.addEventListener(
  "scroll",
  scheduleDetachedCommandResultsPosition,
  { passive: true },
);
window.addEventListener(
  "resize",
  scheduleDetachedCommandResultsPosition,
  { passive: true },
);

const floatingConsoleModules = Array.from(document.querySelectorAll("[data-floating-console]"));
const floatingConsoleMedia = window.matchMedia(
  "(min-width: 901px) and (hover: hover) and (pointer: fine)",
);
const consoleInteractiveSelector = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "form",
  "[data-console-text]",
  "[contenteditable='true']",
].join(",");

const getConsoleOffset = (module) => ({
  x: Number.parseFloat(module.dataset.dragX || "0") || 0,
  y: Number.parseFloat(module.dataset.dragY || "0") || 0,
});

const authorCard = document.querySelector('.site-header');
const authorField = document.querySelector('.whoop-field');
const syncCompactControlGeometry = () => {
  const close = document.querySelector('#story-pane [data-close-story]');
  if (pane.width > 900) {
    close?.style.removeProperty('--control-target');
    document.querySelector('#story-pane')?.style.removeProperty('--story-close-inset');
    return;
  }
  const toggle = document.querySelector('[data-constellation-nav-toggle]');
  const mark = toggle?.querySelector('.constellation-nav__cluster');
  const map = document.querySelector('.map-surface');
  if (!toggle || !mark || !map || toggle.getAttribute('aria-expanded') === 'true') return;
  const button = toggle.getBoundingClientRect();
  const icon = mark.getBoundingClientRect();
  if (!button.width || !icon.width) return;
  const write = (element, name, value) => {
    const next = `${value.toFixed(2)}px`;
    if (element.style.getPropertyValue(name) !== next) element.style.setProperty(name, next);
  };
  write(map, '--compact-menu-bottom', button.bottom - map.getBoundingClientRect().top);
  const name = authorCard?.querySelector('.brand__name');
  if (name) write(authorCard, '--author-menu-text-width', Math.max(0, button.left - name.getBoundingClientRect().left));
  const inspector = document.querySelector('.map-inspector.has-reading-frame:not(.is-case-view).is-open');
  const inspectorClose = inspector?.querySelector('[data-close-inspector]');
  if (inspectorClose) write(inspector, '--compact-inspector-axis-padding', Math.max(0,
    inspector.getBoundingClientRect().right - icon.left - icon.width / 2 - inspectorClose.getBoundingClientRect().width / 2));
  const story = document.querySelector('#story-pane');
  if (story && document.body.classList.contains('has-story-pane')) {
    const right = story.getBoundingClientRect().left + story.clientLeft + story.clientWidth;
    const centre = icon.left + icon.width / 2;
    close?.style.removeProperty('--control-target');
    const target = Math.max(44, Math.min(close?.getBoundingClientRect().width || button.width, (right - centre) * 2));
    if (close && innerWidth < 1000) write(close, '--control-target', target);
    write(story, '--story-close-inset', right - centre - target / 2);
  }
};
let compactGeometryFrame = 0;
const compactGeometryResize = new ResizeObserver(() => {
  if (!compactGeometryFrame) compactGeometryFrame = requestAnimationFrame(() => { compactGeometryFrame = 0; syncCompactControlGeometry(); });
});
document.querySelectorAll('[data-constellation-nav-toggle], #story-pane').forEach(element => compactGeometryResize.observe(element));
const syncAuthorField = () => {
  if (!authorCard || !authorField) return;
  const card = authorCard.getBoundingClientRect();
  const map = authorField.parentElement.getBoundingClientRect();
  authorField.style.cssText = `left:${card.left-map.left-112}px;top:${card.top-map.top-96}px;width:${card.width+208}px;height:${card.height+192}px`;
};
const syncAuthorPresence = () => {
  if (!authorCard) return;
  const reading = document.body.classList.contains("has-content-panel")
    || document.body.classList.contains("has-settings-panel")
    || Boolean(document.querySelector(".map-inspector.is-open"));
  document.body.classList.toggle("has-reading-surface", reading);
  authorCard.inert = (reading && !document.body.classList.contains("has-contact-consoles"))
    || document.body.matches(".has-constellation-nav, .has-command-focus");
  syncAuthorField();
  syncCompactControlGeometry();
  window.dispatchEvent(new CustomEvent("author-presence-change"));
};
let authorPresenceFrame = 0;
if (authorCard) new ResizeObserver(() => {
  if (authorPresenceFrame) return;
  authorPresenceFrame = requestAnimationFrame(() => { authorPresenceFrame = 0; syncAuthorPresence(); });
}).observe(authorCard);
window.addEventListener("reading-surface-change", syncAuthorPresence);
new MutationObserver(syncAuthorPresence).observe(document.body, { attributes: true, attributeFilter: ["class"] });
const authorInspector = document.querySelector(".map-inspector");
if (authorInspector) new MutationObserver(syncAuthorPresence).observe(authorInspector, { attributes: true, attributeFilter: ["class"] });
syncAuthorPresence();

const setConsoleOffset = (module, x, y) => {
  module.dataset.dragX = x.toFixed(2);
  module.dataset.dragY = y.toFixed(2);
  module.style.setProperty("--console-drag-x", `${x.toFixed(2)}px`);
  module.style.setProperty("--console-drag-y", `${y.toFixed(2)}px`);
  if (module.classList.contains("control-console")) {
    const { top, height } = module.getBoundingClientRect();
    document.documentElement.style.setProperty("--console-clearance", `${height ? pane.height - top + y : 0}px`);
  }
  if (module === authorCard) syncAuthorField();
};

const clampConsoleOffset = (module, desiredX, desiredY, basePosition = null) => {
  const margin = 8;
  const currentOffset = getConsoleOffset(module);
  const rect = module.getBoundingClientRect();
  const baseLeft = basePosition?.left ?? rect.left - currentOffset.x;
  const baseTop = basePosition?.top ?? rect.top - currentOffset.y;
  const minimumX = margin - baseLeft;
  const maximumX = pane.width - margin - baseLeft - rect.width;
  const minimumY = margin - baseTop;
  const maximumY = pane.height - margin - baseTop - rect.height;

  return {
    x: Math.min(Math.max(desiredX, minimumX), Math.max(minimumX, maximumX)),
    y: Math.min(Math.max(desiredY, minimumY), Math.max(minimumY, maximumY)),
  };
};

floatingConsoleModules.forEach((module) => {
  module.addEventListener("pointerdown", (event) => {
    if (
      !floatingConsoleMedia.matches
      || event.button !== 0
      || event.target.closest(consoleInteractiveSelector)
    ) {
      return;
    }

    const startOffset = getConsoleOffset(module);
    const startRect = module.getBoundingClientRect();
    const basePosition = {
      left: startRect.left - startOffset.x,
      top: startRect.top - startOffset.y,
    };
    const startPointer = { x: event.clientX, y: event.clientY };
    let hasFinished = false;

    const finishDrag = (finishEvent) => {
      if (hasFinished || finishEvent.pointerId !== event.pointerId) {
        return;
      }

      hasFinished = true;
      module.classList.remove("is-dragging");
      scheduleDetachedCommandResultsPosition();
      module.removeEventListener("pointermove", moveModule);
      module.removeEventListener("pointerup", finishDrag);
      module.removeEventListener("pointercancel", finishDrag);
      module.removeEventListener("lostpointercapture", finishDrag);

      if (module.hasPointerCapture?.(event.pointerId)) {
        module.releasePointerCapture(event.pointerId);
      }
    };

    const moveModule = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) {
        return;
      }

      const nextOffset = clampConsoleOffset(
        module,
        startOffset.x + moveEvent.clientX - startPointer.x,
        startOffset.y + moveEvent.clientY - startPointer.y,
        basePosition,
      );

      moveEvent.preventDefault();
      setConsoleOffset(module, nextOffset.x, nextOffset.y);
      positionDetachedCommandResults();
    };

    event.preventDefault();
    module.classList.add("is-dragging");
    module.addEventListener("pointermove", moveModule);
    module.addEventListener("pointerup", finishDrag);
    module.addEventListener("pointercancel", finishDrag);
    module.addEventListener("lostpointercapture", finishDrag);
    module.setPointerCapture?.(event.pointerId);
  });
});

const syncConsoleBounds = () => {
  syncCompactControlGeometry();
  if (!floatingConsoleMedia.matches) {
    floatingConsoleModules.forEach((module) => setConsoleOffset(module, 0, 0));
    return;
  }

  const navigation = document.querySelector(".control-console");
  if (navigation?.getClientRects().length && pane.width > 900) {
    const offset = getConsoleOffset(navigation);
    setConsoleOffset(navigation, offset.x, offset.y);
  }

  floatingConsoleModules.forEach((module) => {
    const rect = module.getBoundingClientRect();
    if (!rect.width || !rect.height || pane.width <= 900) return;
    const currentOffset = getConsoleOffset(module);
    const nextOffset = clampConsoleOffset(module, currentOffset.x, currentOffset.y);
    setConsoleOffset(module, nextOffset.x, nextOffset.y);
  });

  scheduleDetachedCommandResultsPosition();
};

const consoleResize = new ResizeObserver(() => requestAnimationFrame(syncConsoleBounds));
floatingConsoleModules.forEach(module => consoleResize.observe(module));
window.addEventListener("resize", syncConsoleBounds);
floatingConsoleMedia.addEventListener?.("change", syncConsoleBounds);

export {
  observeScrollEdges,
  observeScrollLens,
  clearScrollLenses,
  scrollRegionFromKey,
  clearCommandViewportPosition,
  compactCommandViewport,
  getConsoleOffset,
  positionDetachedCommandResults,
  scheduleDetachedCommandResultsPosition,
  setConsoleOffset,
};
