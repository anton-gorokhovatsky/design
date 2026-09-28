import { reducedMotion } from "./preferences.js";

// Runtime module 7/9: viewport UI for detached command geometry and draggable desktop consoles.
// Both ordinary panels and expanded cases use the same focused reading keys.
// This changes keyboard input only; scrolling still belongs to the native region.
const scrollRegionFromKey = (event, region, reduceMotion) => {
  if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) return;
  const maximum = region.scrollHeight - region.clientHeight;
  const step = event.key.startsWith("Page") ? region.clientHeight * 0.82 : 48;
  const top = event.key === "Home" ? 0 : event.key === "End" ? maximum
    : region.scrollTop + (["ArrowDown", "PageDown"].includes(event.key) ? step : -step);
  event.preventDefault();
  region.scrollTo({ top: Math.max(0, Math.min(maximum, top)), behavior: reduceMotion ? "auto" : "smooth" });
};

// Refract foreground content inside a fixed material frame.
const scrollLensControllers = new Map();
let scrollLensId = 0;
const lensNamespace = "http://www.w3.org/2000/svg";
const lensForcedColors = matchMedia("(forced-colors: active)");
const lensDepth = 56;
const lensBleed = 32;
// Refraction enlarges foreground content as it enters the matte edge. Keep
// baselines intact: vertical displacement clips glyphs in browser SVG pipelines.
const drawScrollLensMap = (record, width, height, top, bottom) => {
  const extent = height + lensBleed * 2;
  const textureHeight = lensDepth + lensBleed;
  // Decode each edge texture once. Replacing a PNG data URL on every scroll
  // frame made WebKit alternate between the previous and newly decoded map.
  if (record.textureWidth !== width) {
    const canvas = record.canvas;
    canvas.height = textureHeight;
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(canvas.width, textureHeight);
    for (let y = 0; y < textureHeight; y++) {
      const depth = Math.max(0, Math.min(1, 1 - (y - lensBleed) / lensDepth));
      for (let x = 0; x < canvas.width; x++) {
        const u = x / (canvas.width - 1);
        const shift = record.media ? 0 : -(u - .5) * Math.min(width * .42, 168)
          * depth ** 2 * Math.sin(Math.PI * u) ** 2;
        const offset = (y * canvas.width + x) * 4;
        pixels.data[offset] = 128 + shift / 64 * 255;
        pixels.data[offset + 1] = 128;
        pixels.data[offset + 2] = 255 * depth;
        pixels.data[offset + 3] = 255;
      }
    }
    context.putImageData(pixels, 0, 0);
    record.images[0].setAttribute("href", canvas.toDataURL());
    const flipped = context.createImageData(canvas.width, textureHeight);
    const stride = canvas.width * 4;
    for (let y = 0; y < textureHeight; y++) flipped.data.set(
      pixels.data.subarray(y * stride, (y + 1) * stride), (textureHeight - y - 1) * stride);
    context.putImageData(flipped, 0, 0);
    record.images[1].setAttribute("href", canvas.toDataURL());
    record.textureWidth = width;
  }
  // Keep displaced glyphs inside the Safari filter bounds.
  for (const primitive of [record.filter, ...record.filter.children]) {
    primitive.setAttribute("x", "0");
    primitive.setAttribute("y", -lensBleed / height);
    primitive.setAttribute("width", "1");
    primitive.setAttribute("height", extent / height);
  }
  record.displaceX.setAttribute("scale", 64 / width);
  const blur = record.media ? 2.2 : 2.6;
  record.blur.setAttribute("stdDeviation", `${blur / width} ${blur / height}`);
  record.fade.setAttribute("amplitude", record.media ? ".28" : ".72");
  record.fade.setAttribute("exponent", record.media ? "2.4" : "3.4");
  record.images.forEach((image, index) => {
    const edge = index ? bottom : top;
    const start = edge - (index ? lensDepth : lensBleed);
    const visible = edge !== null && start < height + lensBleed && start + textureHeight > -lensBleed;
    // WebKit can discard the whole filter when a merged feImage lies entirely
    // outside its bounds. Keep unused textures in bounds and merge transparency.
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
  // Meet the frame vertically before its corner begins: no angled join or ear.
  const t = Math.min(1, Math.max(upper, lower) * lensDepth / (lensDepth - g.frameRadius));
  const flare = t * t * (3 - 2 * t);
  const r = Math.min(g.radius, g.width / 2, g.height / 2);
  const dy = Math.max(0, r - Math.min(y, g.height - y));
  const corner = r - Math.sqrt(Math.max(0, r*r - dy*dy));
  return { bend, sample: y + 8 * (upper ** 2 - lower ** 2),
    left: g.left * (1 - flare) + corner,
    right: g.left + g.width + (g.portWidth - g.left - g.width) * flare - corner };
};
// Keep the raster attached to its picture so native/inertial scrolling moves
// both together. A viewport-sized copy repositioned from scroll events lags
// behind Safari's compositor and leaves torn bands at the frame boundary.
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
    // Copy the undistorted centre in one operation. Only the two narrow edge
    // bands need row sampling, even when a tall reel scrolls past the window.
    context.save();
    context.beginPath();
    context.roundRect(g.left*density,0,width,height,Math.min(g.radius*density,width/2,height/2));
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
        // Complete source rows avoid subpixel raster gaps in WebKit.
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
// Project the live iframe: cross-origin pixels cannot be sampled, and WebKit
// loses accelerated video under SVG URL filters (222757).
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
    // Bounded offsets keep the two-edge projection invertible.
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
const observeScrollLens = (region, targets, { owner = region, enabled = () => true } = {}) => {
  if (!region) return;
  const records = new Map();
  let frame = 0;
  let svg;
  const remove = (element, record) => {
    if (record.player) record.player.dispose();
    else if (record.media) record.media.dispose();
    else if (element.style.filter.includes(record.id)) {
      if (record.original) element.style.filter = record.original;
      else element.style.removeProperty("filter");
    }
    record.filter?.remove();
    resize.unobserve(element);
    records.delete(element);
  };
  const reset = () => {
    for (const [element, record] of records) remove(element, record);
    svg?.remove();
    svg = null;
  };
  const makeRecord = element => {
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
      document.body.append(svg);
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
    const record = { id, filter, canvas, original: element.style.filter,
      images: [...filter.querySelectorAll("feImage")],
      mapLayers: [...filter.querySelectorAll('feMergeNode')].slice(1),
      displaceX: filter.querySelector("feDisplacementMap"), blur: filter.querySelector("feGaussianBlur"),
      fade: filter.querySelector('[result="fade"] feFuncA'),
      media: element.matches("img, video") ? createLensMedia(element) : null };
    records.set(element, record);
    resize.observe(element);
    return record;
  };
  const update = () => {
    frame = 0;
    if (!region.isConnected || owner.hidden || owner.getAttribute("aria-hidden") === "true"
      || !enabled() || reducedMotion.matches || lensForcedColors.matches) { reset(); return; }
    const port = region.getBoundingClientRect();
    if (!port.height || region.scrollHeight <= region.clientHeight + 1) { reset(); return; }
    const active = new Set(targets());
    for (const [element, record] of records) if (!active.has(element)) remove(element, record);
    const scale = port.height / region.offsetHeight || 1;
    const top = region.scrollTop > 1;
    const bottom = region.scrollTop + region.clientHeight < region.scrollHeight - 1;
    const selection = document.getSelection();
    for (const element of active) {
      const rect = (element.matches("iframe") ? element.parentElement : element).getBoundingClientRect();
      const height = element.offsetHeight, width = element.offsetWidth;
      const selected = selection && !selection.isCollapsed
        && (element.contains(selection.anchorNode) || element.contains(selection.focusNode));
      const depths = [top && rect.top < port.top + lensDepth * scale && rect.bottom > port.top,
        bottom && rect.bottom > port.bottom - lensDepth * scale && rect.top < port.bottom];
      let record = records.get(element);
      // Materials, controls and live keyboard selection retain their native rendering.
      const control = element.closest("a, button, iframe");
      const focused = control ? control.matches(":focus-visible")
        || (element.matches("iframe") && element === document.activeElement
          && document.documentElement.dataset.focusModality === "keyboard")
        : element.contains(document.activeElement);
      if (!width || !height || !depths.some(Boolean) || selected || focused
        || element.matches("[data-material-surface], a, button, input, select, textarea")
        || element.querySelector("[data-material-surface], a, button, input, select, textarea")) {
        if (record) remove(element, record);
        continue;
      }
      record ||= makeRecord(element);
      if (record.player || record.media) {
        const geometry = { width, height, left: (rect.left-port.left)/scale,
          y: (rect.top-port.top)/scale, portWidth: region.clientWidth, portHeight: region.clientHeight,
          frameRadius: Math.min(40, parseFloat(getComputedStyle(region).borderTopLeftRadius) || 0),
          top: top ? (port.top-rect.top)/scale : null, bottom: bottom ? (port.bottom-rect.top)/scale : null,
          radius: parseFloat(getComputedStyle(element.closest(".personal-media__screen, .map-hover-preview__mosaic-main")).borderTopLeftRadius) || 0 };
        if (record.player) { record.player.draw(geometry); continue; }
        record.media.setGeometry(geometry);
        record.media.draw(true);
        drawScrollLensMap(record,region.clientWidth,height,geometry.top,geometry.bottom);
      } else drawScrollLensMap(record,width,height,
        depths[0] ? (port.top-rect.top)/scale : null, depths[1] ? (port.bottom-rect.top)/scale : null);
      (record.media?.canvas || element).style.filter = `url(#${record.id})`;
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const resize = new ResizeObserver(schedule);
  resize.observe(region);
  region.addEventListener("scroll", schedule, { passive: true });
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
  ".map-readout__identity h2, .map-readout__identity p, [data-map-description], .map-evidence dt, .map-evidence dd, .case-details h3, .case-details h4, .case-details p, .observation-preview, .map-related__header, .map-related__item > *",
), { enabled: () => !lensInspector.classList.contains("has-reading-frame") });
const lensPanel = document.querySelector(".content-panel__body");
observeScrollLens(lensPanel, () => lensPanel.querySelectorAll(
  ".work-intro > *, .approach-intro > *, .work-row > *, .approach-grid li > *, .contact-intro > :not(.contact-resume), .contact-links a > *",
), { owner: document.querySelector("[data-content-panel]") });

// Keep a short continuation cue inside text lists without reshaping cards.
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
const compactCommandViewport = window.matchMedia("(max-width: 900px)");
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
  const viewport = window.visualViewport;

  return {
    height: viewport?.height || window.innerHeight,
    left: viewport?.offsetLeft || 0,
    top: viewport?.offsetTop || 0,
    width: viewport?.width || window.innerWidth,
  };
};
const positionDetachedCommandResults = () => {
  const dock = document.querySelector("[data-command-form]");
  const results = document.querySelector("[data-command-results]");
  const status = document.querySelector("[data-command-status]");

  if (!dock || !results) {
    return;
  }

  const compact = compactCommandViewport.matches;
  const bounds = dock.getBoundingClientRect();
  const surface = compact ? dock : dock.closest("[data-floating-console]") || dock;
  const surfaceBounds = surface.getBoundingClientRect();
  const viewport = getCommandVisualViewport();
  const gap = 8;
  const edgeGap = 8;
  const focusedMobile = compact && dock.contains(document.activeElement);
  let anchorTop = surfaceBounds.top;
  let anchorBottom = surfaceBounds.bottom;
  // Align with the search segment's left edge and the console material's right edge.
  let width = Math.min(
    surfaceBounds.right - bounds.left,
    Math.max(0, viewport.width - edgeGap * 2),
  );
  let left = Math.max(
    viewport.left + edgeGap,
    Math.min(bounds.left, viewport.left + viewport.width - edgeGap - width),
  );

  if (focusedMobile) {
    anchorTop = Math.max(
      viewport.top + edgeGap,
      viewport.top + viewport.height - bounds.height - edgeGap,
    );
    anchorBottom = anchorTop + bounds.height;
    left = viewport.left + edgeGap;
    width = Math.max(0, viewport.width - edgeGap * 2);
    setCommandGeometry(document.documentElement, "focus", { left, top: anchorTop, width });
  } else {
    clearCommandViewportPosition();
  }

  const spaceAbove = Math.max(0, anchorTop - viewport.top - gap - edgeGap);
  const spaceBelow = Math.max(
    0,
    viewport.top + viewport.height - anchorBottom - gap - edgeGap,
  );

  [results, status].filter(Boolean).forEach((element) => {
    setCommandGeometry(element, "results", { left, width });

    const contentHeight = element.scrollHeight;
    // Keep the familiar placement above when it fits; otherwise use the
    // roomier side. Only the actual visible viewport may constrain the list.
    const opensBelow = !focusedMobile
      && contentHeight > spaceAbove
      && spaceBelow > spaceAbove;
    const maximumHeight = opensBelow ? spaceBelow : spaceAbove;
    element.dataset.placement = opensBelow ? "below" : "above";
    setCommandGeometry(element, "results", {
      "max-height": maximumHeight,
      top: opensBelow
        ? anchorBottom + gap
        : focusedMobile
          ? anchorTop - gap - Math.min(maximumHeight, contentHeight)
          : "auto",
      bottom: opensBelow || focusedMobile
        ? "auto"
        : window.innerHeight - anchorTop + gap,
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

window.visualViewport?.addEventListener(
  "resize",
  scheduleDetachedCommandResultsPosition,
  { passive: true },
);
window.visualViewport?.addEventListener(
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
const syncAuthorField = () => {
  if (!authorCard || !authorField) return;
  const card = authorCard.getBoundingClientRect();
  const map = authorField.parentElement.getBoundingClientRect();
  authorField.style.cssText = `left:${card.left-map.left-112}px;top:${card.top-map.top-96}px;width:${card.width+208}px;height:${card.height+192}px`;
};
if (authorCard) new ResizeObserver(syncAuthorField).observe(authorCard);

const setConsoleOffset = (module, x, y) => {
  module.dataset.dragX = x.toFixed(2);
  module.dataset.dragY = y.toFixed(2);
  module.style.setProperty("--console-drag-x", `${x.toFixed(2)}px`);
  module.style.setProperty("--console-drag-y", `${y.toFixed(2)}px`);
  if (module === authorCard) syncAuthorField();
};

const clampConsoleOffset = (module, desiredX, desiredY, basePosition = null) => {
  const margin = 8;
  const currentOffset = getConsoleOffset(module);
  const rect = module.getBoundingClientRect();
  const baseLeft = basePosition?.left ?? rect.left - currentOffset.x;
  const baseTop = basePosition?.top ?? rect.top - currentOffset.y;
  const minimumX = margin - baseLeft;
  const maximumX = window.innerWidth - margin - baseLeft - rect.width;
  const minimumY = margin - baseTop;
  const maximumY = window.innerHeight - margin - baseTop - rect.height;

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

const syncFloatingConsoleBounds = () => {
  if (!floatingConsoleMedia.matches) {
    floatingConsoleModules.forEach((module) => setConsoleOffset(module, 0, 0));
    return;
  }

  floatingConsoleModules.forEach((module) => {
    const currentOffset = getConsoleOffset(module);
    const nextOffset = clampConsoleOffset(module, currentOffset.x, currentOffset.y);
    setConsoleOffset(module, nextOffset.x, nextOffset.y);
  });

  scheduleDetachedCommandResultsPosition();
};

let consoleResizeFrame = 0;
window.addEventListener("resize", () => {
  window.cancelAnimationFrame(consoleResizeFrame);
  consoleResizeFrame = window.requestAnimationFrame(syncFloatingConsoleBounds);
});
floatingConsoleMedia.addEventListener?.("change", syncFloatingConsoleBounds);

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
