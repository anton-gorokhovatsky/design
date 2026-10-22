// A bounded, progressively softened reader surface. Mask coordinates follow the joint.
export function focusPlane(svg,element,{bounds=element.getBoundingClientRect(),portrait=false,attach=true}={}){
  svg.innerHTML=`<filter id="pair-focus-story" filterUnits="objectBoundingBox" primitiveUnits="objectBoundingBox" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceGraphic" edgeMode="duplicate" result="blur"/>
    <feColorMatrix in="blur" values=".9 0 0 0 0 0 .9 0 0 0 0 0 .9 0 0 0 0 0 1 0" result="dim"/>
    <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="field"/>
    <feComponentTransfer in="field" result="mask"><feFuncA type="linear" slope="0"/></feComponentTransfer>
    <feComposite in="SourceGraphic" in2="mask" operator="out" result="sharp"/>
    <feComposite in="dim" in2="mask" operator="in" result="soft"/>
    <feComposite in="sharp" in2="soft" operator="arithmetic" k2="1" k3="1" result="mix"/>
    <feComposite in="mix" in2="SourceAlpha" operator="in"/>
  </filter>`;
  const filter=svg.firstElementChild,canvas=document.createElement('canvas');
  canvas.width=portrait?1:64;canvas.height=portrait?64:1;
  const context=canvas.getContext('2d'),pixels=context.createImageData(canvas.width,canvas.height);
  for(let i=0;i<64;i++)pixels.data[i*4+3]=255*Math.pow(Math.max(0,(i/63-.25)/.75),3);
  context.putImageData(pixels,0,0);filter.querySelector('feImage').setAttribute('href',canvas.toDataURL());
  const blur=filter.querySelector('feGaussianBlur'),radius=portrait?6:8;
  blur.setAttribute('stdDeviation',radius/Math.max(1,bounds.width)+' '+radius/Math.max(1,bounds.height));
  blur.setAttribute(portrait?'y':'x','.25');blur.setAttribute(portrait?'height':'width','.75');
  const mask=filter.querySelector('feFuncA'),original=element.style.filter;
  if(attach)element.style.filter='url(#pair-focus-story)';
  return {paint(strength){mask.setAttribute('slope',strength);},clear(){if(attach)element.style.filter=original;filter.remove();}};
}
