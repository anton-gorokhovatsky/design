import {pane} from './pane-viewport.js';
import { mapItems } from './map-data.js';
import { mapButtons, syncMapNodeAvailability, setMapRovingId, syncMapAtmospherePosition } from './map-engine.js';
import { createSystem, STEP } from './orbit-physics.js';
import { audienceMassWeights, audienceSizeScales } from './practice-audience.js';

const projects = mapItems.filter(item => item.parent === 'private-practice');
const projectIcons = {
  shirokostup:'assets/project-icons/shirokostup.svg',tarski:'assets/project-icons/tarski.png',
  herman:'assets/project-icons/herman.png','ks-fish':'assets/project-icons/ks-fish.png',
  'hotline-camp':'assets/project-icons/hotline-camp.svg',eleven:'assets/project-icons/eleven.svg',
  doronin:'assets/project-icons/doronin.svg',krainiuk:'assets/project-icons/krainiuk.svg',
};
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
].map(group => ({ ...group, projects: projects.filter(item => category(item) === group.id) }));

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
    const mobile=pane.media('(max-width:900px)');
    const nativeRoot=doc.querySelector('[data-map-nodes]'), map=doc.querySelector('[data-practice-map]');
    const home=doc.querySelector('.focused-home');
    (doc.querySelector('main')||doc.body).append(layer,tooltip);
    let enabled=true;
    const ctx = canvas.getContext('2d');
    const side=672,center=side/2,scale=side/2.6;
    let bodyRadius=.22,previousWidth=0;
    const tau=Math.PI*2,angle=-16*Math.PI/180,tilt=48*Math.PI/180;
    const project=(u,v)=>{
      return [u*Math.cos(angle)-v*Math.cos(tilt)*Math.sin(angle),u*Math.sin(angle)+v*Math.cos(tilt)*Math.cos(angle),v*Math.sin(tilt)];
    };
    const xy=([x,y])=>[center+x*scale,center+y*scale];
    const reduced=win.matchMedia('(prefers-reduced-motion:reduce)');
    const stopped=()=>reduced.matches||doc.documentElement.dataset.reduceMotion==='true';
    const makeLayer=()=>{const c=doc.createElement('canvas');c.width=c.height=side;return c;};
    const back=makeLayer(),sphere=makeLayer();
    const drawSphere=()=>{
      const sphereContext=sphere.getContext('2d'),r=bodyRadius*scale;
      const lighting=sphereContext.createRadialGradient(center-r*.35,center-r*.4,r*.03,center-r*.16,center-r*.2,r*1.18);
      for(const [stop,color] of [[0,'#bac7ad'],[.22,'#8c9f83'],[.55,'#4e6652'],[.82,'#23392d'],[1,'#101d16']])lighting.addColorStop(stop,color);
      sphereContext.clearRect(0,0,side,side);sphereContext.fillStyle=lighting;sphereContext.beginPath();sphereContext.arc(center,center,r,0,tau);sphereContext.fill();
    };
    const tracks=()=>{
      const dark=doc.documentElement.dataset.theme==='dark';
      const c=back.getContext('2d');c.clearRect(0,0,side,side);
      for(const orbit of groups){
        c.strokeStyle=`rgba(${(dark?orbit.light:orbit.color).join(',')},.58)`;
        c.lineWidth=2;c.beginPath();
        c.ellipse(center,center,orbit.radius*scale,orbit.radius*scale*Math.cos(tilt),angle,0,tau);
        c.stroke();
      }
    };
    let last=0,raf=0,active=null,returnTo=null,hadDetail=false;
    const showTooltip=moon=>{
      if(mobile.matches)return;
      active=moon;tooltip.textContent=moon.item.label;tooltip.hidden=false;
    };
    const moons=groups.flatMap(orbit=>orbit.projects.map((item,index)=>{
      const button=mapButtons.get(item.id);button.classList.add('project-satellite');
      button.dataset.projectId=item.id;button.dataset.orbit=orbit.id;
      button.style.setProperty('--audience-size', audienceSizeScales[item.id]);
      orbit.surface.forEach((color,i)=>button.style.setProperty(`--moon-${i}`,color));

      const moon={item,orbit,phase:orbit.phase+index*tau/orbit.projects.length,button};
      button.addEventListener('pointerenter',()=>showTooltip(moon));
      button.addEventListener('pointerleave',()=>{if(!button.matches(':focus-visible')){active=null;tooltip.hidden=true;}});
      button.addEventListener('focus',()=>{if(button.matches(':focus-visible'))showTooltip(moon);});
      button.addEventListener('blur',()=>{active=null;tooltip.hidden=true;});
      button.addEventListener('pointerdown',event=>event.stopPropagation());
      button.addEventListener('click',()=>{active=null;returnTo=mobile.matches?node:button;tooltip.hidden=true;});
      layer.append(button);return moon;
    }));
    const preview=doc.querySelector('.point-preview'),picker=doc.createElement('div'),backButton=doc.createElement('button');
    picker.className='project-orbit-picker';picker.hidden=true;
    // Adjacent glass planes share one material; content scrolls behind the header.
    const pickerHead=preview.querySelector('.point-preview__head'),pickerGlass=doc.createElement('div');
    pickerGlass.className='project-picker-glass';pickerGlass.hidden=true;pickerGlass.setAttribute('aria-hidden','true');
    pickerGlass.dataset.materialSurface='project-picker-body';pickerGlass.dataset.materialActive='always';
    preview.prepend(pickerGlass);
    const sizePickerHead=()=>{if(!picker.hidden)preview.style.setProperty('--picker-head-height',`${pickerHead.getBoundingClientRect().height}px`);};
    new ResizeObserver(sizePickerHead).observe(pickerHead);
    backButton.type='button';backButton.className='project-orbit-back';backButton.textContent='Все проекты';backButton.hidden=true;
    preview.querySelector('.point-preview__head').before(backButton);
    preview.querySelector('.point-preview__description').before(picker);
    const motionStatus=doc.createElement('p');motionStatus.hidden=true;motionStatus.setAttribute('role','status');
    motionStatus.textContent='Движение приостановлено. Проекты по-прежнему можно открыть.';
    picker.before(motionStatus);
    let pickerSession=false;
    const openPicker=()=>{pickerSession=true;returnTo=node;node.click();};
    node.addEventListener('click',()=>{pickerSession=true;returnTo=node;});backButton.addEventListener('click',openPicker);
    for(const group of groups){
      const section=doc.createElement('section'),heading=doc.createElement('h3');heading.textContent=group.title;
      section.className='project-atlas-group';
      const track=doc.createElementNS('http://www.w3.org/2000/svg','svg');
      track.classList.add('project-atlas-track');track.setAttribute('aria-hidden','true');
      track.append(doc.createElementNS(track.namespaceURI,'path'));section.append(track);
      section.style.setProperty('--group-color',`rgb(${group.color.join(',')})`);
      section.style.setProperty('--group-light',`rgb(${group.light.join(',')})`);section.append(heading);
      for(const item of group.projects){
        const button=doc.createElement('button');button.type='button';button.dataset.pickerProject=item.id;
        const mark=doc.createElement('span'),name=doc.createElement('span');
        mark.className='project-atlas-mark';mark.setAttribute('aria-hidden','true');
        mark.textContent=({shirokostup:'ОШ',tarski:'T',herman:'ГВ','ks-fish':'КС','hotline-camp':'H',dusty:'DM','dd-camp':'DD',eleven:'11',doronin:'Д',krainiuk:'К'})[item.id];
        if(projectIcons[item.id]){
          const image=doc.createElement('img');image.alt='';image.width=image.height=24;image.loading='lazy';image.decoding='async';
          image.src=projectIcons[item.id];
          image.addEventListener('load',()=>mark.replaceChildren(image));
          image.addEventListener('error',()=>image.remove());mark.append(image);
        }
        name.className='project-atlas-name';
        name.textContent=doc.querySelector(`[data-map-label-id="${item.id}"]`)?.textContent||item.label;
        button.append(mark,name);
        button.addEventListener('click',()=>{pickerSession=true;returnTo=node;doc.querySelector(`.map-node[data-map-id="${item.id}"]`)?.click();});
        section.append(button);
      }
      picker.append(section);
    }
    // All groups use one circle; shorter categories show a shorter open arc.
    let atlasFrame=0;
    const sections=[...picker.children];
    const layoutAtlas=()=>{
      atlasFrame=0;
      if(picker.hidden||!picker.getClientRects().length)return;
      const geometry=sections.map(section=>{
        const box=section.getBoundingClientRect(),marks=[...section.querySelectorAll('.project-atlas-mark')];
        const ys=marks.map(mark=>{const rect=mark.getBoundingClientRect();return rect.top-box.top+rect.height/2;});
        return{section,box,marks,ys,span:ys.at(-1)-ys[0]};
      });
      const longest=Math.max(48,...geometry.map(group=>group.span));
      const tail=22,bend=48,left=20,entry=longest*.4,reach=longest-entry+tail;
      const radius=(reach*reach+bend*bend)/(2*bend),cx=left+radius,n=value=>Number(value.toFixed(3));
      for(const{section,box,marks,ys,span}of geometry){
        if(!(span>0)||!box.width)continue;
        const cy=ys[0]+entry,xAt=y=>cx-Math.sqrt(radius*radius-(y-cy)**2);
        marks.forEach((mark,index)=>{
          const row=mark.closest('button'),inset=`${n(xAt(ys[index])-mark.getBoundingClientRect().width/2)}px`;
          if(row.style.getPropertyValue('--arc-inset')!==inset)row.style.setProperty('--arc-inset',inset);
        });
        const start=ys[0]-tail,end=ys.at(-1)+tail,track=section.querySelector('.project-atlas-track');
        track.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
        track.querySelector('path').setAttribute('d',`M${n(xAt(start))} ${n(start)} A${n(radius)} ${n(radius)} 0 0 0 ${n(xAt(end))} ${n(end)}`);
      }
    };
    const scheduleAtlas=()=>{if(!atlasFrame)atlasFrame=requestAnimationFrame(layoutAtlas);};
    const atlasResize=new ResizeObserver(scheduleAtlas);sections.forEach(section=>atlasResize.observe(section));
    doc.fonts.ready.then(scheduleAtlas);
    const syncPicker=()=>{
      const selected=mobile.matches&&!preview.hidden&&node.getAttribute('aria-expanded')==='true';
      preview.classList.toggle('is-project-picker',selected);picker.hidden=!selected;
      pickerGlass.hidden=!selected;preview.dataset.materialActive=selected?'none':'always';
      if(selected){pickerHead.dataset.materialSurface='project-picker-header';pickerHead.dataset.materialActive='always';sizePickerHead();}
      else{delete pickerHead.dataset.materialSurface;delete pickerHead.dataset.materialActive;}
      if(preview.hidden)pickerSession=false;
      backButton.hidden=!mobile.matches||!pickerSession||selected||preview.hidden;
      if(selected){pickerSession=true;scheduleAtlas();}
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
      active=null;tooltip.hidden=true;syncPicker();schedule();
    };
    mobile.addEventListener('change',syncInput);
    new MutationObserver(syncInput).observe(map,{attributes:true,attributeFilter:['data-time-view','data-observation-active']});
    const system=createSystem(moons.map(moon=>({id:moon.item.id,radius:moon.orbit.radius,phase:moon.phase})),{weights:audienceMassWeights});
    let accumulator=0;
    const paint=()=>{
      const rect=canvas.getBoundingClientRect();
      const bounds=doc.body.classList.contains('has-focused-home')?home.getBoundingClientRect():null;
      const clip=bounds?`rect(${bounds.top}px,${bounds.right}px,${bounds.bottom}px,${bounds.left}px)`:'';
      if(layer.style.clip!==clip)layer.style.clip=clip;
      const blocked=doc.body.matches('.has-reading-surface,.has-command-focus,.has-constellation-nav,.has-settings-panel');
      layer.inert=blocked;if(blocked){active=null;tooltip.hidden=true;}
      if(!enabled)return syncMapAtmospherePosition();
      const detailOpen=doc.body.matches('.has-reading-surface,.has-point-preview');
      if(hadDetail&&!detailOpen&&returnTo){const target=returnTo;returnTo=null;target.focus({preventScroll:true});}
      hadDetail=detailOpen;
      if(Math.abs(rect.width-previousWidth)>.2){previousWidth=rect.width;bodyRadius=(pane.width>900?34:28)/Math.max(1,rect.width)*1.3;drawSphere();}
      const labelRoot=label.offsetParent;
      if(labelRoot){
        const rootRect=labelRoot.getBoundingClientRect();
        label.style.setProperty('--project-caption-x',`${(rect.left+rect.width/2-rootRect.left)*labelRoot.offsetWidth/rootRect.width}px`);
        const orbitHalfHeight=groups.at(-1).radius*Math.hypot(Math.sin(angle),Math.cos(tilt)*Math.cos(angle));
        const captionBottom=rect.top+rect.height*(.5-orbitHalfHeight/2.6)-10;
        label.style.setProperty('--project-caption-y',`${(captionBottom-rootRect.top)*labelRoot.offsetHeight/rootRect.height}px`);
      }
      ctx.clearRect(0,0,side,side);ctx.drawImage(back,0,0);ctx.drawImage(sphere,0,0);
      for(const [index,moon] of moons.entries()){
        const body=system.bodies[index+1],core=system.bodies[0];
        const p=project(body.x-core.x,body.y-core.y),[cx,cy]=xy(p);
        const x=rect.left+cx/side*rect.width,y=rect.top+cy/side*rect.height;
        moon.button.style.transform=`translate(${x-12}px,${y-12}px)`;
        moon.button.style.visibility=p[2]<0&&Math.hypot(p[0],p[1])<bodyRadius+.045?'hidden':'visible';
        moon.button.style.zIndex=String(Math.round(100+p[2]*50));
        if(active===moon){
          const w=tooltip.offsetWidth,h=tooltip.offsetHeight;
          const left=x<rect.left+rect.width/2?x-w-14:x+14;
          const top=y<rect.top+rect.height/2?y-h-12:y+12;
          tooltip.style.left=`${Math.max(12,Math.min(pane.width-w-12,left))}px`;
          tooltip.style.top=`${Math.max(12,Math.min(pane.height-h-12,top))}px`;
        }
      }
      syncMapAtmospherePosition();
      canvas.dataset.orbitTime=system.time.toFixed(2);canvas.dataset.projectCount=String(moons.length);
      canvas.dataset.gravity='true';
    };
    const playing=()=>enabled&&!layer.inert&&!stopped()&&!active&&!system.failure;
    const schedule=()=>{if(!raf&&!doc.hidden)raf=requestAnimationFrame(tick);};
    const tick=time=>{
      raf=0;if(doc.hidden)return;
      if(playing()){
        const dt=last?Math.min(100,time-last)/1000:0;
        accumulator+=dt;while(accumulator>=STEP){
          if(!system.step()){motionStatus.hidden=false;canvas.dataset.physicsPaused=system.failure;accumulator=0;break;}
          accumulator-=STEP;
        }
      }
      last=time;paint();
      // Paused physics still follows CSS placement until the transition settles.
      if(playing()||doc.getAnimations().some(a=>a instanceof CSSTransition&&a.playState==='running'
        &&(a.effect.target.matches('.map-node')||a.effect.target.contains(node))))schedule();
      else last=0;
    };
    const sync=()=>{cancelAnimationFrame(raf);raf=0;last=0;tracks();schedule();};
    const placement=new MutationObserver(schedule);
    for(const target of [node,doc.body])placement.observe(target,{attributes:true,attributeFilter:['style','class']});
    new ResizeObserver(schedule).observe(canvas);
    home.addEventListener('scroll',schedule,{passive:true});
    win.addEventListener('map-layout',schedule);doc.addEventListener('transitionrun',schedule);
    for(const type of ['pointerenter','pointerleave','focus','blur','click'])layer.addEventListener(type,schedule,true);
    new MutationObserver(sync).observe(doc.documentElement,{attributes:true,attributeFilter:['data-theme','data-reduce-motion']});
    doc.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
    // Back/Forward can retain this document: pause it without detaching its projects.
    win.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);raf=0;last=0;active=null;tooltip.hidden=true;});
    win.addEventListener('pageshow',()=>{syncInput();sync();});
    syncInput();sync();
}
initializePracticeOrbits();
