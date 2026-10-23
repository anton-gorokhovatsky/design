import {reducedMotion as sharedMotion} from '/js/preferences.js';
const storyRoot=document.getElementById('story-pane');
import { typographUiText } from '/js/preferences.js';
import { createGravityLens } from '/assets/map-story/gravity-lens.js';
import { createTextField, attractPoint } from '/assets/map-story/text-field.js';
import { mapItems } from '/js/map-data.js';
import { blackHole, pulsar, practiceGroups, createPracticePlane, warpMapPoint } from '/js/map-scene-primitives.js';
import { createSystem, STEP } from '/js/orbit-physics.js';
import { audienceMassWeights, audienceSizeScales } from '/js/practice-audience.js';

const root = document.documentElement;
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
const stored = key => { try { return localStorage.getItem(key); } catch { return null; } };
let motion = !(systemMotion.matches || stored('anton-signal-reduced-motion') === '1');
let dark = root.dataset.theme ? root.dataset.theme === 'dark' : systemTheme.matches;
const walker=document.createTreeWalker(storyRoot.querySelector('.page'),NodeFilter.SHOW_TEXT);
while(walker.nextNode())walker.currentNode.textContent=typographUiText(walker.currentNode.textContent);
const ink = d => d ? '#f2f1ec' : '#10110f';
const bg = d => d ? '#11120f' : '#eeede7';
const signal = d => d ? '#91a1ff' : '#2448ed';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const canvas = () => document.createElement('canvas');
const byId = new Map(mapItems.map(i => [i.id, i]));
const controllers = new Map();
const transitioning=()=>document.body.classList.contains('story-is-moving');
const nodeLink = item => {const url=new URL(location.href);url.searchParams.set('point',item.id);return url.href;};

