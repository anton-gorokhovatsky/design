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

// Optical refraction belongs to foreground content, never to a material surface.
// Video remains clipped by its original, stationary media frame. No layout nodes move.
const scrollLensControllers = new Map();
let scrollLensId = 0;
const lensNamespace = "http://www.w3.org/2000/svg";
const lensForcedColors = matchMedia("(forced-colors: active)");
const lensDepth = 96;
const lensBleed = 32;
// Refraction enlarges foreground content as it enters the matte edge. Keep
// baselines intact: vertical displacement clips glyphs in browser SVG pipelines.
const drawScrollLensMap = (record, width, height, top, bottom) => {
  const canvas = record.canvas;
  const extent = height + lensBleed * 2;
  const rows = Math.min(512, Math.max(32, Math.ceil(extent)));
  if (canvas.height !== rows) canvas.height = rows;
  const context = canvas.getContext("2d");
  const pixels = context.createImageData(canvas.width, rows);
  for (let y = 0; y < rows; y++) {
    const position = y / (rows - 1) * extent - lensBleed;
    const upper = top === null ? 0 : Math.max(0, Math.min(1, 1 - (position - top) / lensDepth));
    const lower = bottom === null ? 0 : Math.max(0, Math.min(1, 1 - (bottom - position) / lensDepth));
    const depth = Math.max(upper, lower);
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
  // Give displaced glyphs room beyond their paragraph's own border box.
  // Explicit primitive bounds also keep Safari from clipping at the old box.
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
  record.image.setAttribute("href", canvas.toDataURL());
};

// Safari drops SVG filters on accelerated video layers (WebKit 322588).
// Paint the existing decoder's current frame into a 2D canvas only while it
// intersects the lens. No second video, network request or playback clock.
const createLensMedia = video => {
  const moving = video.matches("video");
  const canvas = document.createElement("canvas");
  canvas.className = "scroll-lens-video";
  canvas.setAttribute("aria-hidden", "true");
  const context = canvas.getContext("2d");
  if (!context) return null;
  const source = document.createElement("canvas");
  const sourceContext = source.getContext("2d");
  if (!sourceContext) return null;
  const opacity = video.style.opacity;
  let top = null, bottom = null;
  let callback = 0;
  let disposed = false;
  const draw = (resizeOnly = false) => {
    if (disposed || (moving ? video.readyState < 2 : !video.complete || !video.naturalWidth)) return;
    const density = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(video.clientWidth * density);
    const height = Math.round(video.clientHeight * density);
    if (!width || !height) return;
    const resized = canvas.width !== width || canvas.height !== height;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
      source.width = width;
      source.height = height;
    }
    const nativeWidth = moving ? video.videoWidth : video.naturalWidth;
    const nativeHeight = moving ? video.videoHeight : video.naturalHeight;
    const scale = Math.min(width / nativeWidth, height / nativeHeight);
    const w = nativeWidth * scale, h = nativeHeight * scale;
    if (!resizeOnly || resized || !canvas.isConnected) {
      sourceContext.clearRect(0, 0, width, height);
      sourceContext.drawImage(video, (width - w) / 2, moving ? 0 : (height - h) / 2, w, h);
    }
    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0);
    // Optical sampling bends the picture inside its untouched frame. Moving
    // towards an edge magnifies it sideways and draws it into a vertical arc.
    // Sample a cached frame, not the decoder hundreds of times per repaint.
    const depthAt = (position, edge, upper) => edge === null ? 0
      : Math.max(0, Math.min(1, 1 - (upper ? position - edge : edge - position) / lensDepth));
    const sampleY = position => position + 38 * (
      depthAt(position, top, true) ** 2 - depthAt(position, bottom, false) ** 2);
    for (let y = 0; y < height; y++) {
      const position = (y + .5) / density;
      const depth = Math.max(depthAt(position, top, true), depthAt(position, bottom, false));
      if (!depth) continue;
      const zoom = 1 + .7 * depth ** 2;
      const sy = Math.max(0, Math.min(height - 1, sampleY(y / density) * density));
      const sh = Math.max(.1, Math.min(height - sy,
        sampleY((y + 1) / density) * density - sy));
      context.clearRect(0, y, width, 1);
      context.drawImage(source, (width - width / zoom) / 2, sy, width / zoom, sh,
        0, y, width, 1);
    }
    if (!canvas.isConnected) video.after(canvas);
    video.style.opacity = "0";
  };
  const tick = () => {
    callback = 0;
    if (disposed || !moving) return;
    if (!document.hidden) draw();
    if (video.requestVideoFrameCallback) callback = video.requestVideoFrameCallback(tick);
    else if (!video.paused) callback = requestAnimationFrame(tick);
  };
  const refresh = () => { draw(); if (!callback) tick(); };
  for (const event of ["load", "loadeddata", "seeked", "play"]) video.addEventListener(event, refresh);
  refresh();
  return { canvas, draw, setEdges(upper, lower) { top = upper; bottom = lower; }, dispose() {
    disposed = true;
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(callback);
    else cancelAnimationFrame(callback);
    for (const event of ["load", "loadeddata", "seeked", "play"]) video.removeEventListener(event, refresh);
    video.style.opacity = opacity;
    canvas.remove();
  } };
};
// A cross-origin player cannot be sampled into canvas. WebKit also loses its
// accelerated layer under an SVG URL filter (222757). Project the one live
// browsing context inside its fixed clip instead; native hit testing follows it.
const createLensPlayer = element => {
  const transform = element.style.transform, origin = element.style.transformOrigin;
  const frost = document.createElement("span");
  frost.className = "scroll-lens-frost";
  frost.setAttribute("aria-hidden", "true");
  element.after(frost);
  element.style.transformOrigin = "50% 0";
  return { draw(top, bottom, height) {
    const strength = edge => edge === null ? 0 : Math.max(0, Math.min(1, 1 + Math.min(0, edge) / lensDepth));
    const upper = strength(top), lower = strength(bottom === null ? null : height - bottom);
    const y0 = top === null ? 0 : Math.max(0, Math.min(height - 1, top));
    const y1 = bottom === null ? height : Math.max(y0 + 1, Math.min(height, bottom));
    const span = y1 - y0, z0 = 1 + .7 * upper ** 2, z1 = 1 + .7 * lower ** 2;
    const s0 = y0 + Math.min(38 * upper ** 2, span * .3);
    const s1 = y1 - Math.min(38 * lower ** 2, span * .3);
    // One continuous projection also covers short windows with both edges active.
    // The bounded source offsets keep it invertible at the last visible pixel.
    const c = (z1 - z0) / span, d = z0 - c * y0;
    const a = (s1 * z1 - s0 * z0) / span, b = s0 * z0 - a * y0;
    element.style.transform = `matrix3d(${a*d-b*c},0,0,0,0,${d},0,${-c},0,0,1,0,0,${-b},0,${a})`;
    const masks = [];
    if (top !== null) masks.push(`linear-gradient(#000 ${top}px, transparent ${top+lensDepth}px)`);
    if (bottom !== null) masks.push(`linear-gradient(transparent ${bottom-lensDepth}px, #000 ${bottom}px)`);
    frost.style.maskImage = masks.join(",");
    frost.style.webkitMaskImage = masks.join(",");
  }, dispose() {
    element.style.transform = transform;
    element.style.transformOrigin = origin;
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
    filter.innerHTML = `<feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map"/>
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
      image: filter.querySelector("feImage"),
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
      if (record.player) {
        record.player.draw(depths[0] ? (port.top - rect.top) / scale : null,
          depths[1] ? (port.bottom - rect.top) / scale : null, height);
        continue;
      }
      drawScrollLensMap(record, width, height,
        depths[0] ? (port.top - rect.top) / scale : null,
        depths[1] ? (port.bottom - rect.top) / scale : null);
      record.media?.setEdges(depths[0] ? (port.top - rect.top) / scale : null,
        depths[1] ? (port.bottom - rect.top) / scale : null);
      record.media?.draw(true);
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
const compactCommandViewport = window.matchMedia("(max-width: 680px)");
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
  "(min-width: 681px) and (hover: hover) and (pointer: fine)",
);
const consoleInteractiveSelector = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "form",
  "[contenteditable='true']",
].join(",");

const getConsoleOffset = (module) => ({
  x: Number.parseFloat(module.dataset.dragX || "0") || 0,
  y: Number.parseFloat(module.dataset.dragY || "0") || 0,
});

const setConsoleOffset = (module, x, y) => {
  module.dataset.dragX = x.toFixed(2);
  module.dataset.dragY = y.toFixed(2);
  module.style.setProperty("--console-drag-x", `${x.toFixed(2)}px`);
  module.style.setProperty("--console-drag-y", `${y.toFixed(2)}px`);
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
