// Native Aura field adapted from https://www.playgrnd.tools/aura.
// Source retrieved 2026-10-01. The noise, mesh blending and Flow path are preserved.
// Approved 1 October 2026: seed 5768, Mesh / Flow, amplitude .6, 18-second cycle.
// Uses the recovery palette beneath the existing author card; no external runtime.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const STYLE_POOL = ["clouds", "mesh", "sweep"];
const S = {
  seed: 5768, style: "mesh", scale: 1.2, churn: .6, punch: .7,
  pal: ["#eeede7", "#d7e0d5", "#538e67", "#a6bda7"],
  motion: { on: true, mode: "flow", amount: .6, frames: 864 },
};
function rng(s){let a=(s>>>0)||1;return()=>{a^=a<<13;a>>>=0;a^=a>>17;a^=a<<5;a>>>=0;return a/4294967296;};}
function hashi(x,y,z,s){
  let n=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,1440662683)^Math.imul(s|0,1013904223);
  n=Math.imul(n^(n>>>15),2246822519);n=Math.imul(n^(n>>>13),3266489917);n^=n>>>16;
  return (n>>>0)/4294967296;
}
function hex2rgb(h){h=h.replace("#","");if(h.length===3)h=h.split("").map(c=>c+c).join("");
  return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
let NS=1;
function vn(x,y,k){
  const xi=Math.floor(x), yi=Math.floor(y);
  const fx=x-xi, fy=y-yi;
  const u=fx*fx*(3-2*fx), v=fy*fy*(3-2*fy);
  const a=hashi(xi,yi,k,NS), b=hashi(xi+1,yi,k,NS),
        c=hashi(xi,yi+1,k,NS), d=hashi(xi+1,yi+1,k,NS);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function fbm(x,y,k){
  return vn(x,y,k)*0.55+vn(x*2.13,y*2.13,k+11)*0.28+vn(x*4.31,y*4.31,k+23)*0.17;
}
function buildArt(){
  const r=rng(S.seed*2654435761>>>0);
  let style=S.style;
  if(style==="auto")style=STYLE_POOL[(r()*STYLE_POOL.length)|0];
  NS=(S.seed^0x51ed270b)>>>0;
  return{style,r};
}
function motionState(f){
  const M=S.motion;
  const t=M.on?f/M.frames:0;
  return{t,flow:M.on&&M.mode==="flow",pulse:M.on&&M.mode==="pulse",amp:M.amount};
}

/* ============================================================
   The gradient engine — four vivid inks blended through warped
   noise fields, painted small and scaled up soft
============================================================ */
function fbm2(x,y,k){return vn(x,y,k)*0.62+vn(x*2.13,y*2.13,k+11)*0.38;}
let fieldC=null,fieldX=null;
function drawAura(c,W,H,A,mo,budget){
  const R=A.r;
  const bw=Math.max(90,Math.min(budget,Math.round(W)));
  const bh=Math.max(90,Math.round(bw*H/W));
  if(!fieldC||fieldC.width!==bw||fieldC.height!==bh){
    fieldC=document.createElement("canvas");fieldC.width=bw;fieldC.height=bh;
    fieldX=fieldC.getContext("2d");
  }
  /* blend in squared space so the mixes stay glowing instead of muddy */
  const inks=S.pal.map(hex2rgb).map(cc=>cc.map(v=>v*v));
  const nI=inks.length;
  const ox=[],oy=[],axs=[],ays=[],dxs=[],dys=[];
  for(let i=0;i<nI;i++){
    ox.push(R()*37);oy.push(R()*43);
    axs.push((R()-0.5)*1.5);ays.push((R()-0.5)*1.5);
    const th=R()*TAU;dxs.push(Math.cos(th));dys.push(Math.sin(th));
  }
  const style=A.style;
  const ex=1.3+S.punch*5.2;
  const warp=0.4+S.churn*2.4;
  const zx=(mo.flow?0.5*mo.amp:0)*Math.cos(TAU*mo.t);
  const zy=(mo.flow?0.5*mo.amp:0)*Math.sin(TAU*mo.t);
  const zoom=mo.pulse?1+0.12*mo.amp*Math.cos(TAU*mo.t):1;
  const mind=Math.min(bw,bh);
  const sc=1.7*S.scale/zoom;
  const img=fieldX.createImageData(bw,bh);
  const d=img.data;
  let p=0;
  for(let y=0;y<bh;y++){
    const ny=(y-bh/2)/mind*sc;
    for(let x=0;x<bw;x++){
      const nx=(x-bw/2)/mind*sc;
      const q1=fbm(nx+11.3,ny+7.9,81), q2=fbm(nx+3.7,ny+19.1,82);
      const wx=nx+warp*(q1-0.5)+zx, wy=ny+warp*(q2-0.5)+zy;
      let sw=0,ar=0,ag=0,ab=0;
      for(let i=0;i<nI;i++){
        const nz=fbm2(wx*1.15+ox[i],wy*1.15+oy[i],60+i);
        let f;
        if(style==="clouds")f=nz;
        else if(style==="mesh"){
          const ddx=wx*0.8-axs[i], ddy=wy*0.8-ays[i];
          f=Math.exp(-(ddx*ddx+ddy*ddy)*2.6)*0.72+nz*0.34;
        }else{
          f=clamp(0.5+(wx*dxs[i]+wy*dys[i])*0.5,0,1)*0.66+nz*0.4;
        }
        const w=Math.pow(Math.max(f,0.002),ex);
        sw+=w;const ink=inks[i];
        ar+=w*ink[0];ag+=w*ink[1];ab+=w*ink[2];
      }
      d[p]=Math.sqrt(ar/sw);d[p+1]=Math.sqrt(ag/sw);d[p+2]=Math.sqrt(ab/sw);d[p+3]=255;p+=4;
    }
  }
  fieldX.putImageData(img,0,0);
  c.imageSmoothingEnabled=true;
  c.imageSmoothingQuality="high";
  c.drawImage(fieldC,0,0,W,H);
}

function paint(c,W,H,f,budget){
  const A=buildArt();
  const mo=motionState(f);
  drawAura(c,W,H,A,mo,budget || 160);
}


function paintAura(context, width, height, phase, palette) {
  S.pal = palette;
  paint(context, width, height, phase * S.motion.frames, 160);
}

const root = document.documentElement;
const field = document.querySelector('.whoop-field');
if (field) {
const canvas = document.createElement('canvas');
canvas.className = 'whoop-aura';
canvas.setAttribute('aria-hidden', 'true');
field.append(canvas);
const context = canvas.getContext('2d');
if (context) {
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const contrast = matchMedia('(forced-colors: active), (prefers-contrast: more)');
let phase = 0, previous = 0, timer = 0, running = false, pending = 0;
const duration = 18000;

function draw() {
  const rect = field.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const style = getComputedStyle(root);
  const ink = style.getPropertyValue('--day-rgb').split(',').map(Number);
  const hex = style.getPropertyValue('--bg').trim().replace('#', '');
  const base = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const palette = [0, .12, .8, .4].map(amount => '#' + base.map((v, i) => Math.round(v + (ink[i] - v) * amount).toString(16).padStart(2, '0')).join(''));
  paintAura(context, width, height, phase, palette);
}

function tick() {
  const now = performance.now();
  phase = (phase + (now - previous) / duration) % 1;
  previous = now;
  draw();
  timer = setTimeout(tick, 1000 / 24);
}

function sync() {
  pending = 0;
  const style = getComputedStyle(field);
  const visible = !document.hidden
    && style.visibility !== 'hidden' && style.display !== 'none'
    && getComputedStyle(root).getPropertyValue('--day-enabled').trim() === '1';
  const play = visible && !reduced.matches && !contrast.matches && root.dataset.reduceMotion !== 'true';
  if (!play && running) { clearTimeout(timer); running = false; }
  if (visible) draw();
  if (play && !running) { running = true; previous = performance.now(); timer = setTimeout(tick, 1000 / 24); }
}
const schedule = () => { if (!pending) pending = requestAnimationFrame(sync); };
const observer = new MutationObserver(schedule);
observer.observe(root, { attributes: true });
observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-case-open'] });
for (const node of [field, document.querySelector('.map-inspector'), document.querySelector('.practice-map')]) {
  if (node) observer.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-observation-active'] });
}
new ResizeObserver(schedule).observe(field);
document.addEventListener('visibilitychange', sync);
reduced.addEventListener('change', sync);
contrast.addEventListener('change', sync);
window.addEventListener('pagehide', () => { clearTimeout(timer); running = false; });
window.addEventListener('pageshow', sync);
sync();
}
}