function contextFor(element, w, h) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  element.width = Math.max(1, Math.round(w * dpr));
  element.height = Math.max(1, Math.round(h * dpr));
  const c = element.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return c;
}
function stroke(c, points, color, width = 1) {
  if (!points.length) return;
  c.strokeStyle = color; c.lineWidth = width; c.beginPath();
  points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
}
function sphere(c, x, y, r, stops) {
  const g = c.createRadialGradient(x-r*.35,y-r*.4,r*.04,x-r*.15,y-r*.2,r*1.2);
  stops.forEach((s,i) => g.addColorStop(i/(stops.length-1),s));
  c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
}
function targetToolbar(host, items, positions, onSelect, hoverSelect=true) {
  const toolbar = host.querySelector('.scene-targets');
  const buttons = items.map((item, i) => {
    const button = document.createElement('button'); button.type='button'; button.className='scene-target';
    button.setAttribute('aria-label',item.label); button.setAttribute('aria-pressed','false'); button.tabIndex=i ? -1 : 0;
    button.dataset.point=item.id; toolbar.append(button);
    const choose = source => { buttons.forEach(b=>{b.tabIndex=b===button?0:-1;b.setAttribute('aria-pressed',String(b===button));});onSelect(item,source); };
    button.addEventListener('click',()=>choose('select'));
    button.addEventListener('focus',()=>choose('focus'));
    button.addEventListener('pointerenter', e=>{if(hoverSelect&&e.pointerType==='mouse')onSelect(item,'hover');});
    return button;
  });
  toolbar.addEventListener('keydown',e=>{
    const index=buttons.indexOf(document.activeElement); if(index<0)return;
    let next=index;
    const available=buttons.map((button,i)=>({button,i})).filter(({button})=>!button.inert);
    if(e.key==='Home')next=available[0]?.i??index;
    else if(e.key==='End')next=available.at(-1)?.i??index;
    else if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(e.key)) {
      const horizontal=e.key==='ArrowRight'||e.key==='ArrowLeft', sign=(e.key==='ArrowRight'||e.key==='ArrowDown')?1:-1;
      const p=positions()[index];
      const candidates=positions().map((q,i)=>({i,dx:q.x-p.x,dy:q.y-p.y})).filter(q=>q.i!==index && !buttons[q.i].inert && (horizontal?q.dx:q.dy)*sign>1);
      candidates.sort((a,b)=>(Math.hypot(a.dx,a.dy)+Math.abs(horizontal?a.dy:a.dx)*2)-(Math.hypot(b.dx,b.dy)+Math.abs(horizontal?b.dy:b.dx)*2));
      next=candidates[0]?.i ?? available[(available.findIndex(b=>b.i===index)+sign+available.length)%available.length]?.i ?? index;
    } else return;
    e.preventDefault();buttons[next].focus({preventScroll:true});
  });
  return buttons;
}
const sceneNotes=new WeakMap();
function sceneNote(figure){
  let note=sceneNotes.get(figure);if(note)return note;
  const out=figure.querySelector('.scene-readout'),host=figure.querySelector('.scene');
  host.append(out);out.classList.add('scene-readout--anchored','map-node-label');out.inert=true;
  note={out,dirty:true,width:0,height:0,sceneWidth:0};sceneNotes.set(figure,note);
  new ResizeObserver(()=>{note.dirty=true;}).observe(out);
  return note;
}
function readout(figure,item,detail=''){
  const note=sceneNote(figure),out=note.out;
  if(!item){out.classList.remove('is-visible');out.inert=true;delete out.dataset.point;return;}
  if(out.dataset.point===item.id&&out.dataset.detail===detail)return;
  const wasVisible=out.classList.contains('is-visible');
  out.dataset.point=item.id;out.dataset.detail=detail;
  const link=document.createElement('a');link.href=nodeLink(item);link.className='text-link';link.textContent=typographUiText(item.label);
  out.replaceChildren(link);
  if(detail){const text=document.createElement('span');text.className='readout-caption';text.textContent=typographUiText(detail);out.append(text);}
  out.inert=false;out.classList.add('is-visible');note.dirty=true;
  if(wasVisible&&motion){out.getAnimations().forEach(a=>a.cancel());out.animate([{opacity:0},{opacity:1}],{duration:180,easing:'cubic-bezier(0.16,1,0.3,1)'});}
}
function positionReadout(figure,point,width,height){
  const note=sceneNotes.get(figure);if(!note||!point||!note.out.dataset.point)return;
  if(note.sceneWidth!==width){note.out.style.maxWidth=Math.max(1,width-16)+'px';note.sceneWidth=width;note.dirty=true;}
  if(note.dirty){note.width=note.out.offsetWidth;note.height=note.out.offsetHeight;note.dirty=false;}
  const x=clamp(point.x-note.width/2,8,Math.max(8,width-note.width-8));
  let y=point.y-22-note.height;
  if(y<8)y=point.y+22;
  // The label belongs to the point; only the side changes at the scene's edge.
  if(y+note.height>height-8&&point.y-22-note.height>=0)y=point.y-22-note.height;
  note.out.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
}
function dismissSceneNote(figure,buttons,clear){
  figure.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    const out=sceneNotes.get(figure)?.out,point=out?.dataset.point;
    if(out?.contains(document.activeElement))buttons.find(b=>b.dataset.point===point)?.focus({preventScroll:true});
    clear();
  });
  document.addEventListener('pointerdown',e=>{if(!figure.contains(e.target))clear();});
}

function makePractice(figure) {
  const host=figure.querySelector('.scene'), base=host.querySelector('canvas'); base.className='orbit-plane';
  const plane=createPracticePlane(base);sceneNote(figure);
  const seeds=practiceGroups.flatMap(group=>group.projects.map((item,i)=>({id:item.id,radius:group.radius,phase:group.phase+i*TAU/group.projects.length,group,item})));
  const system=createSystem(seeds,{weights:audienceMassWeights});
  let w=400,h=350,carry=0,paused=false,hovered=false,selected=null,pinned=false;
  let points=seeds.map(()=>({x:0,y:0}));
  const buttons=targetToolbar(host,seeds.map(s=>s.item),()=>points,(item,source)=>{
    selected=item.id;pinned=source!=='hover';readout(figure,item);draw(0);
  });
  buttons.forEach((button,i)=>{
    const moon=document.createElement('span');moon.className='orbit-moon';moon.setAttribute('aria-hidden','true');
    moon.style.setProperty('--audience-size',audienceSizeScales[seeds[i].id]);
    seeds[i].group.surface.forEach((color,j)=>moon.style.setProperty('--moon-'+j,color));button.append(moon);
  });
  const clearSelection=()=>{selected=null;pinned=false;buttons.forEach(b=>b.setAttribute('aria-pressed','false'));readout(figure,null);draw(0);};
  dismissSceneNote(figure,buttons,clearSelection);
  host.addEventListener('pointerleave',()=>{hovered=false;if(!pinned&&!host.contains(document.activeElement))clearSelection();});
  host.addEventListener('pointerover',e=>{if(e.target.closest('.scene-target,.scene-readout'))hovered=true;});
  host.addEventListener('pointerout',e=>{hovered=!!e.relatedTarget?.closest?.('.scene-target,.scene-readout');});
  function draw(dt) {
    if(dt && !paused && !hovered && !host.contains(document.activeElement)) {
      carry+=Math.min(dt,.06); while(carry>=STEP){if(!system.step(STEP)){paused=true;const error=document.createElement('p');error.className='scene-error';error.setAttribute('role','status');error.textContent='Движение остановлено. Можно продолжить на основной карте.';figure.append(error);break;}carry-=STEP;}
    }
    const core=system.bodies[0];
    points=system.bodies.slice(1).map((body,i)=>{
      const p=plane.project(body.x-core.x,body.y-core.y), x=w/2+p[0]*w/2.6,y=h/2+p[1]*w/2.6;
      buttons[i].style.transform=`translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`;
      buttons[i].style.zIndex=String(Math.round(100+p[2]*50));
      const behind=p[2]<0 && Math.hypot(p[0],p[1])<.14;buttons[i].querySelector('.orbit-moon').style.opacity=behind?'0':'1';buttons[i].style.pointerEvents=behind?'none':'';
      return {x,y,z:p[2]};
    });
    positionReadout(figure,points[seeds.findIndex(seed=>seed.id===selected)],w,h);
  }
  return {draw,resize(){if(host.clientWidth<1||host.clientHeight<1)return;w=host.clientWidth;h=host.clientHeight;plane.sphere(.13);plane.tracks(dark);plane.paint();draw(0);},theme(){plane.tracks(dark);plane.paint();},getState:()=>({time:system.time,paused,selected,failure:system.failure})};
}

