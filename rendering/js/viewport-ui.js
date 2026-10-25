import {pane} from './pane-viewport.js';
import { reducedMotion } from "./preferences.js";

const scrollRegionFromKey = (event, region, reduceMotion) => {
  if (event.target.matches("input, select, textarea") || !["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) return;
  const maximum = region.scrollHeight - region.clientHeight;
  const step = event.key.startsWith("Page") ? region.clientHeight * 0.82 : 48;
  const top = event.key === "Home" ? 0 : event.key === "End" ? maximum
    : region.scrollTop + (["ArrowDown", "PageDown"].includes(event.key) ? step : -step);
  event.preventDefault();
  region.scrollTo({ top: Math.max(0, Math.min(maximum, top)), behavior: reduceMotion ? "auto" : "smooth" });
};

const scrollLensControllers = new Map();
let scrollLensId = 0;
const lensNamespace = "http://www.w3.org/2000/svg";
const lensForcedColors = matchMedia("(forced-colors: active)");
const lensDepth = 56;
const lensBleed = 32;
// Lens invariants: js/README.md#scroll-lens-invariants.
const drawScrollLensMap = (record, width, height, top, bottom) => {
  const extent = height + lensBleed * 2;
  const textureHeight = lensDepth + lensBleed;
  const texture = `${width}:${record.fullWidth}:${record.gutter||0}:${JSON.stringify(record.cutouts||[])}`;
  if (record.textureWidth !== texture) {
    const canvas = record.canvas;
    canvas.height = textureHeight;
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(canvas.width, textureHeight);
    for (let y = 0; y < textureHeight; y++) {
      const depth = Math.max(0, Math.min(1, 1 - (y - lensBleed) / lensDepth));
      for (let x = 0; x < canvas.width; x++) {
        const u = x / (canvas.width - 1);
        const gutter=record.gutter||0;
        const spread=1+Math.min(.5,2*gutter/Math.max(1,width-2*gutter))*depth**2;
        const shift = record.media ? 0 : record.fullWidth ? (u-.5)*width*(1/spread-1)
          : -(u - .5) * Math.min(width * .42, 168)*depth ** 2 * Math.sin(Math.PI * u) ** 2;
        const offset = (y * canvas.width + x) * 4;
        pixels.data[offset] = 128 + shift / 64 * 255;
        pixels.data[offset + 1] = 128;
        pixels.data[offset + 2] = 255 * depth;
        pixels.data[offset + 3] = 255;
      }
    }
    const flipped = context.createImageData(canvas.width, textureHeight);
    const stride = canvas.width * 4;
    for (let y = 0; y < textureHeight; y++) flipped.data.set(
      pixels.data.subarray(y * stride, (y + 1) * stride), (textureHeight - y - 1) * stride);
    context.putImageData(flipped, 0, 0);
    record.images[1].setAttribute("href", canvas.toDataURL());
    for (const [left, top, right, bottom] of record.cutouts || []) {
      for (let y = Math.max(0, Math.floor(top+lensBleed)); y < Math.min(textureHeight, bottom+lensBleed); y++) {
        for (let x = Math.max(0, Math.floor(left/width*canvas.width)); x < Math.min(canvas.width, Math.ceil(right/width*canvas.width)); x++) {
          const offset = (y*canvas.width+x)*4;
          pixels.data[offset]=128; pixels.data[offset+2]=0;
        }
      }
    }
    context.putImageData(pixels, 0, 0);
    record.images[0].setAttribute("href", canvas.toDataURL());
    record.textureWidth = texture;
  }
  const geometry = `${width}:${height}`;
  if (record.geometry !== geometry) {
    for (const primitive of [record.filter, ...record.filter.children]) {
      primitive.setAttribute("x", 0);
      primitive.setAttribute("y", -lensBleed / height);
      primitive.setAttribute("width", 1);
      primitive.setAttribute("height", extent / height);
    }
    record.displaceX.setAttribute("scale", 64 / width);
    const blur = record.media ? 2.2 : 2.6;
    record.blur.setAttribute("stdDeviation", `${blur / width} ${blur / height}`);
    record.fade.setAttribute("amplitude", record.media ? ".28" : ".72");
    record.fade.setAttribute("exponent", record.media ? "2.4" : "3.4");
    record.geometry = geometry;
  }
  record.images.forEach((image, index) => {
    const edge = index ? bottom : top;
    const start = edge - (index ? lensDepth : lensBleed);
    const visible = edge !== null && start < height + lensBleed && start + textureHeight > -lensBleed;
    image.setAttribute("y", visible ? start / height : 0);
    image.setAttribute("height", textureHeight / height);
    record.mapLayers[index].setAttribute("in", visible ? (index ? "lower" : "upper") : "empty");
  });
};

const lensDepthAt = (position, edge, upper) => edge === null ? 0
  : Math.max(0, Math.min(1, 1 - (upper ? position - edge : edge - position) / lensDepth));
const lensRow = (g, y) => {
  const upper = lensDepthAt(y, g.top, true), lower = lensDepthAt(y, g.bottom, false);
  const bend = Math.max(upper, lower) ** 2;
  const t = Math.min(1, Math.max(upper, lower) * lensDepth / (lensDepth - g.frameRadius));
  const flare = g.insetMedia ? 0 : t * t * (3 - 2 * t);
  const r = Math.min(g.radius, g.width / 2, g.height / 2);
  const dy = Math.max(0, r - Math.min(y, g.height - y));
  const n = g.cornerPower || 2;
  const corner = r - Math.pow(Math.max(0, r ** n - dy ** n), 1 / n);
  return { bend, sample: y + 8 * (upper ** 2 - lower ** 2),
    left: g.left * (1 - flare) + corner,
    right: g.left + g.width + (g.portWidth - g.left - g.width) * flare - corner };
};
const createLensMedia = video => {
  const moving = video.matches("video");
  const background = getComputedStyle(video.closest(".personal-media__screen") || video.parentElement).backgroundColor;
  const canvas = document.createElement("canvas");
  canvas.className = "scroll-lens-video";
  canvas.setAttribute("aria-hidden", "true");
  const context = canvas.getContext("2d"), source = document.createElement("canvas");
  const sourceContext = source.getContext("2d");
  if (!context || !sourceContext) return null;
  const opacity = video.style.opacity;
  let geometry, callback = 0, disposed = false;
  const draw = (resizeOnly = false) => {
    if (disposed || !geometry || (moving ? video.readyState < 2 : !video.complete || !video.naturalWidth)) return;
    const g = geometry, density = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(g.width*density), height = Math.round(g.height*density);
    const pw = Math.round(g.portWidth*density), ph = height;
    if (!width || !height || !pw || !ph) return;
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width=pw; canvas.height=ph; }
    const resized = source.width !== width || source.height !== height;
    if (resized) { source.width=width; source.height=height; }
    if (!resizeOnly || resized || !canvas.isConnected) {
      const nw = moving ? video.videoWidth : video.naturalWidth;
      const nh = moving ? video.videoHeight : video.naturalHeight;
      const scale = Math.min(width/nw,height/nh), w=nw*scale, h=nh*scale;
      sourceContext.clearRect(0,0,width,height);
      sourceContext.fillStyle=background;
      sourceContext.fillRect(0,0,width,height);
      sourceContext.drawImage(video,(width-w)/2,moving?0:(height-h)/2,w,h);
    }
    context.clearRect(0,0,pw,ph);
    context.save();
    context.beginPath();
    const r = Math.min(g.radius*density,width/2,height/2), x = g.left*density;
    const power = 2 / (g.cornerPower || 2);
    for (const [cx,cy,turn] of [[x+width-r,r,-1],[x+width-r,height-r,0],[x+r,height-r,1],[x+r,r,2]]) {
      for (let i=0;i<=16;i++) {
        const a=(turn+i/16)*Math.PI/2, c=Math.cos(a), s=Math.sin(a);
        context.lineTo(cx+r*Math.sign(c)*Math.abs(c)**power,cy+r*Math.sign(s)*Math.abs(s)**power);
      }
    }
    context.closePath();
    context.clip();
    context.drawImage(source,g.left*density,0);
    context.restore();
    const bands = [g.top === null ? null : [g.top-lensBleed,g.top+lensDepth],
      g.bottom === null ? null : [g.bottom-lensDepth,g.bottom+lensBleed]]
      .filter(Boolean).map(([from,to])=>[Math.max(0,Math.floor(from*density)),Math.min(ph,Math.ceil(to*density))])
      .filter(([from,to])=>to>from);
    if (bands.length===2 && bands[0][1]>=bands[1][0]) {
      bands[0][1]=bands[1][1]; bands.pop();
    }
    for (const [from,to] of bands) {
      context.clearRect(0,from,pw,to-from);
      for (let row=from; row<to; row++) {
        const y=(row+.5)/density, edge=lensRow(g,y);
        const dw=(edge.right-edge.left)*density;
        if (dw<=0) continue;
        const sw=Math.min(width,dw/(1+.16*edge.bend));
        const sy=Math.max(0,Math.min(height-1,edge.sample*density-.5));
        context.drawImage(source,(width-sw)/2,sy,sw,1,edge.left*density,row,dw,1);
      }
    }
    canvas.style.left=-g.left+"px";
    canvas.style.width=g.portWidth+"px";
    canvas.style.height=g.height+"px";
    if (!canvas.isConnected) video.parentElement.append(canvas);
    video.style.opacity="0";
  };
  const tick = () => {
    callback=0;
    if (disposed || !moving) return;
    if (!document.hidden) draw();
    if (video.requestVideoFrameCallback) callback=video.requestVideoFrameCallback(tick);
    else if (!video.paused) callback=requestAnimationFrame(tick);
  };
  const refresh = () => { draw(); if (!callback) tick(); };
  for (const event of ["load","loadeddata","seeked","play"]) video.addEventListener(event,refresh);
  return { canvas, draw, setGeometry(value) { geometry=value; if (!callback) tick(); }, dispose() {
    disposed=true;
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(callback);
    else cancelAnimationFrame(callback);
    for (const event of ["load","loadeddata","seeked","play"]) video.removeEventListener(event,refresh);
    video.style.opacity=opacity;
    canvas.remove();
  } };
};
const createLensPlayer = element => {
  const transform = element.style.transform, origin = element.style.transformOrigin;
  const screen = element.parentElement, overflow = screen.style.overflow, clip = screen.style.clipPath;
  const frost = document.createElement("span");
  frost.className = "scroll-lens-frost";
  frost.setAttribute("aria-hidden", "true");
  element.after(frost);
  element.style.transformOrigin = "50% 0";
  return { draw(g) {
    const {top, bottom, height} = g;
    const strength = edge => edge === null ? 0 : Math.max(0, Math.min(1, 1 + Math.min(0, edge) / lensDepth));
    const upper = strength(top), lower = strength(bottom === null ? null : height - bottom);
    const y0 = top === null ? 0 : Math.max(0, Math.min(height - 1, top));
    const y1 = bottom === null ? height : Math.max(y0 + 1, Math.min(height, bottom));
    const span = y1 - y0, z0 = 1 + .16 * upper ** 2, z1 = 1 + .16 * lower ** 2;
    const s0 = y0 + Math.min(8 * upper ** 2, span * .3);
    const s1 = y1 - Math.min(8 * lower ** 2, span * .3);
    const c = (z1 - z0) / span, d = z0 - c * y0;
    const a = (s1 * z1 - s0 * z0) / span, b = s0 * z0 - a * y0;
    element.style.transform = `matrix3d(${a*d-b*c},0,0,0,0,${d},0,${-c},0,0,1,0,0,${-b},0,${a})`;
    const left = [], right = [], rows = Math.ceil(height / 4);
    for (let n = 0; n <= rows; n++) {
      const y = n / rows * height, row = lensRow(g, y);
      left.push(`${row.left-g.left}px ${y}px`);
      right.unshift(`${row.right-g.left}px ${y}px`);
    }
    screen.style.overflow = "visible";
    screen.style.clipPath = `polygon(${[...left,...right].join(",")})`;
    frost.style.left = -g.left + "px";
    frost.style.width = g.portWidth + "px";
    const masks = [];
    if (top !== null) masks.push(`linear-gradient(#000 ${top}px, transparent ${top+lensDepth}px)`);
    if (bottom !== null) masks.push(`linear-gradient(transparent ${bottom-lensDepth}px, #000 ${bottom}px)`);
    frost.style.maskImage = masks.join(",");
    frost.style.webkitMaskImage = masks.join(",");
  }, dispose() {
    element.style.transform = transform;
    element.style.transformOrigin = origin;
    screen.style.overflow = overflow;
    screen.style.clipPath = clip;
    frost.remove();
  } };
};
const clearScrollLenses = region => scrollLensControllers.get(region)?.reset();
const observeScrollLens = (region, targets, { owner = region, enabled = () => true, fullWidth = false } = {}) => {
  if (!region) return;
  const records = new Map();
  let frame = 0;
  let svg, textFrame, textRecord, textStyles;
  const transfer = (parent, before = null) => {
    if (parent.moveBefore) { parent.moveBefore(region,before); return; }
    const videos=[...region.querySelectorAll("video")].map(video=>[video,video.currentTime,video.paused,video.src]);
    parent.insertBefore(region,before);
    for(const[video,time,paused,source]of videos){
      const restore=()=>{if(video.src!==source)return;video.currentTime=time;if(paused)video.pause();else video.play().catch(()=>{});};
      if(video.readyState)restore();else video.addEventListener("loadedmetadata",restore,{once:true});
    }
  };
  const moveRegion = move => {
    const top=region.scrollTop, left=region.scrollLeft, focus=document.activeElement;
    const selection=document.getSelection(), selected=selection&&!selection.isCollapsed
      && (region.contains(selection.anchorNode)||region.contains(selection.focusNode));
    const range=selected&&[selection.anchorNode,selection.anchorOffset,selection.focusNode,selection.focusOffset];
    move(); region.scrollTop=top; region.scrollLeft=left;
    if (region.contains(focus)) focus.focus({preventScroll:true});
    if (range) selection.setBaseAndExtent(...range);
  };
  const releaseFrame = () => {
    if (!textFrame) return;
    region.style.removeProperty("--scroll-ink-filter");
    if (region.parentElement !== textFrame) {
      textFrame.remove();textFrame=null;
      for(const[key,value]of textStyles)region.style[key]=value;
      return;
    }
    // Reparenting a live player reloads it. Keep its unfiltered layout box until removal.
    if (region.querySelector("iframe")) return;
    moveRegion(() => {
      transfer(textFrame.parentElement,textFrame); textFrame.remove(); textFrame=null;
      for (const [key,value] of textStyles) region.style[key]=value;
    });
  };
  const remove = (element, record) => {
    if (record.player) record.player.dispose();
    else if (record.media) record.media.dispose();
    record.filter?.remove();
    resize.unobserve(element);
    records.delete(element);
  };
  const reset = () => {
    for (const [element, record] of records) remove(element, record);
    textRecord=null;
    releaseFrame();
    svg?.remove();
    svg = null;
  };
  const makeRecord = (element, tracked = true) => {
    if (element.matches("iframe")) {
      const record = { player: createLensPlayer(element) };
      records.set(element, record);
      resize.observe(element);
      return record;
    }
    if (!svg) {
      svg = document.createElementNS(lensNamespace, "svg");
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.setAttribute("aria-hidden", "true");
      svg.style.position = "absolute";
      pane.surface.append(svg);
    }
    const id = `scroll-ink-${++scrollLensId}`;
    const filter = document.createElementNS(lensNamespace, "filter");
    for (const [key, value] of Object.entries({ id, filterUnits: "objectBoundingBox",
      primitiveUnits: "objectBoundingBox", x: "0", y: "0", width: "1", height: "1",
      "color-interpolation-filters": "sRGB" })) filter.setAttribute(key, value);
    filter.innerHTML = `<feFlood flood-color="#808000" result="neutral"/>
      <feFlood flood-opacity="0" result="empty"/>
      <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="upper"/>
      <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="lower"/>
      <feMerge result="map"><feMergeNode in="neutral"/><feMergeNode in="upper"/><feMergeNode in="lower"/></feMerge>
      <feComponentTransfer in="map" result="offset"><feFuncR type="linear" intercept="-.0019607843"/><feFuncG type="linear" slope="0" intercept=".5"/></feComponentTransfer>
      <feDisplacementMap in="SourceGraphic" in2="offset" xChannelSelector="R" yChannelSelector="G" result="warped"/>
      <feGaussianBlur in="warped" edgeMode="duplicate" result="blurred"/>
      <feColorMatrix in="map" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 1 0 0" result="depth"/>
      <feComponentTransfer in="depth" result="haze"><feFuncA type="gamma" exponent="1.5"/></feComponentTransfer>
      <feComposite in="warped" in2="haze" operator="out" result="sharp"/>
      <feComposite in="blurred" in2="haze" operator="in" result="soft"/>
      <feComposite in="sharp" in2="soft" operator="arithmetic" k2="1" k3="1" result="frost"/>
      <feComponentTransfer in="depth" result="fade"><feFuncA type="gamma" exponent="2.4"/></feComponentTransfer>
      <feComposite in="frost" in2="fade" operator="out"/>`;
    svg.append(filter);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    const record = { id, filter, canvas,
      images: [...filter.querySelectorAll("feImage")],
      mapLayers: [...filter.querySelectorAll('feMergeNode')].slice(1),
      displaceX: filter.querySelector("feDisplacementMap"), blur: filter.querySelector("feGaussianBlur"),
      fade: filter.querySelector('[result="fade"] feFuncA'),
      media: element.matches("img, video") ? createLensMedia(element) : null };
    if (tracked) { records.set(element, record); resize.observe(element); }
    return record;
  };
  const update = () => {
    frame = 0;
    if (textFrame && region.parentElement !== textFrame) releaseFrame();
    if (!region.isConnected || owner.hidden || owner.getAttribute("aria-hidden") === "true"
      || !enabled() || reducedMotion.matches || lensForcedColors.matches) { reset(); return; }
    if (textFrame) textFrame.style.gridArea=getComputedStyle(region).gridArea;
    const port = region.getBoundingClientRect();
    if (!port.height || region.scrollHeight <= region.clientHeight + 1) { reset(); return; }
    const active = new Set(targets());
    for (const [element, record] of records) if (!active.has(element)) remove(element, record);
    const scale = port.height / region.offsetHeight || 1;
    const top = region.scrollTop > 1;
    const bottom = region.scrollTop + region.clientHeight < region.scrollHeight - 1;
    const selection = document.getSelection();
    const geometry = [...active].map(element => ({ element,
      rect: (element.matches("iframe") ? element.parentElement : element).getBoundingClientRect(),
      height: element.offsetHeight, width: element.offsetWidth }));
    const intersects = rect => rect.width&&rect.height&&rect.bottom>port.top&&rect.top<port.bottom;
    const edges = rect => [top&&rect.top<port.top+lensDepth*scale&&rect.bottom>port.top,
      bottom&&rect.bottom>port.bottom-lensDepth*scale&&rect.top<port.bottom];
    const textEdges=[false,false];
    for (const {element,rect,width,height} of geometry) {
      if (!width||!height||element.matches("img,video,iframe,[data-material-surface],a,button,input,select,textarea")
        ||element.querySelector("[data-material-surface],a,button,input,select,textarea")) continue;
      edges(rect).forEach((hit,i)=>textEdges[i] ||= hit);
    }
    const cutouts=[];
    let liveMedia=false;
    for (const element of region.querySelectorAll("a,button,input,select,textarea,[data-material-surface],img,video,iframe")) {
      const rect=element.getBoundingClientRect();
      if (!intersects(rect)) continue;
      const preview=element.closest(".map-related__preview"),style=getComputedStyle(element);
      if(style.visibility!=="visible"||+style.opacity===0&&!records.get(element)?.media||preview&&+getComputedStyle(preview).opacity===0)continue;
      if (element.matches("img,video,iframe")) liveMedia=true;
      if(element.matches("a:not([data-material-surface])")&&geometry.some(({element:target})=>element.contains(target)))continue;
      if (element.matches(".story-actions .ui-close,[data-close-inspector]")) {
        cutouts.push([(rect.left-port.left)/scale-4,(rect.top-port.top)/scale-4,(rect.right-port.left)/scale+4,(rect.bottom-port.top)/scale+4].map(n=>Math.round(n*10)/10));
      } else edges(rect).forEach((hit,i)=>{if(hit)textEdges[i]=false;});
    }
    const focused=document.activeElement;
    const protectedText=selection&&!selection.isCollapsed&&(region.contains(selection.anchorNode)||region.contains(selection.focusNode))
      ||focused!==region&&region.contains(focused)&&focused.matches(":focus-visible")&&intersects(focused.getBoundingClientRect());
    if ((textEdges.some(Boolean)||fullWidth&&textFrame)&&!protectedText&&!liveMedia) {
      if (!textFrame && !region.querySelector("iframe")) {
        const style=getComputedStyle(region);
        textFrame=document.createElement("div");
        textFrame.dataset.scrollLensFrame="";
        textFrame.style.cssText=`min-width:0;min-height:0;display:flex;flex-direction:column;position:relative;overflow:hidden;flex:${style.flex};grid-area:${style.gridArea};margin:${style.margin};border-radius:${style.borderRadius};corner-shape:${style.cornerShape||"round"}`;
        textStyles=["margin","flex"].map(key=>[key,region.style[key]]);
        moveRegion(()=>{region.before(textFrame);transfer(textFrame);region.style.margin="0";region.style.flex="1 1 auto";});
        return update();
      }
      if (textFrame) {
        textRecord ||= makeRecord(region,false);
        const width=region.clientWidth, height=region.clientHeight;
        const gutter=fullWidth?parseFloat(getComputedStyle(region.querySelector(".page")).paddingLeft)||0:0;
        const key=`${width}:${height}:${gutter}:${textEdges}:${JSON.stringify(cutouts)}`;
        if(textRecord.window!==key){
          textRecord.fullWidth=fullWidth;textRecord.gutter=gutter;textRecord.cutouts=cutouts;
          drawScrollLensMap(textRecord,width,height,textEdges[0]?0:null,textEdges[1]?height:null);
          textRecord.window=key;
        }
        region.style.setProperty("--scroll-ink-filter",`url(#${textRecord.id})`);
      }
    } else region.style.removeProperty("--scroll-ink-filter");
    for (const { element, rect, height, width } of geometry) {
      if (!element.matches("img, video, iframe")) continue;
      const selected = selection && !selection.isCollapsed
        && (element.contains(selection.anchorNode) || element.contains(selection.focusNode));
      const depths = edges(rect);
      let record = records.get(element);
      const control = element.closest("a, button, iframe");
      const focused = control ? control.matches(":focus-visible")
        || (element.matches("iframe") && element === document.activeElement
          && document.documentElement.dataset.focusModality === "keyboard")
        : element.contains(document.activeElement);
      if (!width || !height || !depths.some(Boolean) || selected || focused
        || element.matches("[data-material-surface]")
        || element.querySelector("[data-material-surface], a, button, input, select, textarea")) {
        if (record) remove(element, record);
        continue;
      }
      record ||= makeRecord(element);
      if (!record.player && !record.media) { remove(element,record); continue; }
        const frameStyle = getComputedStyle(element.closest(".personal-media__screen, .map-hover-preview__mosaic-main"));
        const shape = frameStyle.cornerShape || "round";
        const geometry = { width, height, insetMedia: Boolean(element.closest(".personal-media__screen")), left: (rect.left-port.left)/scale,
          y: (rect.top-port.top)/scale, portWidth: region.clientWidth, portHeight: region.clientHeight,
          frameRadius: Math.min(40, parseFloat(getComputedStyle(region).borderTopLeftRadius) || 0),
          top: top ? (port.top-rect.top)/scale : null, bottom: bottom ? (port.bottom-rect.top)/scale : null,
          radius: parseFloat(frameStyle.borderTopLeftRadius) || 0,
          cornerPower: shape.startsWith("superellipse(") ? 2 ** parseFloat(shape.slice(13)) : shape === "squircle" ? 4 : 2 };
        if (record.player) { record.player.draw(geometry); continue; }
        record.media.setGeometry(geometry);
        record.media.draw(true);
        drawScrollLensMap(record,region.clientWidth,height,geometry.top,geometry.bottom);
      record.media.canvas.style.filter = `url(#${record.id})`;
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const resize = new ResizeObserver(schedule);
  resize.observe(region);
  region.addEventListener("scroll", () => { cancelAnimationFrame(frame); update(); }, { passive: true });
  region.addEventListener("focusin", schedule);
  region.addEventListener("focusout", schedule);
  owner.addEventListener("animationend", schedule);
  document.addEventListener("selectionchange", schedule);
  window.addEventListener("resize", schedule, { passive: true });
  reducedMotion.addEventListener("change", schedule);
  lensForcedColors.addEventListener("change", schedule);
  new MutationObserver(schedule).observe(region, { childList: true, subtree: true,
    attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(schedule).observe(owner, { attributes: true,
    attributeFilter: ["class", "open", "hidden", "aria-hidden"] });
  const controller = { reset, schedule };
  scrollLensControllers.set(region, controller);
  schedule();
  return controller;
};
const lensInspector = document.querySelector("[data-map-inspector]");
observeScrollLens(lensInspector, () => lensInspector.querySelectorAll(
  ".map-readout__identity h2, .map-readout__identity p, [data-map-description], .map-evidence dt, .map-evidence dd:not(:has(.case-figure)), .map-evidence__copy, .case-details h3, .case-details h4, .case-details p, .observation-preview, .map-related__header, .map-related__item > :is(strong, span)",
), { enabled: () => !lensInspector.classList.contains("has-reading-frame") });
const lensPanel = document.querySelector(".content-panel__body");
observeScrollLens(lensPanel, () => lensPanel.querySelectorAll(
  ".work-intro > *, .approach-intro > *, .work-row > :not(img), .approach-grid li > *, .contact-intro > :not(.contact-resume), .contact-links a > *",
), { owner: document.querySelector("[data-content-panel]") });
const lensSettings = document.querySelector(".settings-panel__body");
observeScrollLens(lensSettings, () => lensSettings.querySelectorAll(
  "p, h3, .settings-whoop__zones dt, .settings-whoop__zones dd, .settings-panel__privacy dt, .settings-panel__privacy dd",
), { owner: document.querySelector("[data-settings-panel]") });

const observeScrollEdges = (region, { owner = region } = {}) => {
  if (!region) return;
  let frame = 0;
  const update = () => {
    frame = 0;
    const active = region.clientHeight > 0 && region.scrollHeight > region.clientHeight + 1;
    const top = active ? Math.max(0, region.scrollTop) : 0;
    const bottom = active ? Math.max(0, region.scrollHeight - region.clientHeight - top) : 0;
    region.style.setProperty("--scroll-fade-top", Math.min(14, top) + "px");
    region.style.setProperty("--scroll-fade-bottom", Math.min(14, bottom) + "px");
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  region.addEventListener("scroll", schedule, { passive: true });
  region.addEventListener("focusin", schedule);
  owner.addEventListener("animationend", schedule);
  const resize = new ResizeObserver(schedule);
  resize.observe(region);
  const contents = new MutationObserver(() => {
    for (const child of region.children) resize.observe(child);
    schedule();
  });
  contents.observe(region, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(schedule).observe(owner, {
    attributes: true, attributeFilter: ["class", "open", "hidden"],
  });
  for (const child of region.children) resize.observe(child);
  window.addEventListener("resize", schedule, { passive: true });
  schedule();
};

observeScrollEdges(document.querySelector(".settings-panel__body"), {
  owner: document.querySelector("[data-settings-panel]"),
});
observeScrollEdges(lensPanel, { owner: document.querySelector("[data-content-panel]") });
const compactCommandViewport = pane.media("(max-width: 900px)");
const commandViewportProperties = [
  "--command-focus-left",
  "--command-focus-top",
  "--command-focus-width",
];
const clearCommandViewportPosition = () => {
  commandViewportProperties.forEach((property) => {
    document.documentElement.style.removeProperty(property);
  });
};
const setCommandGeometry = (element, group, values) => {
  for (const [name, value] of Object.entries(values)) {
    element.style.setProperty(
      `--command-${group}-${name}`,
      typeof value === "number" ? value.toFixed(2) + "px" : value,
    );
  }
};
const getCommandVisualViewport = () => {
  const viewport = pane.visualViewport;

  return {
    height: viewport?.height || pane.height,
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
    width: viewport?.width || pane.width,
  };
};
const positionDetachedCommandResults = () => {
  const dock = document.querySelector("[data-command-form]");
  const results = document.querySelector("[data-command-results]");
  const status = document.querySelector("[data-command-status]");

  if (!dock || !results) return;

  const compact = compactCommandViewport.matches;
  const focusedMobile = compact && dock.classList.contains("is-open");
  for (const element of [dock, results, status].filter(Boolean)) {
    const visible = focusedMobile && !element.hidden && (element === dock || element.classList.contains("is-open"));
    if (visible && element.showPopover) {
      element.setAttribute("popover", "manual");
      if (!element.matches(":popover-open")) element.showPopover();
    } else if (element.hasAttribute("popover")) {
      if (element.matches(":popover-open")) element.hidePopover();
      element.removeAttribute("popover");
    }
  }
  const bounds = dock.getBoundingClientRect();
  const surface = compact ? dock : dock.closest("[data-floating-console]") || dock;
  const surfaceBounds = surface.getBoundingClientRect();
  const viewport = getCommandVisualViewport();
  if (focusedMobile) {
    const visual = window.visualViewport;
    const map = document.getElementById("map-pane").getBoundingClientRect();
    viewport.left = Math.max(visual?.offsetLeft || 0, map.left);
    viewport.width = Math.max(0, Math.min((visual?.offsetLeft || 0) + (visual?.width || innerWidth), map.right) - viewport.left);
    viewport.height = visual?.height || innerHeight;
  }
  const gap = 8;
  let anchorTop = surfaceBounds.top;
  let anchorBottom = surfaceBounds.bottom;
  // Results share the console's right edge.
  const resultWidth = compact ? surfaceBounds.right - bounds.left
    : Math.max(surfaceBounds.right - bounds.left, Math.min(surfaceBounds.width, 640));
  let width = Math.min(resultWidth, Math.max(0, viewport.width - gap * 2));
  let left = Math.max(viewport.left + gap,
    Math.min(surfaceBounds.right - width, viewport.left + viewport.width - gap - width));

  if (focusedMobile) {
    anchorTop = Math.max(viewport.top + gap, viewport.top + viewport.height - bounds.height - gap);
    anchorBottom = anchorTop + bounds.height;
    left = viewport.left + gap;
    width = Math.max(0, viewport.width - gap * 2);
    setCommandGeometry(document.documentElement, "focus", { left, top: anchorTop, width });
    anchorTop = dock.getBoundingClientRect().top;
    anchorBottom = anchorTop + bounds.height;
  } else {
    clearCommandViewportPosition();
  }

  const spaceAbove = Math.max(0, anchorTop - viewport.top - gap * 2);
  const spaceBelow = Math.max(0, viewport.top + viewport.height - anchorBottom - gap * 2);

  [results, status].filter(Boolean).forEach((element) => {
    setCommandGeometry(element, "results", { left, width });

    const contentHeight = element.scrollHeight;
    const opensBelow = !focusedMobile && (contentHeight > spaceAbove && spaceBelow > spaceAbove);
    let maxHeight = opensBelow ? spaceBelow : spaceAbove;
    // A partial row signals that the list continues.
    const peek = [...element.children].map(row => row.offsetTop + row.offsetHeight / 2)
      .filter(height => height <= maxHeight).at(-1);
    if (contentHeight > maxHeight && peek) maxHeight = peek;
    element.dataset.placement = opensBelow ? "below" : "above";
    setCommandGeometry(element, "results", {
      "max-height": maxHeight,
      top: opensBelow
        ? anchorBottom + gap
        : focusedMobile
          ? anchorTop - gap - Math.min(maxHeight, contentHeight)
          : "auto",
      bottom: opensBelow || focusedMobile
        ? "auto"
        : pane.height - anchorTop + gap,
    });
  });
};
let commandPositionFrame = 0;
const scheduleDetachedCommandResultsPosition = () => {
  window.cancelAnimationFrame(commandPositionFrame);
  commandPositionFrame = window.requestAnimationFrame(
    positionDetachedCommandResults,
  );
};

pane.visualViewport?.addEventListener(
  "resize",
  scheduleDetachedCommandResultsPosition,
  { passive: true },
);
pane.visualViewport?.addEventListener(
  "scroll",
  scheduleDetachedCommandResultsPosition,
  { passive: true },
);
window.addEventListener(
  "resize",
  scheduleDetachedCommandResultsPosition,
  { passive: true },
);

const floatingConsoleModules = Array.from(document.querySelectorAll("[data-floating-console]"));
const floatingConsoleMedia = window.matchMedia(
  "(min-width: 901px) and (hover: hover) and (pointer: fine)",
);
const consoleInteractiveSelector = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "form",
  "[data-console-text]",
  "[contenteditable='true']",
].join(",");

const getConsoleOffset = (module) => ({
  x: Number.parseFloat(module.dataset.dragX || "0") || 0,
  y: Number.parseFloat(module.dataset.dragY || "0") || 0,
});

const authorCard = document.querySelector('.site-header');
const authorField = document.querySelector('.whoop-field');
const syncCompactControlGeometry = () => {
  const close = document.querySelector('#story-pane [data-close-story]');
  if (pane.width > 900) { close?.style.removeProperty('--control-target'); return; }
  const toggle = document.querySelector('[data-constellation-nav-toggle]');
  const mark = toggle?.querySelector('.constellation-nav__cluster');
  const map = document.querySelector('.map-surface');
  if (!toggle || !mark || !map || toggle.getAttribute('aria-expanded') === 'true') return;
  const button = toggle.getBoundingClientRect();
  const icon = mark.getBoundingClientRect();
  if (!button.width || !icon.width) return;
  const write = (element, name, value) => {
    const next = `${value.toFixed(2)}px`;
    if (element.style.getPropertyValue(name) !== next) element.style.setProperty(name, next);
  };
  write(map, '--compact-menu-bottom', button.bottom - map.getBoundingClientRect().top);
  const name = authorCard?.querySelector('.brand__name');
  if (name) write(authorCard, '--author-menu-text-width', Math.max(0, button.left - name.getBoundingClientRect().left));
  const inspector = document.querySelector('.map-inspector.has-reading-frame:not(.is-case-view).is-open');
  const inspectorClose = inspector?.querySelector('[data-close-inspector]');
  if (inspectorClose) write(inspector, '--compact-inspector-axis-padding', Math.max(0,
    inspector.getBoundingClientRect().right - icon.left - icon.width / 2 - inspectorClose.getBoundingClientRect().width / 2));
  const story = document.querySelector('#story-pane');
  if (story && document.body.classList.contains('has-story-pane')) {
    const right = story.getBoundingClientRect().left + story.clientLeft + story.clientWidth;
    const centre = icon.left + icon.width / 2;
    close?.style.removeProperty('--control-target');
    const target = Math.max(44, Math.min(close?.getBoundingClientRect().width || button.width, (right - centre) * 2));
    if (close && innerWidth < 1000) write(close, '--control-target', target);
    write(story, '--story-close-inset', right - centre - target / 2);
  }
};
let compactGeometryFrame = 0;
const compactGeometryResize = new ResizeObserver(() => {
  if (!compactGeometryFrame) compactGeometryFrame = requestAnimationFrame(() => { compactGeometryFrame = 0; syncCompactControlGeometry(); });
});
document.querySelectorAll('[data-constellation-nav-toggle], #story-pane').forEach(element => compactGeometryResize.observe(element));
const syncAuthorField = () => {
  if (!authorCard || !authorField) return;
  const card = authorCard.getBoundingClientRect();
  const map = authorField.parentElement.getBoundingClientRect();
  authorField.style.cssText = `left:${card.left-map.left-112}px;top:${card.top-map.top-96}px;width:${card.width+208}px;height:${card.height+192}px`;
};
const syncAuthorPresence = () => {
  if (!authorCard) return;
  const reading = document.body.classList.contains("has-content-panel")
    || document.body.classList.contains("has-settings-panel")
    || Boolean(document.querySelector(".map-inspector.is-open"));
  document.body.classList.toggle("has-reading-surface", reading);
  authorCard.inert = (reading && !document.body.classList.contains("has-contact-consoles"))
    || document.body.matches(".has-constellation-nav, .has-command-focus");
  syncAuthorField();
  syncCompactControlGeometry();
  window.dispatchEvent(new CustomEvent("author-presence-change"));
};
let authorPresenceFrame = 0;
if (authorCard) new ResizeObserver(() => {
  if (authorPresenceFrame) return;
  authorPresenceFrame = requestAnimationFrame(() => { authorPresenceFrame = 0; syncAuthorPresence(); });
}).observe(authorCard);
window.addEventListener("reading-surface-change", syncAuthorPresence);
new MutationObserver(syncAuthorPresence).observe(document.body, { attributes: true, attributeFilter: ["class"] });
const authorInspector = document.querySelector(".map-inspector");
if (authorInspector) new MutationObserver(syncAuthorPresence).observe(authorInspector, { attributes: true, attributeFilter: ["class"] });
syncAuthorPresence();

const setConsoleOffset = (module, x, y) => {
  module.dataset.dragX = x.toFixed(2);
  module.dataset.dragY = y.toFixed(2);
  module.style.setProperty("--console-drag-x", `${x.toFixed(2)}px`);
  module.style.setProperty("--console-drag-y", `${y.toFixed(2)}px`);
  if (module.classList.contains("control-console")) {
    const { top, height } = module.getBoundingClientRect();
    document.documentElement.style.setProperty("--console-clearance", `${height ? pane.height - top + y : 0}px`);
  }
  if (module === authorCard) syncAuthorField();
};

const clampConsoleOffset = (module, desiredX, desiredY, basePosition = null) => {
  const margin = 8;
  const currentOffset = getConsoleOffset(module);
  const rect = module.getBoundingClientRect();
  const baseLeft = basePosition?.left ?? rect.left - currentOffset.x;
  const baseTop = basePosition?.top ?? rect.top - currentOffset.y;
  const minimumX = margin - baseLeft;
  const maximumX = pane.width - margin - baseLeft - rect.width;
  const minimumY = margin - baseTop;
  const maximumY = pane.height - margin - baseTop - rect.height;

  return {
    x: Math.min(Math.max(desiredX, minimumX), Math.max(minimumX, maximumX)),
    y: Math.min(Math.max(desiredY, minimumY), Math.max(minimumY, maximumY)),
  };
};

floatingConsoleModules.forEach((module) => {
  module.addEventListener("pointerdown", (event) => {
    if (
      !floatingConsoleMedia.matches
      || event.button !== 0
      || event.target.closest(consoleInteractiveSelector)
    ) {
      return;
    }

    const startOffset = getConsoleOffset(module);
    const startRect = module.getBoundingClientRect();
    const basePosition = {
      left: startRect.left - startOffset.x,
      top: startRect.top - startOffset.y,
    };
    const startPointer = { x: event.clientX, y: event.clientY };
    let hasFinished = false;

    const finishDrag = (finishEvent) => {
      if (hasFinished || finishEvent.pointerId !== event.pointerId) {
        return;
      }

      hasFinished = true;
      module.classList.remove("is-dragging");
      scheduleDetachedCommandResultsPosition();
      module.removeEventListener("pointermove", moveModule);
      module.removeEventListener("pointerup", finishDrag);
      module.removeEventListener("pointercancel", finishDrag);
      module.removeEventListener("lostpointercapture", finishDrag);

      if (module.hasPointerCapture?.(event.pointerId)) {
        module.releasePointerCapture(event.pointerId);
      }
    };

    const moveModule = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) {
        return;
      }

      const nextOffset = clampConsoleOffset(
        module,
        startOffset.x + moveEvent.clientX - startPointer.x,
        startOffset.y + moveEvent.clientY - startPointer.y,
        basePosition,
      );

      moveEvent.preventDefault();
      setConsoleOffset(module, nextOffset.x, nextOffset.y);
      positionDetachedCommandResults();
    };

    event.preventDefault();
    module.classList.add("is-dragging");
    module.addEventListener("pointermove", moveModule);
    module.addEventListener("pointerup", finishDrag);
    module.addEventListener("pointercancel", finishDrag);
    module.addEventListener("lostpointercapture", finishDrag);
    module.setPointerCapture?.(event.pointerId);
  });
});

const syncConsoleBounds = () => {
  syncCompactControlGeometry();
  if (!floatingConsoleMedia.matches) {
    floatingConsoleModules.forEach((module) => setConsoleOffset(module, 0, 0));
    return;
  }

  // Resolve the navigation anchor before clamping the author column against it.
  // The header precedes the console in the DOM, including during viewport changes.
  const navigation = document.querySelector(".control-console");
  if (navigation?.getClientRects().length && pane.width > 900) {
    const offset = getConsoleOffset(navigation);
    setConsoleOffset(navigation, offset.x, offset.y);
  }

  floatingConsoleModules.forEach((module) => {
    // A hidden compact-panel has no box. Clamping that zero rect writes a
    // fictitious drag offset which used to survive when the reader closed.
    const rect = module.getBoundingClientRect();
    if (!rect.width || !rect.height || pane.width <= 900) return;
    const currentOffset = getConsoleOffset(module);
    const nextOffset = clampConsoleOffset(module, currentOffset.x, currentOffset.y);
    setConsoleOffset(module, nextOffset.x, nextOffset.y);
  });

  scheduleDetachedCommandResultsPosition();
};

const consoleResize = new ResizeObserver(() => requestAnimationFrame(syncConsoleBounds));
floatingConsoleModules.forEach(module => consoleResize.observe(module));
window.addEventListener("resize", syncConsoleBounds);
floatingConsoleMedia.addEventListener?.("change", syncConsoleBounds);

export {
  observeScrollEdges,
  observeScrollLens,
  clearScrollLenses,
  scrollRegionFromKey,
  clearCommandViewportPosition,
  compactCommandViewport,
  getConsoleOffset,
  positionDetachedCommandResults,
  scheduleDetachedCommandResultsPosition,
  setConsoleOffset,
};
