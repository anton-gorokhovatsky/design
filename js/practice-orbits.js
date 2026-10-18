import { mapItems } from './map-data.js';
import { mapButtons, syncMapNodeAvailability, setMapRovingId } from './map-engine.js';
import { createSystem, STEP } from './orbit-physics.js';
import { audienceWeights } from './practice-audience.js';

const gravity = true;

const projects = mapItems.filter(item => item.parent === 'private-practice');
const cultural = new Set(['shirokostup', 'tarski']);
const category = item => cultural.has(item.id) ? 'culture'
  : item.relatedTo?.includes('running') ? 'sport' : 'commercial';
const groups = [
  { id: 'culture', title: 'Культурные', radius: .43, phase: .4,
    color: [93,125,106], light: [160,195,165], surface: ['#cad7c7','#829e83','#354f40','#192b20'] },
  { id: 'commercial', title: 'Коммерческие', radius: .79, phase: 1.7,
    color: [153,115,61], light: [208,174,116], surface: ['#e5cfac','#af8c5b','#71522e','#382716'] },
  { id: 'sport', title: 'Спортивные', radius: 1.16, phase: .12,
    color: [114,101,151], light: [180,162,213], surface: ['#d7cee6','#9e90ba','#5f5179','#312943'] },
].map(group => ({ ...group, projects: projects.filter(item => category(item) === group.id),
  period: 22 * (group.radius / .43) ** 1.5 }));

