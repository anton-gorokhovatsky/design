import { makeGeodesics, MAX_IMPACT, MAX_ANGLE, TABLE_WIDTH, TABLE_HEIGHT } from './null-geodesics.js';
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
   // An opaque, dim plunging flow continues inside the innermost stable orbit.
   // Its emissivity is an art-directed model, not a GRMHD simulation.
   if(r>1.&&r<3.1)absorption=max(absorption,1.-smoothstep(2.9,3.1,r));
   if(r>3.&&r<13.){
     vec3 p=n*cos(f)+t*sin(f);float angle=atan(p.z,p.x);
     float omega=inversesqrt(2.*r*r*r);
     float g=sqrt(1.-1.5/r)/(1.+omega*q.x*cs);
     float flux=pow(3./r,3.)*(1.-sqrt(3./r))*18.;
     float edge=smoothstep(3.,3.12,r)*(1.-smoothstep(8.5,13.,r));
     // Coherent shearing filaments: no frame-random noise or blinking points.
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
 // Fixed subpixel samples preserve the thin high-order image at the shadow boundary.
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
export async function createGravityLens(canvas){
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
 const texture=gl.createTexture(),frame=gl.createFramebuffer(),blurTextures=[gl.createTexture(),gl.createTexture()],blurFrames=[gl.createFramebuffer(),gl.createFramebuffer()];let small=0,size=0,lastTime=0,lastDark=false,lost=false;
 function resize(cssSize){
  const next=Math.min(1200,Math.max(384,Math.round(cssSize*Math.min(2,devicePixelRatio||1))));if(next===size)return;size=next;canvas.width=canvas.height=size;
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,frame);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  small=Math.ceil(size/4);
  blurTextures.forEach((t,i)=>{gl.activeTexture(gl.TEXTURE2+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,small,small,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,blurFrames[i]);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);});gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 function draw(seconds,dark){
  if(lost)return;lastTime=seconds;lastDark=dark;if(!size)resize(canvas.clientWidth||400);
  gl.viewport(0,0,size,size);gl.bindFramebuffer(gl.FRAMEBUFFER,frame);gl.useProgram(source);
  gl.uniform1i(gl.getUniformLocation(source,'geodesics'),0);gl.uniform1f(gl.getUniformLocation(source,'time'),seconds);gl.uniform2f(gl.getUniformLocation(source,'resolution'),size,size);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.viewport(0,0,small,small);gl.useProgram(blurProgram);
  for(let i=0;i<2;i++){gl.bindFramebuffer(gl.FRAMEBUFFER,blurFrames[i]);gl.uniform1i(gl.getUniformLocation(blurProgram,'image'),1+i);gl.uniform2f(gl.getUniformLocation(blurProgram,'direction'),i?0:1/small,i?1/small:0);gl.drawArrays(gl.TRIANGLES,0,3);}
  gl.viewport(0,0,size,size);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.useProgram(finish);gl.uniform1i(gl.getUniformLocation(finish,'glowImage'),3);gl.uniform1i(gl.getUniformLocation(finish,'image'),1);gl.uniform1f(gl.getUniformLocation(finish,'dark'),dark?1:0);gl.uniform2f(gl.getUniformLocation(finish,'resolution'),size,size);gl.drawArrays(gl.TRIANGLES,0,3);
 }
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;canvas.dispatchEvent(new CustomEvent('lens-unavailable'));});
 return {draw,resize,getState:()=>({size,lost,time:lastTime,dark:lastDark,model:'Schwarzschild, thin disk, RK4'})};
}
