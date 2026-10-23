/* Browser-laid-out text transported by a radial free-fall field. The inverse
 * of dr/dt = -sqrt(2GM/r) stretches radially and compresses transversely.
 * Exposure is bounded for reading; this is a tidal illustration, not GR. */
export function attractPoint(x,y,cx,cy,radius,strength){
  const dx=x-cx,dy=y-cy,s=radius*radius;
  const pull=.88*strength*radius*s/Math.pow(dx*dx+dy*dy+s,1.5);
  return {x:x-dx*pull,y:y-dy*pull};
}
const vertex=`attribute vec2 point;varying vec2 uv;void main(){uv=point*.5+.5;gl_Position=vec4(point,0.,1.);}`;
const fragment=`precision highp float;
varying vec2 uv;uniform sampler2D words;uniform vec2 size,center;uniform vec4 bounds;uniform float radius,strength;
void main(){
 vec2 pixel=vec2(uv.x,1.-uv.y)*size,delta=pixel-center;
 float r=max(length(delta),1.);
 float near=length(max(abs(center-bounds.xy-bounds.zw*.5)-bounds.zw*.5,vec2(0.)));
 float fall=.92*strength*pow(max(near,radius*.6),1.5);
 float original=pow(pow(r,1.5)+fall,2./3.);
 vec2 source=(center+delta*(original/r))/size;
 if(source.x<0.||source.x>1.||source.y<0.||source.y>1.){gl_FragColor=vec4(0.);return;}
 gl_FragColor=texture2D(words,source);
}`;
function compile(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}

export function createTextField(spread,copy){
 const canvas=document.createElement('canvas');canvas.className='gravity-texture';canvas.setAttribute('aria-hidden','true');canvas.hidden=true;spread.append(canvas);
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,depth:false,stencil:false,antialias:false,powerPreference:'low-power'});
 if(!gl){canvas.remove();return null;}
 const program=gl.createProgram();gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS)){canvas.remove();return null;}
 gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
 const point=gl.getAttribLocation(program,'point');gl.enableVertexAttribArray(point);gl.vertexAttribPointer(point,2,gl.FLOAT,false,0,0);
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
 const uniforms=Object.fromEntries(['words','size','center','bounds','radius','strength'].map(key=>[key,gl.getUniformLocation(program,key)]));
 const source=document.createElement('canvas');let w=1,h=1,lost=false,level=0;
 function resize(){
  if(lost)return;
  const bounds=spread.getBoundingClientRect();w=bounds.width;h=bounds.height;
  const dpr=Math.min(2,devicePixelRatio||1,3072/Math.max(w,h));source.width=canvas.width=Math.ceil(w*dpr);source.height=canvas.height=Math.ceil(h*dpr);
  const c=source.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.textBaseline='alphabetic';
  // Range measurements preserve the actual responsive line breaks, NBSP and font.
  // They run on resize/font/theme changes only, never in the animation loop.
  for(const paragraph of copy.querySelectorAll('h2,p')){
   const style=getComputedStyle(paragraph),node=paragraph.firstChild;if(!node||node.nodeType!==Node.TEXT_NODE)continue;
   const text=node.textContent,range=document.createRange(),rows=[];let row;
   c.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;c.fillStyle=style.color;c.fontKerning='normal';
   if('letterSpacing' in c)c.letterSpacing=style.letterSpacing;
   const metrics=c.measureText('Hg');
   for(let i=0;i<text.length;i++){
    range.setStart(node,i);range.setEnd(node,i+1);const rect=range.getBoundingClientRect();if(!rect.width)continue;
    if(!row||Math.abs(rect.top-row.top)>.5){row={start:i,end:i+1,left:rect.left,top:rect.top,height:rect.height};rows.push(row);}else row.end=i+1;
   }
   for(const row of rows){
    const value=text.slice(row.start,row.end).replace(/[ \t]+$/,'');
    const ascent=metrics.fontBoundingBoxAscent??metrics.actualBoundingBoxAscent,descent=metrics.fontBoundingBoxDescent??metrics.actualBoundingBoxDescent;
    const baseline=row.top-bounds.top+(row.height-ascent-descent)/2+ascent;
    c.fillText(value,row.left-bounds.left,baseline);
   }
  }
  gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(uniforms.size,w,h);gl.uniform1i(uniforms.words,0);
  const box=copy.getBoundingClientRect();gl.uniform4f(uniforms.bounds,box.left-bounds.left,box.top-bounds.top,box.width,box.height);
 }
 function draw(strength,cx,cy,radius){
  level=lost?0:strength;const active=level>.0001;
  if(canvas.hidden===active){canvas.hidden=!active;copy.dataset.warped=String(active);}
  if(!active)return;
  gl.uniform2f(uniforms.center,cx,cy);gl.uniform1f(uniforms.radius,radius);gl.uniform1f(uniforms.strength,level);gl.drawArrays(gl.TRIANGLES,0,3);
 }
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;canvas.hidden=true;copy.dataset.warped='false';});
 return {resize,draw};
}
