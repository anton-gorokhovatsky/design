import { requestMapLinksRender } from "./map-engine.js";
import { initializeBlackHoleLens } from "./signal-field.js";

// Schwarzschild null geodesics and an authored thin disk; projected 3D pulsar.
// Geometry and limits: docs/black-hole-rendering.md.
const LIGHT={scatter:{dark:.22,light:.10},beamEnvelope:.12};
const TAU=Math.PI*2;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const mix=(a,b,t)=>a+(b-a)*t;

const CRITICAL_IMPACT = Math.sqrt(27) / 2;
const MAX_IMPACT = 18;
const MAX_ANGLE = Math.PI * 3;
const TABLE_WIDTH = 2048;
const TABLE_HEIGHT = 1024;
function advance(u, v, h) {
  const f = x => 1.5*x*x-x;
  const a=f(u), b=f(u+h*v/2), c=f(u+h*v/2+h*h*a/4), d=f(u+h*v+h*h*b/2);
  return [u+h*v+h*h*(a+b+c)/6, v+h*(a+2*b+2*c+d)/6];
}
function impactAt(t) {
  return t<.25 ? t/.25*2.4 : t<.65 ? 2.4+(t-.25)/.4*.5 : 2.9+(t-.65)/.35*(MAX_IMPACT-2.9);
}
async function makeGeodesics() {
  const table = new Float32Array(TABLE_WIDTH*TABLE_HEIGHT);
  const step=MAX_ANGLE/(TABLE_HEIGHT-1);
  for(let x=0;x<TABLE_WIDTH;x++){
    const b=Math.max(.001,impactAt(x/(TABLE_WIDTH-1)));
    let u=0,v=1/b,ended=false;
    for(let y=1;y<TABLE_HEIGHT;y++){
      if(!ended){[u,v]=advance(u,v,step/2);[u,v]=advance(u,v,step/2);if(u>=1){u=1;ended=true;}else if(u<0){u=0;ended=true;}}
      table[y*TABLE_WIDTH+x]=u;
    }
    if(x%128===127)await new Promise(resolve=>setTimeout(resolve,0));
  }
  return table;
}