function makeGarage(figure) {
  const host=figure.querySelector('.scene'),field=host.querySelector('.scene-field'),spread=figure.querySelector('.gravity-spread');
  const fallback=canvas();fallback.className='gravity-core';host.append(fallback);const paintFallback=blackHole(fallback);
  const body=canvas();body.className='gravity-core';body.hidden=true;host.append(body);let lens=null;
  const button=document.createElement('button');button.type='button';button.className='scene-target gravity-hit';button.setAttribute('aria-label','Притяжение «Гаража»');button.setAttribute('aria-pressed','false');host.querySelector('.scene-targets').append(button);
  const toggle=figure.querySelector('.gravity-toggle'),copy=spread.querySelector('.gravity-copy');
  let fabric=null;try{fabric=createTextField(spread,copy);}catch{copy.dataset.warped='false';}
  let w=400,h=340,fw=400,fh=340,ox=0,oy=0,c,core=40,cx=200,cy=160,strength=0,target=0,pinned=false,hover=false,time=0;
  const sync=()=>{target=pinned||hover?1:0;button.setAttribute('aria-pressed',String(pinned));toggle.setAttribute('aria-pressed',String(pinned));toggle.textContent=pinned?'Отпустить притяжение':'Включить притяжение';if(!motion){strength=target;draw(0);}};
  const flip=()=>{pinned=!pinned;sync();};button.addEventListener('click',flip);toggle.addEventListener('click',flip);
  button.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){hover=true;sync();}});button.addEventListener('pointerleave',()=>{hover=false;sync();});
  figure.addEventListener('keydown',e=>{if(e.key==='Escape'){pinned=false;hover=false;sync();}});
  function fieldPoint(x,y){return attractPoint(x,y,cx+ox,cy+oy,core*3,strength);}
  function drawField(){
    c.clearRect(0,0,fw,fh);
    const centerX=cx+ox,centerY=cy+oy,spacing=Math.max(40,w/7),bleed=core*4;
    const shade=c.createRadialGradient(centerX,centerY,core*.7,centerX,centerY,fw*.95);
    shade.addColorStop(0,dark?'rgba(212,214,225,.2)':'rgba(60,64,72,.19)');shade.addColorStop(.65,dark?'rgba(212,214,225,.055)':'rgba(60,64,72,.06)');shade.addColorStop(1,'transparent');
    for(let x=spacing*.5-Math.ceil(bleed/spacing)*spacing;x<fw+bleed;x+=spacing){const pts=[];for(let y=-bleed;y<=fh+bleed;y+=6)pts.push(fieldPoint(x,y));stroke(c,pts,shade);}
    for(let y=spacing*.5-Math.ceil(bleed/spacing)*spacing;y<fh+bleed;y+=spacing){const pts=[];for(let x=-bleed;x<=fw+bleed;x+=6)pts.push(fieldPoint(x,y));stroke(c,pts,shade);}
    c.save();
    const children=mapItems.filter(item=>item.parent==='garage'),origin=byId.get('garage');
    const maxX=Math.max(...children.map(item=>item.x-origin.x)),maxY=Math.max(...children.map(item=>item.y-origin.y));
    c.lineCap='round';
    children.forEach(item=>{
      const vx=(item.x-origin.x)/maxX*(w-cx-18),vy=(item.y-origin.y)/maxY*(h-cy-18),angle=Math.atan2(vy,vx);
      const nx=Math.cos(angle),ny=Math.sin(angle),limit=Math.min((w-cx-14)/Math.max(nx,.001),(h-cy-14)/Math.max(ny,.001));
      // Retain each project's direction, with space between the glow and its node.
      const inner=core*2.6,R=inner+(limit-inner)*clamp(Math.hypot(vx,vy)/limit,0,1);
      const end={x:centerX+nx*R,y:centerY+ny*R};
      const from=core*1.1,to=Math.min(R*.8,core*2.3),g=c.createRadialGradient(centerX,centerY,from,centerX,centerY,R);
      const rgb=dark?'193,177,139':'119,108,83';
      for(let i=0;i<=8;i++){const t=i/8,alpha=.46*t*t*(3-2*t);g.addColorStop((to-from)/(R-from)*t,`rgba(${rgb},${alpha})`);}
      g.addColorStop(1,`rgba(${rgb},.27)`);c.strokeStyle=g;c.lineWidth=.9;
      c.save();c.globalAlpha=strength;
      c.beginPath();c.moveTo(centerX+Math.cos(angle+.22)*core*.6,centerY+Math.sin(angle+.22)*core*.6);
      c.bezierCurveTo(centerX+Math.cos(angle+.12)*R*.35,centerY+Math.sin(angle+.12)*R*.35,centerX+nx*R*.78,centerY+ny*R*.78,end.x-nx*4.5,end.y-ny*4.5);c.stroke();c.restore();
      c.strokeStyle=dark?'rgba(184,188,176,.65)':'rgba(92,99,86,.65)';c.lineWidth=1;c.beginPath();c.arc(end.x,end.y,4.5,0,TAU);c.stroke();
    });c.restore();
  }
  function draw(dt){
    time+=dt;const rate=dt?1-Math.exp(-dt*(target?3.6:5)):0;
    if(Math.abs(target-strength)<.0001)strength=target;else strength+=(target-strength)*rate;
    if(lens)lens.draw(time,dark);else paintFallback(time,dark);
    drawField();fabric?.draw(motion?strength:0,cx+ox,cy+oy,core*3);
    figure.dataset.tension=strength.toFixed(4);figure.dataset.lens=lens?'geodesic':'fallback';
  }
  function resize(){if(host.clientWidth<1||host.clientHeight<1)return;
    w=host.clientWidth;h=host.clientHeight;
    const rect=host.getBoundingClientRect(),bounds=spread.getBoundingClientRect();ox=rect.left-bounds.left;oy=rect.top-bounds.top;fw=bounds.width;fh=bounds.height;
    field.style.left=-ox+'px';field.style.top=-oy+'px';field.style.width=fw+'px';field.style.height=fh+'px';c=contextFor(field,fw,fh);
    core=Math.min(55,w*.0927);cx=w*.5;cy=h*.46;
    const size=core*28/(Math.sqrt(27)/2),fallbackSize=core*2.7/.434;
    for(const [node,s] of[[body,size],[fallback,fallbackSize]]){node.style.width=node.style.height=s+'px';node.style.left=cx-s/2+'px';node.style.top=cy-s/2+'px';}
    lens?.resize(size);button.style.transform=`translate(${cx}px,${cy}px)`;button.style.width=button.style.height=core*2.5+'px';button.style.margin=-core*1.25+'px';
    fabric?.resize();draw(0);
  }
  createGravityLens(body).then(value=>{if(!value)return;lens=value;body.hidden=false;fallback.hidden=true;resize();}).catch(error=>{figure.dataset.lensError=error.message;});
  body.addEventListener('lens-unavailable',()=>{lens=null;body.hidden=true;fallback.hidden=false;paintFallback(time,dark);});
  return {draw,resize,theme:()=>{fabric?.resize();draw(0);},motion:()=>{if(!motion){strength=target;draw(0);}},getState:()=>({strength,target,pinned,text:fabric?.getState(),renderer:lens?.getState()})};
}