const doc = document, win = window;
function initializePracticeOrbits() {
    const node = doc.querySelector('.map-node[data-map-id="private-practice"]');
    if (!node) return false;
    const glyph = node.querySelector('.map-node__glyph');
    const label = doc.querySelector('[data-map-label-id="private-practice"]');
    const canvas = doc.createElement('canvas');
    canvas.width = canvas.height = 672;
    canvas.className = 'practice-orbits-canvas';canvas.setAttribute('aria-hidden', 'true');glyph.append(canvas);
    const layer = doc.createElement('div');layer.className = 'project-satellites';
    layer.setAttribute('role', 'group');layer.setAttribute('aria-label', `${projects.length} проектов частной практики на трёх орбитах`);
    const tooltip = doc.createElement('div');tooltip.className = 'project-orbit-tooltip';tooltip.hidden = true;
    tooltip.dataset.materialSurface='map-node-label';tooltip.dataset.materialActive='always';
    const mobile=win.matchMedia('(max-width:900px)');
    const mobileOpen=node;
    const nativeRoot=doc.querySelector('[data-map-nodes]'), map=doc.querySelector('[data-practice-map]');
    (doc.querySelector('main')||doc.body).append(layer,tooltip);
    let enabled=true;
    const ctx = canvas.getContext('2d');
    const side=672,center=side/2,scale=side/2.6;
    let bodyRadius=.22,previousWidth=0;
    const tau=Math.PI*2,angle=-16*Math.PI/180,tilt=48*Math.PI/180;
    const project=(u,v)=>{
      return [u*Math.cos(angle)-v*Math.cos(tilt)*Math.sin(angle),u*Math.sin(angle)+v*Math.cos(tilt)*Math.cos(angle),v*Math.sin(tilt)];
    };
    const point=(radius,theta)=>project(Math.cos(theta)*radius,Math.sin(theta)*radius);
    const xy=([x,y])=>[center+x*scale,center+y*scale];
    const reduced=win.matchMedia('(prefers-reduced-motion:reduce)');
    const stopped=()=>reduced.matches||doc.documentElement.dataset.reduceMotion==='true';
    const makeLayer=()=>{const c=doc.createElement('canvas');c.width=c.height=side;return c;};
    const back=makeLayer(),front=makeLayer(),sphere=makeLayer();
    const drawSphere=()=>{
      const sphereContext=sphere.getContext('2d'),r=bodyRadius*scale;
      const lighting=sphereContext.createRadialGradient(center-r*.35,center-r*.4,r*.03,center-r*.16,center-r*.2,r*1.18);
      for(const [stop,color] of [[0,'#bac7ad'],[.22,'#8c9f83'],[.55,'#4e6652'],[.82,'#23392d'],[1,'#101d16']])lighting.addColorStop(stop,color);
      sphereContext.clearRect(0,0,side,side);sphereContext.fillStyle=lighting;sphereContext.beginPath();sphereContext.arc(center,center,r,0,tau);sphereContext.fill();
    };
    const tracks=()=>{
      const dark=doc.documentElement.dataset.theme==='dark';
      for(const c of [back,front])c.getContext('2d').clearRect(0,0,side,side);
      const c=back.getContext('2d');
      for(const orbit of groups){
        c.strokeStyle=`rgba(${(dark?orbit.light:orbit.color).join(',')},.58)`;
        c.lineWidth=2;c.beginPath();
        c.ellipse(center,center,orbit.radius*scale,orbit.radius*scale*Math.cos(tilt),angle,0,tau);
        c.stroke();
      }
    };
    let elapsed=0,last=0,raf=0,active=null,returnTo=null,hadDetail=false;
    const showTooltip=moon=>{
      if(mobile.matches)return;
      active=moon;tooltip.textContent=moon.item.label;tooltip.hidden=false;
    };
    const moons=groups.flatMap(orbit=>orbit.projects.map((item,index)=>{
      const button=mapButtons.get(item.id);button.classList.add('project-satellite');
      button.dataset.projectId=item.id;button.dataset.orbit=orbit.id;
      orbit.surface.forEach((color,i)=>button.style.setProperty(`--moon-${i}`,color));

      const moon={item,orbit,phase:orbit.phase+index*tau/orbit.projects.length,button};
      button.addEventListener('pointerenter',()=>showTooltip(moon));
      button.addEventListener('pointerleave',()=>{if(doc.activeElement!==button){active=null;tooltip.hidden=true;}});
      button.addEventListener('focus',()=>showTooltip(moon));
      button.addEventListener('blur',()=>{active=null;tooltip.hidden=true;});
      button.addEventListener('pointerdown',event=>event.stopPropagation());
      button.addEventListener('click',()=>{active=null;returnTo=mobile.matches?node:button;tooltip.hidden=true;});
      layer.append(button);return moon;
    }));
    const preview=doc.querySelector('.point-preview'),picker=doc.createElement('div'),backButton=doc.createElement('button');
    picker.className='project-orbit-picker';picker.hidden=true;
    backButton.type='button';backButton.className='project-orbit-back';backButton.textContent='Все проекты';backButton.hidden=true;
    preview.querySelector('.point-preview__head').before(backButton);
    preview.querySelector('.point-preview__description').before(picker);
    let pickerSession=false;
    const openPicker=()=>{pickerSession=true;returnTo=mobileOpen;node.click();};
    node.addEventListener('click',()=>{pickerSession=true;returnTo=node;});backButton.addEventListener('click',openPicker);
    for(const group of groups){
      const section=doc.createElement('section'),heading=doc.createElement('h3');heading.textContent=group.title;
      section.style.setProperty('--group-color',`rgb(${group.color.join(',')})`);
      section.style.setProperty('--group-light',`rgb(${group.light.join(',')})`);section.append(heading);
      for(const item of group.projects){
        const button=doc.createElement('button');button.type='button';button.dataset.pickerProject=item.id;
        button.textContent=doc.querySelector(`[data-map-label-id="${item.id}"]`)?.textContent||item.label;
        button.addEventListener('click',()=>{pickerSession=true;returnTo=mobileOpen;doc.querySelector(`.map-node[data-map-id="${item.id}"]`)?.click();});
        section.append(button);
      }
      picker.append(section);
    }
    const syncPicker=()=>{
      const selected=mobile.matches&&!preview.hidden&&node.getAttribute('aria-expanded')==='true';
      preview.classList.toggle('is-project-picker',selected);picker.hidden=!selected;
      if(preview.hidden)pickerSession=false;
      backButton.hidden=!mobile.matches||!pickerSession||selected||preview.hidden;
      if(selected)pickerSession=true;
    };
    new MutationObserver(syncPicker).observe(node,{attributes:true,attributeFilter:['aria-expanded']});
    new MutationObserver(syncPicker).observe(preview,{attributes:true,attributeFilter:['hidden']});
    const syncInput=()=>{
      enabled=!map.matches('[data-time-view],[data-observation-active]');
      doc.body.classList.toggle('has-practice-orbits',enabled);
      for(const path of doc.querySelectorAll('.map-links path')){
        path.classList.toggle('is-orbit-project-link',projects.some(item=>item.id===path.dataset.childId));
      }
      layer.hidden=!enabled;
      for(const moon of moons){
        moon.button.classList.toggle('project-satellite',enabled);
        moon.button.toggleAttribute('data-orbit-decorative',enabled&&mobile.matches);
        (enabled?layer:nativeRoot).append(moon.button);
        if(!enabled){moon.button.style.removeProperty('transform');moon.button.style.removeProperty('visibility');moon.button.style.removeProperty('z-index');}
      }
      syncMapNodeAvailability();
      if(doc.activeElement?.hasAttribute('data-orbit-decorative'))setMapRovingId('private-practice',{focus:true});
      active=null;tooltip.hidden=true;syncPicker();
    };
    mobile.addEventListener('change',syncInput);
    new MutationObserver(syncInput).observe(map,{attributes:true,attributeFilter:['data-time-view','data-observation-active']});
    syncInput();
    const system=gravity?createSystem(moons.map(moon=>({id:moon.item.id,radius:moon.orbit.radius,phase:moon.phase})),{weights:audienceWeights}):null;
    let accumulator=0;
    const paint=()=>{
      const rect=canvas.getBoundingClientRect();
      const blocked=doc.body.matches('.has-reading-surface,.has-command-focus,.has-constellation-nav,.has-settings-panel');
      layer.inert=blocked;if(blocked){active=null;tooltip.hidden=true;}
      if(!enabled)return;
      const detailOpen=doc.body.matches('.has-reading-surface,.has-point-preview');
      if(hadDetail&&!detailOpen&&returnTo){const target=returnTo;returnTo=null;target.focus({preventScroll:true});}
      hadDetail=detailOpen;
      if(Math.abs(rect.width-previousWidth)>.2){previousWidth=rect.width;bodyRadius=(win.innerWidth>900?34:28)/Math.max(1,rect.width)*1.3;drawSphere();}
      const labelRoot=label.offsetParent;
      if(labelRoot){
        const rootRect=labelRoot.getBoundingClientRect();
        label.style.setProperty('--project-caption-x',`${(rect.left+rect.width/2-rootRect.left)*labelRoot.offsetWidth/rootRect.width}px`);
        const orbitHalfHeight=groups.at(-1).radius*Math.hypot(Math.sin(angle),Math.cos(tilt)*Math.cos(angle));
        const captionBottom=rect.top+rect.height*(.5-orbitHalfHeight/2.6)-10;
        label.style.setProperty('--project-caption-y',`${(captionBottom-rootRect.top)*labelRoot.offsetHeight/rootRect.height}px`);
      }
      ctx.clearRect(0,0,side,side);ctx.drawImage(back,0,0);ctx.drawImage(sphere,0,0);ctx.drawImage(front,0,0);
      for(const [index,moon] of moons.entries()){
        const body=system?.bodies[index+1],core=system?.bodies[0];
        const p=body?project(body.x-core.x,body.y-core.y):point(moon.orbit.radius,moon.phase+elapsed*tau/moon.orbit.period),[cx,cy]=xy(p);
        const x=rect.left+cx/side*rect.width,y=rect.top+cy/side*rect.height;
        moon.button.style.transform=`translate(${x-12}px,${y-12}px)`;
        moon.button.style.visibility=p[2]<0&&Math.hypot(p[0],p[1])<bodyRadius+.045?'hidden':'visible';
        moon.button.style.zIndex=String(Math.round(100+p[2]*50));
        if(active===moon){
          const w=tooltip.offsetWidth,h=tooltip.offsetHeight;
          const left=x<rect.left+rect.width/2?x-w-14:x+14;
          const top=y<rect.top+rect.height/2?y-h-12:y+12;
          tooltip.style.left=`${Math.max(12,Math.min(win.innerWidth-w-12,left))}px`;
          tooltip.style.top=`${Math.max(12,Math.min(win.innerHeight-h-12,top))}px`;
        }
      }
      canvas.dataset.orbitTime=elapsed.toFixed(2);canvas.dataset.projectCount=String(moons.length);
      canvas.dataset.gravity=String(gravity);
    };
    const tick=time=>{
      raf=0;if(doc.hidden)return;
      if(enabled&&!layer.inert&&!stopped()&&!active){
        const dt=last?Math.min(100,time-last)/1000:0;elapsed+=dt;
        if(system){accumulator+=dt;while(accumulator>=STEP){system.step();accumulator-=STEP;}}
      }
      last=time;paint();raf=requestAnimationFrame(tick);
    };
    const sync=()=>{cancelAnimationFrame(raf);last=0;tracks();paint();if(!doc.hidden)raf=requestAnimationFrame(tick);};
    new MutationObserver(sync).observe(doc.documentElement,{attributes:true,attributeFilter:['data-theme','data-reduce-motion']});
    doc.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
    win.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);layer.remove();tooltip.remove();});
    sync();
}
initializePracticeOrbits();
