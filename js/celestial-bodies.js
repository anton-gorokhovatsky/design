import "./map-engine.js";

// Illustrative light transport: art-directed disk warp, 3D pulsar projection.
// One restrained scattering profile for the two self-luminous objects.
// Their different emission colours remain semantic, with warm neutral highlights.
const LIGHT={scatter:{dark:.22,light:.10},beamEnvelope:.12};
const TAU=Math.PI*2;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const mix=(a,b,t)=>a+(b-a)*t;
function gasTexture(){
  const values=new Float32Array(512*128),lattice=new Float32Array(64*64);
  let seed=7319;
  for(let i=0;i<lattice.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;lattice[i]=seed/4294967296;}
  const noise=(x,y)=>{
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const at=(dx,dy)=>lattice[((ix+dx)&63)+(((iy+dy)&63)*64)];
    return mix(mix(at(0,0),at(1,0),sx),mix(at(0,1),at(1,1),sx),sy);
  };
  for(let row=0;row<128;row++)for(let col=0;col<512;col++){
    const r=.45+row/127*.65,a=col/512*TAU;
    const n=noise(Math.cos(a)*r*12+30,Math.sin(a)*r*12+30);
    const fine=noise(Math.cos(a)*r*35+30,Math.sin(a)*r*35+30);
    values[row*512+col]=.67+.20*n+.12*fine+.10*Math.sin(r*195+2.7*n+Math.sin(a*5+r*20));
  }
  return values;
}
function blackHole(canvas){
  const size=320,extent=1.35,context=canvas.getContext('2d');
  canvas.width=canvas.height=size;
  const light=canvas.ownerDocument.createElement('canvas');light.width=light.height=size;
  const lc=light.getContext('2d'),image=lc.createImageData(size,size),texture=gasTexture();
  const layers=[],shadow=context.createImageData(size,size),turn=-.18,ct=Math.cos(turn),st=Math.sin(turn);
  // Cache geometry and shadow. Only the material moves from frame to frame.
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
    const sx=((px+.5)/size*2-1)*extent,sy=((py+.5)/size*2-1)*extent;
    const x=sx*ct+sy*st,y=-sx*st+sy*ct,r=Math.hypot(x,y),offset=(py*size+px)*4,samples=[];
    const add=(radius,angle,amount)=>{
      if(radius<.46||radius>1.10||amount<=0)return;
      const inner=smooth(.46,.53,radius),outer=1-smooth(.82,1.10,radius),heat=Math.pow(.53/radius,2.5);
      const brightness=inner*outer*heat*(1-.53*Math.cos(angle))*amount;
      if(brightness<.002)return;
      const row=Math.min(127,Math.floor((radius-.45)/.65*127));
      samples.push({row:row*512,angle:(angle/TAU+1)*512,weight:brightness,speed:.10/Math.pow(radius,1.5),heat});
    };
    // Distorted far-side disk images, above and below the opaque shadow.
    if(r>.427){
      if(y<0)add(Math.hypot(x,y/.83),Math.atan2(y/.83,x),.74);
      else add(Math.hypot(x,y/.71),Math.atan2(-y/.71,x),.19);
      add(Math.hypot(x,y/.235),Math.atan2(y/.235,x),.62);
      const rim=Math.exp(-Math.pow((r-.438)/.009,2))*(.18-.07*x/.44);
      if(rim>.001)samples.push({row:0,angle:0,weight:rim,speed:0,heat:1});
    }
    // The near side is in front of the shadow.
    if(y>=0)add(Math.hypot(x,y/.235),Math.atan2(y/.235,x),1.15);
    if(samples.length)layers.push({offset,samples});
    if(r<.434){shadow.data[offset]=3;shadow.data[offset+1]=5;shadow.data[offset+2]=4;shadow.data[offset+3]=255*(1-smooth(.422,.434,r));}
  }
  return (seconds,dark)=>{
    const pixels=image.data;pixels.fill(0);
    for(const pixel of layers){
      let energy=0,heat=0,weight=0;
      for(const s of pixel.samples){
        const u=s.angle-seconds*s.speed*512,iu=Math.floor(u),blend=u-iu;
        const grain=mix(texture[s.row+(iu&511)],texture[s.row+((iu+1)&511)],blend);
        energy+=grain*s.weight;heat+=s.heat*s.weight;weight+=s.weight;
      }
      const intensity=1-Math.exp(-energy*1.65),o=pixel.offset;
      if(dark){
        const hot=clamp((heat-.12)*1.15);
        pixels[o]=mix(111,246,hot);pixels[o+1]=mix(108,235,hot);pixels[o+2]=mix(83,197,hot);
        pixels[o+3]=intensity*255;
      }else{
        // On a pale field, low energy must fade out instead of becoming grey.
        // Temperature belongs to the sampled material, independently of opacity.
        const hot=clamp((heat/Math.max(weight,.001)-.18)*1.22);
        pixels[o]=mix(167,255,hot);pixels[o+1]=mix(132,239,hot);pixels[o+2]=mix(71,198,hot);
        pixels[o+3]=Math.pow(intensity,1.2)*(.55+.45*hot)*255;
      }
    }
    lc.putImageData(image,0,0);context.putImageData(shadow,0,0);
    context.save();context.globalAlpha=dark?LIGHT.scatter.dark:LIGHT.scatter.light;context.filter='blur(4px)';context.drawImage(light,0,0);context.restore();
    context.drawImage(light,0,0);
  };
}
function pulsar(canvas){
  const size=512,context=canvas.getContext('2d'),center=size/2,core=27;
  canvas.width=canvas.height=size;
  // A luminous source, not a lit planetary surface. Each sprite is a soft
  // cross-section of a narrow illustrative radiation beam, projected in 3D.
  const sprites=[false,true].map(dark=>{
    const sprite=canvas.ownerDocument.createElement('canvas');sprite.width=sprite.height=96;
    const sc=sprite.getContext('2d'),glow=sc.createRadialGradient(48,48,0,48,48,48);
    glow.addColorStop(0,dark?'rgba(233,237,240,.82)':'rgba(112,133,163,.65)');
    glow.addColorStop(.18,dark?'rgba(170,188,217,.60)':'rgba(112,130,163,.48)');
    glow.addColorStop(.46,dark?'rgba(139,153,184,.25)':'rgba(121,132,159,.21)');
    glow.addColorStop(.76,'rgba(139,149,171,.045)');glow.addColorStop(1,'rgba(139,149,171,0)');
    sc.fillStyle=glow;sc.fillRect(0,0,96,96);return sprite;
  });
  const body=canvas.ownerDocument.createElement('canvas');body.width=body.height=128;
  const bc=body.getContext('2d'),surface=bc.createImageData(128,128),normals=[];
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const nx=(x+.5-64)/48,ny=(y+.5-64)/48,r2=nx*nx+ny*ny;
    if(r2<1)normals.push({o:(y*128+x)*4,x:nx,y:ny,z:Math.sqrt(1-r2),edge:1-smooth(.985,1,Math.sqrt(r2))});
  }
  // Two poles stand for two alternating steps. 180 steps/min = 90 turns/min;
  // Slow the cadence by 12 for a readable eight-second visual rotation.
  const cadence=180,stepsPerTurn=2,timeScale=12,period=60*stepsPerTurn*timeScale/cadence;
  canvas.dataset.cadence=String(cadence);canvas.dataset.rotationPeriod=String(period);
  const tilt=.08,obliquity=.87,roll=.07,focalLength=core*24;
  return (seconds,dark)=>{
    context.clearRect(0,0,size,size);
    const phase=seconds*TAU/period-.9,sprite=sprites[Number(dark)];
    // A fixed spin axis, and an oblique magnetic axis. The observer-dependent
    // light varies with the same geometry; there is no unrelated blink timer.
    const ax=Math.sin(obliquity)*Math.cos(phase);
    const ay=-Math.cos(obliquity)*Math.cos(tilt)+Math.sin(obliquity)*Math.sin(phase)*Math.sin(tilt);
    const mx=ax*Math.cos(roll)-ay*Math.sin(roll),my=ax*Math.sin(roll)+ay*Math.cos(roll);
    const mz=Math.cos(obliquity)*Math.sin(tilt)+Math.sin(obliquity)*Math.sin(phase)*Math.cos(tilt);
    const pulse=Math.exp(-(1-Math.abs(mz))/.16),projection=Math.hypot(mx,my);
    // Surface emission follows the magnetic poles rather than a fixed lamp.
    // This is a simple thermal-cap illustration, without a GR surface model.
    for(const n of normals){
      const dot=n.x*mx+n.y*my+n.z*mz;
      const cap=Math.exp(-(1-Math.abs(dot))/.07),light=.60+.30*n.z+.45*cap;
      const o=n.o,p=surface.data;
      p[o]=mix(132,250,clamp(light));p[o+1]=mix(154,250,clamp(light));
      p[o+2]=mix(188,247,clamp(light+.07));p[o+3]=255*n.edge;
    }
    bc.putImageData(surface,0,0);
    const beam=(sign)=>{
      const depth=mz*sign,angle=Math.atan2(my*sign,mx*sign);
      for(let i=95;i>=0;i--){
        const t=i/95,distance=core*(1.02+7.1*t),perspective=focalLength/(focalLength-depth*distance);
        const width=core*(.25+.08*t)*perspective;
        const along=Math.hypot(width*depth,core*.16*projection*perspective);
        context.save();context.translate(center+mx*sign*distance*perspective,center+my*sign*distance*perspective);context.rotate(angle);
        // Bright axial beam with a faint scattered envelope. Exponential
        // falloff makes it disappear before the canvas edge, without a tip.
        context.globalAlpha=clamp(Math.exp(-2.45*t)*(1-smooth(.78,1,t))
          *(.55+.57*smooth(-.85,.85,depth))*core*.18/along*(1+.22*pulse));
        context.drawImage(sprite,-along,-width,along*2,width*2);
        context.globalAlpha*=LIGHT.beamEnvelope;
        context.drawImage(sprite,-along*1.6,-width*3.2,along*3.2,width*6.4);context.restore();
      }
    };
    // Soft surrounding emission establishes volume without a hard halo edge.
    context.save();context.globalAlpha=(dark?LIGHT.scatter.dark:LIGHT.scatter.light)*(1+.25*pulse);
    context.drawImage(sprite,center-core*2.8,center-core*2.8,core*5.6,core*5.6);context.restore();
    const front=mz>=0?1:-1;
    beam(-front);
    context.drawImage(body,center-core*4/3,center-core*4/3,core*8/3,core*8/3);
    beam(front);
    context.save();context.globalAlpha=.28+.30*pulse;
    context.drawImage(sprites[1],center-core*.85,center-core*.85,core*1.7,core*1.7);context.restore();
  };
}
function mountVolumes(doc){
  const root=doc.documentElement,win=doc.defaultView,painters=[];
  for(const [id,create] of [['garage',blackHole],['running',pulsar]]){
    const glyph=doc.querySelector(`[data-map-id="${id}"] .map-node__glyph`),canvas=doc.createElement('canvas');
    canvas.className=`celestial-volume celestial-volume--${id}`;canvas.setAttribute('aria-hidden','true');glyph.append(canvas);
    painters.push({canvas,paint:create(canvas),visible:true});
  }
  const reduced=win.matchMedia('(prefers-reduced-motion:reduce)'),forced=win.matchMedia('(forced-colors:active)');
  let frame=0,last=0,seconds=1.8;
  const active=()=>root.hasAttribute('data-celestial-volume')&&!root.hasAttribute('data-celestial-paused')
    &&root.dataset.reduceMotion!=='true'&&!reduced.matches&&!forced.matches&&!doc.hidden
    &&painters.some(p=>p.visible&&p.canvas.closest('[data-map-id]').getAttribute('aria-hidden')!=='true');
  const paint=()=>{
    const start=performance.now();
    for(const p of painters){
      if(!p.visible||p.canvas.closest('[data-map-id]').getAttribute('aria-hidden')==='true')continue;
      p.paint(seconds,root.dataset.theme==='dark');p.canvas.dataset.renderTime=seconds.toFixed(3);
    }
    root.dataset.celestialFrameMs=(performance.now()-start).toFixed(2);
  };
  const tick=(time)=>{
    frame=0;if(!active())return;
    if(!last||time-last>=1000/24){seconds+=last?Math.min(.1,(time-last)/1000):0;last=time;paint();}
    frame=win.requestAnimationFrame(tick);
  };
  const sync=()=>{
    win.cancelAnimationFrame(frame);frame=0;last=0;
    if(root.hasAttribute('data-celestial-volume'))paint();
    if(active())frame=win.requestAnimationFrame(tick);
  };
  new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['data-celestial-volume','data-celestial-paused','data-theme','data-reduce-motion']});
  reduced.addEventListener('change',sync);forced.addEventListener('change',sync);
  doc.addEventListener('visibilitychange',sync);
  const visibility=new IntersectionObserver(entries=>{
    for(const entry of entries){const p=painters.find(p=>p.canvas===entry.target);if(p)p.visible=entry.isIntersecting;}
    sync();
  });
  painters.forEach(p=>visibility.observe(p.canvas));
  const nodeState=new MutationObserver(sync);
  painters.forEach(p=>nodeState.observe(p.canvas.closest('[data-map-id]'),{attributes:true,attributeFilter:['aria-hidden']}));
  // Observers belong to the retained document and must survive cached returns.
  win.addEventListener('pagehide',()=>{win.cancelAnimationFrame(frame);frame=0;last=0;});
  win.addEventListener('pageshow',sync);sync();
}