function makeMap(figure) {
  const host=figure.querySelector('.scene'), field=host.querySelector('canvas'), chrono=figure.dataset.scene==='time';
  const items=mapItems, positions=items.map(()=>({x:0,y:0}));sceneNote(figure);
  const satelliteSeeds=new Map(practiceGroups.flatMap(group=>group.projects.map((item,i)=>[item.id,{group,phase:group.phase+i*TAU/group.projects.length}])));let c,w=900,h=550,t=chrono?1:0,target=chrono?1:0,selected=null,pinned=false,elapsed=0;
  let personalInk=getComputedStyle(root).getPropertyValue('--muted').trim();
  const levels=new Float32Array(items.length),edges=[];
  items.forEach((item,i)=>[item.parent,...(item.relatedTo||[])].filter(Boolean).forEach(parent=>{const from=items.findIndex(p=>p.id===parent);if(from>=0)edges.push({from,to:i,level:0});}));
  const black=canvas(),paintBlack=blackHole(black),pulse=canvas(),paintPulse=pulsar(pulse);
  const relativistic=canvas();let mapLens=null;
  createGravityLens(relativistic).then(value=>{if(value){mapLens=value;mapLens.resize(180);draw(0);}}).catch(()=>{});
  relativistic.addEventListener('lens-unavailable',()=>{mapLens=null;draw(0);});
  const practice=canvas(),practicePlane=createPracticePlane(practice);practicePlane.sphere(.13);practicePlane.tracks(dark);practicePlane.paint();
  const select=(item,source)=>{selected=item.id;pinned=source!=='hover';readout(figure,item,item.timeLabel||'');draw(0);};
  const buttons=targetToolbar(host,items,()=>positions,select,false);
  const clearSelection=()=>{selected=null;pinned=false;buttons.forEach(b=>b.setAttribute('aria-pressed','false'));readout(figure,null);draw(0);};
  dismissSceneNote(figure,buttons,clearSelection);
  const nearest=e=>{const rect=host.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let index=-1,distance=25;positions.forEach((p,i)=>{if(t>.8&&!Number.isFinite(items[i].timeYear))return;const d=Math.hypot(p.x-x,p.y-y);if(d<distance){distance=d;index=i;}});return index;};
  host.addEventListener('click',e=>{if(!e.isTrusted||e.detail===0||e.target.closest('.scene-readout'))return;const i=nearest(e);if(i<0)return;e.stopPropagation();buttons[i].click();},true);
  let hoverTimer=0,hoverId=null;
  function aimHover(id){
    if(id===hoverId)return;hoverId=id;clearTimeout(hoverTimer);
    hoverTimer=setTimeout(()=>{if(id)select(byId.get(id),'hover');else if(!pinned&&!host.contains(document.activeElement))clearSelection();},id?70:120);
  }
  host.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||e.target.closest('.scene-readout'))return;const i=nearest(e);aimHover(i>=0?items[i].id:null);});
  host.addEventListener('pointerleave',()=>aimHover(null));
  function setMode(value){target=value==='time'?1:0;if(target&&!Number.isFinite(byId.get(selected)?.timeYear)){clearSelection();buttons.forEach((button,i)=>button.tabIndex=i?-1:0);}figure.querySelectorAll('[data-layout]').forEach(b=>b.checked=b.dataset.layout===value);if(!motion)t=target;draw(0);}
  figure.querySelectorAll('[data-layout]').forEach(b=>b.addEventListener('change',()=>setMode(b.dataset.layout)));
  const timeRadius=year=>year>=2021?.46+(2026-year)*.036:year>=2015?.64+(2021-year)*.035:.85+(2015-year)*.03;
  const familyAngles=new Map();
  for(const [family,start,end] of [['garage',-.2,.65],['private-practice',-2.8,-1.15]]){
    const children=items.filter(item=>item.parent===family&&Number.isFinite(item.timeYear));
    children.forEach((item,i)=>familyAngles.set(item.id,start+(end-start)*i/Math.max(1,children.length-1)));
  }
  const companyAngles={'early-career':-2.35,ilmix:2.9,garage:1.35,optimal:2.15,'private-practice':-.8};
  const coords=(item,width,height,progress)=>{
    const pad=width<450?24:32,project=p=>({x:pad+(p.x-2)/92*(width-2*pad),y:pad+(p.y-4)/90*(height-2*pad)});
    let a=project(item),b=a;
    if(Number.isFinite(item.timeYear)){
      const angle=familyAngles.get(item.id)??companyAngles[item.id]??0,r=timeRadius(item.timeYear);
      b={x:width*.5+Math.cos(angle)*width*.44*r,y:height*.5+Math.sin(angle)*height*.43*r};
    }
    const seed=satelliteSeeds.get(item.id);
    if(seed){const origin=project(byId.get('private-practice')),v=practicePlane.project(seed.group.radius*Math.cos(seed.phase),seed.group.radius*Math.sin(seed.phase)),size=width*.32;a={x:origin.x+v[0]*size/2.6,y:origin.y+v[1]*size/2.6};}
    return {x:a.x+(b.x-a.x)*progress,y:a.y+(b.y-a.y)*progress};
  };
  function paint(ctx,width,height,d,progress,allPoints){
    ctx.clearRect(0,0,width,height);const color=d?'rgba(181,187,203,.12)':'rgba(65,75,91,.12)';
    const spatialCenter=coords({x:50,y:54},width,height,0),center={x:spatialCenter.x*(1-progress)+width*.5*progress,y:spatialCenter.y*(1-progress)+height*.5*progress};
    ctx.strokeStyle=color;ctx.lineWidth=1;
    for(let x=width*.1;x<width;x+=width*.16){ctx.beginPath();ctx.moveTo(x,10);ctx.lineTo(x,height-10);ctx.stroke();}
    for(let y=height*.15;y<height;y+=height*.22){ctx.beginPath();ctx.moveTo(8,y);ctx.lineTo(width-8,y);ctx.stroke();}
    ctx.save();ctx.translate(center.x,center.y);ctx.strokeStyle=d?'rgba(129,145,233,.3)':'rgba(57,79,172,.17)';
    const years=[2010,2015,2021,2026];
    [1,.85,.64,.46].forEach((ratio,i)=>{ctx.beginPath();ctx.ellipse(0,0,width*.44*ratio,height*.43*ratio,0,0,TAU);ctx.stroke();if(progress>.25){ctx.fillStyle=ink(d);ctx.globalAlpha=progress*.65;ctx.font='11px Akt';ctx.textAlign='right';ctx.fillText(String(years[i]),-12,-height*.43*ratio-8);ctx.textAlign='left';ctx.globalAlpha=1;}});ctx.restore();
    const selectedItem=byId.get(selected);
    for(const edge of edges){
      if(edge.level<.002)continue;
      if(progress>.5&&(!Number.isFinite(items[edge.from].timeYear)||!Number.isFinite(items[edge.to].timeYear)))continue;
      const a=allPoints[edge.from],b=allPoints[edge.to];
      ctx.strokeStyle=d?`rgba(171,182,255,${.6*edge.level})`:`rgba(73,95,169,${.45*edge.level})`;ctx.lineWidth=.65+.45*edge.level;
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2-12,b.x,b.y);ctx.stroke();
    }
    items.forEach((item,i)=>{
      const p=allPoints[i],major=['garage','running','private-practice','early-career','optimal','ilmix'].includes(item.id),active=selected===item.id||item.parent===selected||selectedItem?.parent===item.id||item.relatedTo?.includes(selected);
      const r=Math.max(2.5,Math.min(width/32,(item.size||12)*width/1800));
      ctx.save();ctx.globalAlpha=(major?1:.55+.45*levels[i])*(Number.isFinite(item.timeYear)?1:1-progress);
      if(item.id==='garage'){const size=mapLens?r*28/(Math.sqrt(27)/2):r*2.7/.434;ctx.drawImage(mapLens?relativistic:black,p.x-size/2,p.y-size/2,size,size);}
      else if(item.id==='running'){const size=Math.max(35,r*7);ctx.drawImage(pulse,p.x-size/2,p.y-size/2,size,size);}
      else if(item.id==='private-practice'){
        const size=width*.32;ctx.globalAlpha*=1-progress;ctx.drawImage(practice,p.x-size/2,p.y-size/2,size,size);ctx.globalAlpha=1;
        if(progress>0)sphere(ctx,p.x,p.y,Math.max(5,width*.013),['#bac7ad','#8c9f83','#4e6652','#101d16']);
      }else if(satelliteSeeds.has(item.id)){sphere(ctx,p.x,p.y,Math.max(2.5,width*.0045)*audienceSizeScales[item.id],satelliteSeeds.get(item.id).group.surface);
      }else if(item.kind==='company'){sphere(ctx,p.x,p.y,r,['#a1a392','#43483d','#151a13','#090d08']);}
      else if(item.kind==='practice'){ctx.strokeStyle=ink(d);ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(p.x-4,p.y);ctx.lineTo(p.x+4,p.y);ctx.moveTo(p.x,p.y-4);ctx.lineTo(p.x,p.y+4);ctx.stroke();}
      else if(item.kind==='personal'){
        if(item.shape==='sphere')sphere(ctx,p.x,p.y,Math.max(3,r),item.id==='youtube'?['#ffb4b4','#d51b30','#64051b','#360710']:['#d4c1cb','#86435a','#43182c','#230c19']);
        else{ctx.fillStyle=personalInk;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2.5,r*.65),0,TAU);ctx.fill();}
      }
      else {ctx.strokeStyle=ink(d);ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(3,r*.65),0,TAU);ctx.stroke();ctx.fillStyle=ink(d);ctx.beginPath();ctx.arc(p.x,p.y,1.3,0,TAU);ctx.fill();}
      ctx.restore();
    });
    const labels=progress>.5?['garage','early-career','ilmix','private-practice','optimal']:['garage','private-practice','running','ilmix','early-career'];
    ctx.font=`500 ${width<500?12:14}px Akt`;ctx.fillStyle=ink(d);
    const occupied=[];
    labels.forEach(id=>{const i=items.findIndex(item=>item.id===id),item=items[i],p=allPoints[i];let label=item.label;
      const measure=ctx.measureText(label).width, offset=id==='private-practice'&&progress<.5?width*.13+18:id==='garage'?width*.065+18:26;
      const candidates=[...(id==='garage'?[{x:p.x-measure/2,y:p.y+offset+14}]:[]),{x:p.x-measure/2,y:p.y-offset},{x:p.x-measure-26,y:p.y-9},{x:p.x+26,y:p.y-9},{x:p.x-measure/2,y:p.y+offset+14}];
      let rect=null;
      for(const q of candidates){const box={x:clamp(q.x,8,width-measure-8)-5,y:clamp(q.y,20,height-12)-15,w:measure+10,h:23};
        if(occupied.some(a=>box.x<a.x+a.w+10&&box.x+box.w+10>a.x&&box.y<a.y+a.h+8&&box.y+box.h+8>a.y))continue;
        if(allPoints.some((pt,j)=>j!==i&&(progress<.5||Number.isFinite(items[j].timeYear))&&pt.x>box.x-8&&pt.x<box.x+box.w+8&&pt.y>box.y-8&&pt.y<box.y+box.h+8))continue;
        rect=box;break;}
      if(!rect)return;occupied.push(rect);ctx.globalAlpha=1-levels[i];ctx.fillStyle=bg(d);ctx.fillRect(rect.x,rect.y,rect.w,rect.h);ctx.fillStyle=ink(d);ctx.fillText(label,rect.x+5,rect.y+15);ctx.globalAlpha=1;

    });
    ctx.strokeStyle=signal(d);ctx.lineWidth=.8;ctx.beginPath();ctx.arc(center.x,center.y,9,0,TAU);ctx.moveTo(center.x-17,center.y);ctx.lineTo(center.x+17,center.y);ctx.moveTo(center.x,center.y-17);ctx.lineTo(center.x,center.y+17);ctx.stroke();
  }
  function draw(dt){
    elapsed+=dt;if(Math.abs(t-target)<.0005)t=target;else if(dt)t+=(target-t)*(1-Math.exp(-dt*8));
    if(mapLens)mapLens.draw(elapsed,dark);else paintBlack(elapsed,dark);paintPulse(elapsed,dark);
    items.forEach((item,i)=>{const p=coords(item,w,h,t);positions[i]=p;buttons[i].style.transform=`translate(${p.x.toFixed(2)}px,${p.y.toFixed(2)}px)`;buttons[i].inert=t>.8&&!Number.isFinite(item.timeYear);});
    const selectedItem=byId.get(selected),ease=(value,on)=>!motion?Number(Boolean(on)):value+(Number(Boolean(on))-value)*(1-Math.exp(-dt*(on?6:4.5)));
    items.forEach((item,i)=>{levels[i]=ease(levels[i],selected===item.id||item.parent===selected||selectedItem?.parent===item.id||item.relatedTo?.includes(selected));});
    edges.forEach(edge=>{edge.level=ease(edge.level,items[edge.from].id===selected||items[edge.to].id===selected);});
    paint(c,w,h,dark,t,positions);
    positionReadout(figure,positions[items.findIndex(item=>item.id===selected)],w,h);
  }
  return {draw,resize(){if(host.clientWidth<1||host.clientHeight<1)return;w=host.clientWidth;h=host.clientHeight;c=contextFor(field,w,h);draw(0);},theme(){personalInk=getComputedStyle(root).getPropertyValue('--muted').trim();practicePlane.tracks(dark);practicePlane.paint();draw(0);},motion(){if(!motion){t=target;draw(0);}},getState:()=>({layout:t,selected,levels:[...levels],positions:items.map((item,i)=>({id:item.id,...positions[i],dated:Number.isFinite(item.timeYear)}))})};
}

