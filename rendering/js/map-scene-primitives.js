// Shared map/story geometry and painters. Rendering notes: docs/map-scene-primitives.md.
import { mapItems } from "./map-data.js";

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
export function blackHole(canvas){
  const size=320,extent=1.35,context=canvas.getContext('2d');
  canvas.width=canvas.height=size;
  const light=canvas.ownerDocument.createElement('canvas');light.width=light.height=size;
  const lc=light.getContext('2d'),image=lc.createImageData(size,size),texture=gasTexture();
  const layers=[],shadow=context.createImageData(size,size),turn=-.18,ct=Math.cos(turn),st=Math.sin(turn);
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
    if(r>.427){
      if(y<0)add(Math.hypot(x,y/.83),Math.atan2(y/.83,x),.74);
      else add(Math.hypot(x,y/.71),Math.atan2(-y/.71,x),.19);
      add(Math.hypot(x,y/.235),Math.atan2(y/.235,x),.62);
      const rim=Math.exp(-Math.pow((r-.438)/.009,2))*(.18-.07*x/.44);
      if(rim>.001)samples.push({row:0,angle:0,weight:rim,speed:0,heat:1});
    }
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
export function pulsar(canvas){
  const size=512,context=canvas.getContext('2d'),center=size/2,core=27;
  canvas.width=canvas.height=size;
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
  const cadence=180,stepsPerTurn=2,timeScale=12,period=60*stepsPerTurn*timeScale/cadence;
  canvas.dataset.cadence=String(cadence);canvas.dataset.rotationPeriod=String(period);
  const tilt=.08,obliquity=.87,roll=.07,focalLength=core*24;
  return (seconds,dark)=>{
    context.clearRect(0,0,size,size);
    const phase=seconds*TAU/period-.9,sprite=sprites[Number(dark)];
    const ax=Math.sin(obliquity)*Math.cos(phase);
    const ay=-Math.cos(obliquity)*Math.cos(tilt)+Math.sin(obliquity)*Math.sin(phase)*Math.sin(tilt);
    const mx=ax*Math.cos(roll)-ay*Math.sin(roll),my=ax*Math.sin(roll)+ay*Math.cos(roll);
    const mz=Math.cos(obliquity)*Math.sin(tilt)+Math.sin(obliquity)*Math.sin(phase)*Math.cos(tilt);
    const pulse=Math.exp(-(1-Math.abs(mz))/.16),projection=Math.hypot(mx,my);
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
        context.globalAlpha=clamp(Math.exp(-2.45*t)*(1-smooth(.78,1,t))
          *(.55+.57*smooth(-.85,.85,depth))*core*.18/along*(1+.22*pulse));
        context.drawImage(sprite,-along,-width,along*2,width*2);
        context.globalAlpha*=LIGHT.beamEnvelope;
        context.drawImage(sprite,-along*1.6,-width*3.2,along*3.2,width*6.4);context.restore();
      }
    };
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

const projects = mapItems.filter(item => item.parent === "private-practice");
const cultural = new Set(['shirokostup', 'tarski']);
const category = item => cultural.has(item.id) ? 'culture'
  : item.relatedTo?.includes('running') ? 'sport' : 'commercial';
export const practiceGroups = [
  { id: 'culture', title: 'Культурные', radius: .43, phase: .4,
    color: [93,125,106], light: [160,195,165], surface: ['#cad7c7','#829e83','#354f40','#192b20'] },
  { id: 'commercial', title: 'Коммерческие', radius: .79, phase: 1.7,
    color: [153,115,61], light: [208,174,116], surface: ['#e5cfac','#af8c5b','#71522e','#382716'] },
  { id: 'sport', title: 'Спортивные', radius: 1.16, phase: .12,
    color: [114,101,151], light: [180,162,213], surface: ['#d7cee6','#9e90ba','#5f5179','#312943'] },
].map(group => ({ ...group, projects: projects.filter(item => category(item) === group.id) }));


export function createPracticePlane(canvas, groups = practiceGroups) {
  const doc=canvas.ownerDocument,ctx=canvas.getContext('2d');
  let side=672,center=side/2,scale=side/2.6;
  const tau=Math.PI*2;
  canvas.width=canvas.height=side;
  let angle=-16*Math.PI/180,tilt=48*Math.PI/180,dark=false;
  const project=(u,v)=>[u*Math.cos(angle)-v*Math.cos(tilt)*Math.sin(angle),u*Math.sin(angle)+v*Math.cos(tilt)*Math.cos(angle),v*Math.sin(tilt)];
  const makeLayer=()=>{const c=doc.createElement('canvas');c.width=c.height=side;return c;};
  const back=makeLayer(),sphere=makeLayer();
  const drawSphere=bodyRadius=>{
    const sphereContext=sphere.getContext('2d'),r=bodyRadius*scale;
    const lighting=sphereContext.createRadialGradient(center-r*.35,center-r*.4,r*.03,center-r*.16,center-r*.2,r*1.18);
    for(const [stop,color] of [[0,'#bac7ad'],[.22,'#8c9f83'],[.55,'#4e6652'],[.82,'#23392d'],[1,'#101d16']])lighting.addColorStop(stop,color);
    sphereContext.clearRect(0,0,side,side);sphereContext.fillStyle=lighting;sphereContext.beginPath();sphereContext.arc(center,center,r,0,tau);sphereContext.fill();
  };
  const tracks=theme=>{
    dark=theme;
    const c=back.getContext('2d');c.clearRect(0,0,side,side);
    for(const orbit of groups){
      c.strokeStyle=`rgba(${(dark?orbit.light:orbit.color).join(',')},.58)`;
      c.lineWidth=side/336;c.beginPath();c.ellipse(center,center,orbit.radius*scale,orbit.radius*scale*Math.cos(tilt),angle,0,tau);c.stroke();
    }
  };
  return {project,sphere:drawSphere,tracks,
    resize:pixels=>{const next=Math.max(1,Math.ceil(pixels));if(next===side)return;side=next;center=side/2;scale=side/2.6;for(const layer of [canvas,back,sphere])layer.width=layer.height=side;},
    view:(rotation,inclination)=>{angle=rotation;tilt=inclination;tracks(dark);},
    paint:()=>{ctx.clearRect(0,0,side,side);ctx.drawImage(back,0,0);ctx.drawImage(sphere,0,0);}
  };
}

const timeGroupSectors = {
  garage: {
    parent: -2.28,
    compactParent: -2.28,
    children: [-3.08, -2.72, -1.82, -1.48],
    compactChildren: [-2.95, -2.58, -1.9, -1.45],
    order: ["garage-site", "collection", "narkomfin", "garage-app"],
  },
  "private-practice": {
    parent: -0.32,
    compactParent: -0.55,
    children: [0.02, 0.3, 0.58, 0.86, 1.14, 1.42, 1.7, 1.98, 2.26],
    compactChildren: [-0.08, 0.25, 0.58, 0.91, 1.24, 1.57, 1.9, 2.23, 2.56],
    order: [
      "shirokostup",
      "dusty",
      "tarski",
      "ks-fish",
      "herman",
      "dd-camp",
      "hotline-camp",
      "doronin",
      "eleven",
    ],
  },
};

const timeRootAngles = {
  optimal: [-2.98, -3],
  "early-career": [-2.3, -2.08],
  ilmix: [-2.54, -1.95],
};

const getTimeSectorAngle = (item, compact) => {
  const groupId = item.parent && timeGroupSectors[item.parent]
    ? item.parent
    : timeGroupSectors[item.id]
      ? item.id
      : null;

  if (!groupId) {
    return null;
  }

  const sector = timeGroupSectors[groupId];

  if (item.id === groupId) {
    return compact ? sector.compactParent : sector.parent;
  }

  const index = sector.order.indexOf(item.id);
  const angles = compact ? sector.compactChildren : sector.children;

  return angles[index] ?? sector.parent;
};

export const getTimePosition = (item, compact = false) => {
  if (!Number.isFinite(item.timeYear)) {
    return { x: item.x, y: item.y };
  }

  const centerX = 50;
  const centerY = 54;
  const getSourceAngle = ({ x, y }) => Math.atan2((y - centerY) / 34, (x - centerX) / 44);
  const sourceAngle = getSourceAngle(item);
  const peers = mapItems
    .filter((candidate) => candidate.timeYear === item.timeYear)
    .sort((left, right) => getSourceAngle(left) - getSourceAngle(right));
  const lane = peers.findIndex(({ id }) => id === item.id) - (peers.length - 1) / 2;
  const year = item.timeYear;
  const radiusX = year >= 2021
    ? 22 + (2026 - year) * 2.4
    : year >= 2015
      ? 34 + (2021 - year) * 1.83
      : 45 + Math.max(0, Math.min(1, (2015 - year) / 5)) * 11;
  const radiusY = year >= 2021
    ? 17 + (2026 - year) * 1.6
    : year >= 2015
      ? 25 + (2021 - year) * 1.33
      : 33 + Math.max(0, Math.min(1, (2015 - year) / 5)) * 8;
  const compactRadiusXScale = compact ? 1.35 : 1;
  const groupAngle = getTimeSectorAngle(item, compact);
  const rootAngles = timeRootAngles[item.id];
  const angle = groupAngle
    ?? rootAngles?.[compact ? 1 : 0]
    ?? sourceAngle + lane * 0.18;

  return {
    x: centerX + Math.cos(angle) * radiusX * compactRadiusXScale,
    y: centerY + Math.sin(angle) * radiusY,
  };
};

export const warpMapPoint = (model, x, y) => {
    if (!model.core || !model.strength) return { x, y };
    const dx=x-model.cx,dy=y-model.cy,r2=dx*dx+dy*dy,a2=model.core*model.core,R2=49*a2;
    if(r2>=R2)return {x,y};
    const envelope=1-r2/R2;
    const gain=model.strength*1.8225*a2/(r2+.81*a2)*envelope*envelope*envelope;
    return {x:x+dx*gain,y:y+dy*gain};
  };