// Decorative bodies stay inside the map's existing navigation buttons.
const doc=document,root=doc.documentElement;
const cluster=doc.querySelector('[data-map-id="early-career"] .map-node__glyph');
if(cluster)cluster.insertAdjacentHTML('beforeend',`<svg class="celestial-form" aria-hidden="true" viewBox="-100 -100 200 200" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="cluster"><stop stop-color="#e2dfbd"/><stop offset=".22" stop-color="#b5ba99"/><stop offset=".65" stop-color="#68765b"/><stop offset="1" stop-color="#2c3c2d"/></radialGradient><radialGradient id="clusterMist"><stop stop-color="#a7b09a" stop-opacity=".13"/><stop offset="1" stop-color="#a7b09a" stop-opacity="0"/></radialGradient></defs><ellipse rx="85" ry="73" fill="url(#clusterMist)"/><circle cx="-26" cy="-22" r="24" fill="url(#cluster)"/><circle cx="31" cy="1" r="18" fill="url(#cluster)"/><circle cx="-12" cy="35" r="14" fill="url(#cluster)"/></svg>`);
root.setAttribute('data-celestial-volume','');
const syncPause=()=>root.toggleAttribute('data-celestial-paused',doc.hidden
  ||doc.body.matches('.has-reading-surface,.has-point-preview,.has-settings-panel,.has-constellation-nav,.has-command-focus'));
new MutationObserver(syncPause).observe(doc.body,{attributes:true,attributeFilter:['class']});
doc.addEventListener('visibilitychange',syncPause);
doc.defaultView.addEventListener('pageshow',syncPause);syncPause();
mountVolumes(doc);
