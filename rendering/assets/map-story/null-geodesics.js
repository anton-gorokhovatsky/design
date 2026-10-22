// Schwarzschild null geodesics, r_s = c = 1; u = 1/r, primes are d/dφ.
// u'' = 3u²/2 - u. Observer at infinity: u(0)=0, u'(0)=1/b.
// E. Bruneton (2020), equation 8: https://ebruneton.github.io/black_hole_shader/paper.pdf
export const CRITICAL_IMPACT = Math.sqrt(27) / 2;
export const MAX_IMPACT = 18;
export const MAX_ANGLE = Math.PI * 3;
export const TABLE_WIDTH = 2048;
export const TABLE_HEIGHT = 1024;
export function advance(u, v, h) {
  const f = x => 1.5*x*x-x;
  const a=f(u), b=f(u+h*v/2), c=f(u+h*v/2+h*h*a/4), d=f(u+h*v+h*h*b/2);
  return [u+h*v+h*h*(a+b+c)/6, v+h*(a+2*b+2*c+d)/6];
}
export function impactAt(t) {
  return t<.25 ? t/.25*2.4 : t<.65 ? 2.4+(t-.25)/.4*.5 : 2.9+(t-.65)/.35*(MAX_IMPACT-2.9);
}
export async function makeGeodesics() {
  const table = new Float32Array(TABLE_WIDTH*TABLE_HEIGHT);
  const step=MAX_ANGLE/(TABLE_HEIGHT-1);
  for(let x=0;x<TABLE_WIDTH;x++){
    const b=Math.max(.001,impactAt(x/(TABLE_WIDTH-1)));
    let u=0,v=1/b,ended=false;
    for(let y=1;y<TABLE_HEIGHT;y++){
      if(!ended){[u,v]=advance(u,v,step/2);[u,v]=advance(u,v,step/2);if(u>=1){u=1;ended=true;}else if(u<0){u=0;ended=true;}}
      table[y*TABLE_WIDTH+x]=u;
    }
    // Let page input and text paint between chunks. No render-loop integration.
    if(x%128===127)await new Promise(resolve=>setTimeout(resolve,0));
  }
  return table;
}