let geometry;
const vertex=`#version 300 es
layout(location=0) in vec2 position;out vec2 uv;void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment=`#version 300 es
precision highp float;precision highp sampler2D;
in vec2 uv;out vec4 color;
uniform sampler2D geodesics;uniform float time;uniform vec2 resolution;
const float PI=3.14159265359;
float orbit(float b,float phi){
 float bt=b<2.4?b/2.4*.25:b<2.9?.25+(b-2.4)/.5*.4:.65+(b-2.9)/${MAX_IMPACT-2.9}*.35;
 vec2 p=vec2(bt,phi/${MAX_ANGLE})*vec2(${TABLE_WIDTH-1}.,${TABLE_HEIGHT-1}.);ivec2 a=ivec2(floor(p));vec2 t=fract(p);
 float lo=mix(texelFetch(geodesics,a,0).r,texelFetch(geodesics,a+ivec2(1,0),0).r,t.x);
 float hi=mix(texelFetch(geodesics,a+ivec2(0,1),0).r,texelFetch(geodesics,a+ivec2(1,1),0).r,t.x);
 return mix(lo,hi,t.y);
}
vec4 disk(vec2 q){
 float b=length(q);if(b<.04||b>17.8)return vec4(0.);
 float elev=.22, sn=sin(elev),cs=cos(elev);
 vec3 n=vec3(0.,sn,cs),t=vec3(q.x/b,q.y/b*cs,-q.y/b*sn);
 float phi=atan(sn,-t.y);vec3 light=vec3(0.);float trans=1.,absorption=0.;
 for(int k=0;k<3;k++){
   float f=phi+float(k)*PI;float u=orbit(b,f);float r=1./max(u,.00001);
   if(r>1.&&r<3.1)absorption=max(absorption,1.-smoothstep(2.9,3.1,r));
   if(r>3.&&r<13.){
     vec3 p=n*cos(f)+t*sin(f);float angle=atan(p.z,p.x);
     float omega=inversesqrt(2.*r*r*r);
     float g=sqrt(1.-1.5/r)/(1.+omega*q.x*cs);
     float flux=pow(3./r,3.)*(1.-sqrt(3./r))*18.;
     float edge=smoothstep(3.,3.12,r)*(1.-smoothstep(8.5,13.,r));
     float a=angle-time*omega*.9;
     float flow=1.+.10*sin(5.*a+2.3*log(r))+.065*sin(13.*a-6.*log(r))+.04*sin(31.*a+13.*log(r));
     float fine=.95+.032*sin(49.*log(r)+1.8*sin(3.*a))+.018*sin(113.*log(r)-4.*a);
     float energy=flux*edge*flow*fine*pow(g,3.);
     float hot=clamp(pow(flux,.25)*g*.65,0.,1.);
     vec3 tint=mix(vec3(.78,.59,.30),vec3(1.,.97,.85),hot);
     light+=tint*energy*trans;
     trans*=1.-edge*.94;
   }
 }
 return vec4(light,absorption);
}
void main(){
 vec2 p=(uv-.5)*28.;float turn=-.18;mat2 rotation=mat2(cos(turn),sin(turn),-sin(turn),cos(turn));
 vec4 traced=disk(rotation*p);
 if(abs(length(p)-2.598)<.13){
   vec2 radial=normalize(p),tangent=vec2(-radial.y,radial.x);float pixel=28./resolution.x;traced=vec4(0.);
   for(int i=0;i<8;i++){float offset=(float(i)+.5)/8.-.5;for(int j=0;j<2;j++){vec2 samplePoint=p+radial*offset*pixel+tangent*(float(j)-.5)*pixel*.5;traced+=disk(rotation*samplePoint);}}
   traced/=16.;
 }
 color=vec4(1.-exp(-traced.rgb*1.3),traced.a);
}`;
const blur=`#version 300 es
precision highp float;in vec2 uv;out vec4 color;uniform sampler2D image;uniform vec2 direction;
void main(){vec3 value=texture(image,uv).rgb*.227027;value+=(texture(image,uv+direction*1.384615).rgb+texture(image,uv-direction*1.384615).rgb)*.316216;value+=(texture(image,uv+direction*3.230769).rgb+texture(image,uv-direction*3.230769).rgb)*.070270;color=vec4(value,1.);}`;
const composite=`#version 300 es
precision highp float;in vec2 uv;out vec4 color;
uniform sampler2D image;uniform sampler2D glowImage;uniform vec2 resolution;uniform float dark;
vec3 sampleAt(vec2 p){return texture(image,clamp(p,vec2(0.),vec2(1.))).rgb;}
void main(){
 vec3 emission=sampleAt(uv),bloom=texture(glowImage,uv).rgb;
 float r=length((uv-.5)*28.);float edge=28./resolution.x;
 float shadow=max(texture(image,uv).a,1.-smoothstep(2.598-edge*.55,2.598+edge*.55,r));
 float lum=max(emission.r,max(emission.g,emission.b)),glow=max(bloom.r,max(bloom.g,bloom.b));
 float alpha=clamp(lum+glow*.35,0.,1.);
 vec3 shade=mix(vec3(.53,.40,.19),vec3(1.,.94,.79),dark);
 vec3 tint=mix(shade,vec3(1.,.97,.87),smoothstep(.35,.95,lum));
 vec3 rgb=emission/max(lum,.00001)*tint;
 vec3 base=vec3(.008,.012,.010)*shadow;
 float opacity=shadow+(1.-shadow)*alpha;
 color=vec4(base*(1.-alpha)+rgb*alpha,opacity);
}`;
function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function program(gl,fragmentSource){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fragmentSource));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
async function createGravityLens(canvas){
 const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,premultipliedAlpha:true,depth:false,stencil:false,powerPreference:'low-power'});
 if(!gl)return null;
 const source=program(gl,fragment),blurProgram=program(gl,blur),finish=program(gl,composite);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
 for(const p of[source,blurProgram,finish]){gl.useProgram(p);const a=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);}
 const data=await(geometry??=makeGeodesics());
 const lookup=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,lookup);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,TABLE_WIDTH,TABLE_HEIGHT,0,gl.RED,gl.FLOAT,data);
 const texture=gl.createTexture(),frame=gl.createFramebuffer(),blurTextures=[gl.createTexture(),gl.createTexture()],blurFrames=[gl.createFramebuffer(),gl.createFramebuffer()];let small=0,size=0,lost=false;
 function resize(cssSize){
  const next=Math.min(1200,Math.max(384,Math.round(cssSize*Math.min(2,devicePixelRatio||1))));if(next===size)return;size=next;canvas.width=canvas.height=size;
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,frame);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  small=Math.ceil(size/4);
  blurTextures.forEach((t,i)=>{gl.activeTexture(gl.TEXTURE2+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,small,small,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,blurFrames[i]);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);});gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 function draw(seconds,dark){
  if(lost)return;if(!size)resize(canvas.clientWidth||400);
  gl.viewport(0,0,size,size);gl.bindFramebuffer(gl.FRAMEBUFFER,frame);gl.useProgram(source);
  gl.uniform1i(gl.getUniformLocation(source,'geodesics'),0);gl.uniform1f(gl.getUniformLocation(source,'time'),seconds);gl.uniform2f(gl.getUniformLocation(source,'resolution'),size,size);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.viewport(0,0,small,small);gl.useProgram(blurProgram);
  for(let i=0;i<2;i++){gl.bindFramebuffer(gl.FRAMEBUFFER,blurFrames[i]);gl.uniform1i(gl.getUniformLocation(blurProgram,'image'),1+i);gl.uniform2f(gl.getUniformLocation(blurProgram,'direction'),i?0:1/small,i?1/small:0);gl.drawArrays(gl.TRIANGLES,0,3);}
  gl.viewport(0,0,size,size);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(finish);gl.uniform1i(gl.getUniformLocation(finish,'glowImage'),3);gl.uniform1i(gl.getUniformLocation(finish,'image'),1);gl.uniform1f(gl.getUniformLocation(finish,'dark'),dark?1:0);gl.uniform2f(gl.getUniformLocation(finish,'resolution'),size,size);gl.drawArrays(gl.TRIANGLES,0,3);
 }
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;canvas.dispatchEvent(new CustomEvent('lens-unavailable'));});
 return {draw,resize};
}

function blackHole(canvas){
  const node=canvas.closest('[data-map-id]'),surface=document.createElement('canvas'),context=canvas.getContext('2d');
  let lens,last=1.8,dark=false,observer;
  canvas.style.display='none';
  const paint=()=>{if(lens){lens.draw(last,dark);context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(surface,0,0);}};
  const fallback=()=>{lens=null;observer?.disconnect();delete node.dataset.gravityReady;canvas.style.display='none';};
  surface.addEventListener('lens-unavailable',fallback);
  createGravityLens(surface).then(renderer=>{
    if(!renderer)return;
    lens=renderer;canvas.style.display='';node.dataset.gravityReady='';canvas.dataset.renderer='geodesic';
    const resize=()=>{lens?.resize(canvas.clientWidth);canvas.width=surface.width;canvas.height=surface.height;paint();};
    observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  }).catch(fallback);
  return(seconds,theme)=>{last=seconds;dark=theme;paint();};
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
initializeBlackHoleLens();
requestMapLinksRender();