function mount(figure){
  let entry=controllers.get(figure.dataset.scene);if(entry)return entry;
  const id=figure.dataset.scene;
  const scene=id==='practice'?makePractice(figure):id==='garage'?makeGarage(figure):makeMap(figure);
  entry={id,figure,scene,visible:false,last:0};controllers.set(id,entry);scene.resize();
  let pending=0;const resizeObserver=new ResizeObserver(()=>{if(pending)return;pending=requestAnimationFrame(()=>{pending=0;if(!transitioning())scene.resize();});});resizeObserver.observe(figure.querySelector('.scene'));if(id==='garage')resizeObserver.observe(figure.querySelector('.gravity-spread'));
  return entry;
}
let raf=0,last=0;
function tick(now){
  raf=0;if(!motion||document.hidden||transitioning())return;
  const dt=last?Math.min((now-last)/1000,.065):0;
  if(dt<1/30-.001 && dt!==0){raf=requestAnimationFrame(tick);return;}
  last=now;
  for(const entry of controllers.values())if(entry.visible){entry.scene.draw(dt);entry.figure.dataset.frames=String((Number(entry.figure.dataset.frames)||0)+1);}
  if([...controllers.values()].some(e=>e.visible))raf=requestAnimationFrame(tick);
}
function wake(){if(!raf&&motion&&!document.hidden){last=0;raf=requestAnimationFrame(tick);}}
function stop(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;}
function setMotion(value){motion=value&&!sharedMotion.matches;root.dataset.motion=String(motion);for(const {scene} of controllers.values())scene.motion?.();if(motion)wake();else stop();}
setMotion(motion);
const visibleFigures=new Set();
const observer=new IntersectionObserver(entries=>{for(const item of entries){if(item.isIntersecting)visibleFigures.add(item.target);else visibleFigures.delete(item.target);if(transitioning())continue;if(item.isIntersecting){const entry=mount(item.target);entry.visible=true;}else{const entry=controllers.get(item.target.dataset.scene);if(entry)entry.visible=false;}}if(!transitioning())wake();},{threshold:.06});
storyRoot.querySelectorAll('[data-scene]').forEach(figure=>observer.observe(figure));
let moving=transitioning();
new MutationObserver(()=>{const next=transitioning();if(next===moving)return;moving=next;if(moving){stop();return;}for(const figure of visibleFigures)mount(figure);controllers.forEach(entry=>{entry.visible=visibleFigures.has(entry.figure);if(entry.visible)entry.scene.resize();});wake();}).observe(document.body,{attributes:true,attributeFilter:['class']});
document.addEventListener('visibilitychange',()=>document.hidden?stop():wake());
window.addEventListener('pagehide',stop);window.addEventListener('pageshow',()=>{controllers.forEach(({scene})=>scene.resize());wake();});
systemMotion.addEventListener('change',()=>setMotion(!systemMotion.matches && stored('anton-signal-reduced-motion')!=='1'));
sharedMotion.addEventListener('change',()=>setMotion(!sharedMotion.matches));
function changeTheme(value){dark=value;root.dataset.theme=dark?'dark':'light';controllers.forEach(({scene})=>scene.theme?.());}
changeTheme(dark);
systemTheme.addEventListener('change',()=>{if(!stored('anton-signal-theme'))changeTheme(systemTheme.matches);});
document.fonts.ready.then(()=>controllers.forEach(({scene})=>scene.resize()));

// Theme follows the map preference; this page has no independent theme control.
window.addEventListener('storage',e=>{if(e.key==='anton-signal-theme')changeTheme(stored(e.key)==='dark'||(!stored(e.key)&&systemTheme.matches));if(e.key==='anton-signal-reduced-motion')setMotion(!systemMotion.matches&&stored(e.key)!=='1');});
new MutationObserver(()=>{const next=root.dataset.theme==='dark';if(next!==dark)changeTheme(next);}).observe(root,{attributes:true,attributeFilter:['data-theme']});
